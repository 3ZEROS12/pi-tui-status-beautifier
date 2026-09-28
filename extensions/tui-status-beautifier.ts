import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";

// Mapping of internal package names to clean human-readable TUI status names
const COMMON_NAMES: Record<string, string> = {
  plannotator: "plan",
  "plannotator-review": "plan",
  "pi-mcp-adapter": "mcp",
  "subagent-slash": "subagent",
  "subagent-slash-text": "subagent",
  "pi-wechat-assistant": "wechat",
  "wechat-assistant": "wechat",
  "pi-control-chrome": "chrome",
  chrome: "chrome",
  toolflow: "toolflow",
};

export interface CustomStyleConfig {
  prefix?: string;
  suffix?: string;
  separator?: string;
  brackets?: [string, string];
  inverse?: boolean;
  padName?: boolean;
  glyphs?: {
    success?: string;
    warning?: string;
    error?: string;
    accent?: string;
  };
}

const BUILTIN_PRESETS: Record<string, CustomStyleConfig> = {
  stream: {
    separator: " ❯ ",
  },
  powerline: {
    brackets: ["‹", "›"],
    separator: " ",
    glyphs: {
      success: "◆",
      warning: "◌",
      error: "▲",
      accent: "◈",
    },
  },
  matrix: {
    brackets: ["⦗", "⦘"],
    separator: " ",
    glyphs: {
      success: "✦",
      warning: "◍",
      error: "✖",
      accent: "✧",
    },
  },
  glow: {
    brackets: ["[", "]"],
    inverse: true,
  },
  // Backward-compatible aliases
  minimal: {
    separator: " ❯ ",
    padName: true,
  },
  glass: {
    brackets: ["‹", "›"],
    separator: " ",
    glyphs: {
      success: "◆",
      warning: "◌",
      error: "▲",
      accent: "◈",
    },
  },
};

const VALID_STYLES = ["stream", "powerline", "matrix", "glow", "minimal", "glass", "custom", "off"] as const;
const OFF_STYLES = new Set(["off", "default", "none", "raw", "vanilla", "disable", "disabled"]);

// Store original statuses to allow dynamic redrawing on configuration changes.
const originalStatuses = new Map<string, string | undefined>();

// State Cache for Dirty-Checking
const lastRenderedStatus = new Map<string, string | undefined>();

// Safe, non-backtracking ReDoS-mitigated ANSI escape sequence matcher (supporting ; and :)
const ANSI_STRIP_REGEX =
  /[\u001B\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

// Hoisted regex patterns to prevent instantiation and GC overhead in the render hot-path
const STATUS_PATTERN =
  /[🟢🔴🟡⚪⏸✅❌✓✗?✔✖☑☐◆📋⌬★✦◇»«‹›⦗⦘]|[0-9]+\/[0-9]+|active|online|offline|running|paused|error|success|connected|disconnected|ready|idle|ok|done|failed|waiting|stopped|listening|cleanup|starting/i;
const NAME_SUFFIX_PATTERN = /-(extension|plugin|assistant|adapter|slash-text|slash|text|widget)$/gi;
const FRACTION_PATTERN = /(\d+\/\d+|\d+%\s*)/;
const PARENTHESES_PATTERN = /\((\d+)\)/;
const BRACKET_PATTERN = /\[(\d+)\]/;
const NUMBER_PATTERN = /\b(\d+)\b/;

let currentStyle = "minimal";
let fullFooterEnabled = false;
let customStyleConfig: CustomStyleConfig | undefined;

/**
 * Resolves configuration hierarchically:
 * Project-level `./.pi/settings.json` takes priority over global `~/.pi/agent/settings.json`
 */
export function loadConfig(cwd: string = process.cwd()): {
  style: string;
  fullFooter: boolean;
  custom?: CustomStyleConfig;
  targetSettingsPath: string;
} {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const globalPath = path.join(home, ".pi/agent/settings.json");
  const localPath = path.join(cwd, ".pi/settings.json");

  let resolvedStyle = "minimal";
  let resolvedFullFooter = false;
  let resolvedCustom: CustomStyleConfig | undefined;
  let hasLocalConfig = false;

  // 1. Read global settings
  try {
    if (fs.existsSync(globalPath)) {
      const data = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
      if (data.beautifier) {
        if (typeof data.beautifier.style === "string") {
          const s = data.beautifier.style.toLowerCase().trim();
          if (OFF_STYLES.has(s)) {
            resolvedStyle = "off";
          } else if ((VALID_STYLES as readonly string[]).includes(s)) {
            resolvedStyle = s;
          }
        }
        if (typeof data.beautifier.fullFooter === "boolean") {
          resolvedFullFooter = data.beautifier.fullFooter;
        }
        if (data.beautifier.custom && typeof data.beautifier.custom === "object") {
          resolvedCustom = data.beautifier.custom;
        }
      }
    }
  } catch (_) {}

  // 2. Project-level override (inherits and overrides global)
  try {
    if (fs.existsSync(localPath)) {
      const data = JSON.parse(fs.readFileSync(localPath, "utf-8"));
      if (data.beautifier) {
        hasLocalConfig = true;
        if (typeof data.beautifier.style === "string") {
          const s = data.beautifier.style.toLowerCase().trim();
          if (OFF_STYLES.has(s)) {
            resolvedStyle = "off";
          } else if ((VALID_STYLES as readonly string[]).includes(s)) {
            resolvedStyle = s;
          }
        }
        if (typeof data.beautifier.fullFooter === "boolean") {
          resolvedFullFooter = data.beautifier.fullFooter;
        }
        if (data.beautifier.custom && typeof data.beautifier.custom === "object") {
          resolvedCustom = { ...(resolvedCustom || {}), ...data.beautifier.custom };
        }
      }
    }
  } catch (_) {}

  currentStyle = resolvedStyle;
  fullFooterEnabled = resolvedFullFooter;
  customStyleConfig = resolvedCustom;

  // Target path for atomic write: local project if exists or in project directory, otherwise global
  const targetSettingsPath = hasLocalConfig || fs.existsSync(localPath) ? localPath : globalPath;
  return { style: resolvedStyle, fullFooter: resolvedFullFooter, custom: resolvedCustom, targetSettingsPath };
}

loadConfig();

// Clean status text and map state and details
export function beautifyStatus(
  key: string,
  originalVal: string | undefined,
  theme: any,
  style: string,
  customCfg?: CustomStyleConfig
): string | undefined {
  if (originalVal === undefined) return undefined;
  if (style === "off" || OFF_STYLES.has((style || "").toLowerCase().trim())) return originalVal;

  try {
    const hasAnsi = originalVal.includes("\u001B") || originalVal.includes("\u009B");
    const cleanVal = hasAnsi ? originalVal.replace(ANSI_STRIP_REGEX, "").trim() : originalVal.trim();

    if (cleanVal === "") return "";

    if (!STATUS_PATTERN.test(cleanVal)) {
      return originalVal;
    }

    // 1. Get display name (compact natural width by default to save precious terminal columns)
    let name = key.toLowerCase();
    if (COMMON_NAMES[name]) {
      name = COMMON_NAMES[name];
    } else {
      const lastSlash = name.lastIndexOf("/");
      if (lastSlash !== -1) {
        name = name.slice(lastSlash + 1);
      }
      name = name.replace(NAME_SUFFIX_PATTERN, "").toLowerCase();
      if (COMMON_NAMES[name]) {
        name = COMMON_NAMES[name];
      }
    }
    const preset =
      style === "custom"
        ? (customCfg || customStyleConfig || {})
        : (BUILTIN_PRESETS[style] || BUILTIN_PRESETS.stream);

    const visualName = preset.padName === true
      ? padToVisualWidth(sliceToVisualWidth(name, 10), 10)
      : name;

    // 2. Extract metrics/progress details safely (e.g. (2) or fraction 2/5 or count)
    let details: string | undefined;
    const fractionMatch = cleanVal.match(FRACTION_PATTERN);
    if (fractionMatch) {
      details = fractionMatch[1];
    } else {
      const countMatch = cleanVal.match(PARENTHESES_PATTERN) || cleanVal.match(BRACKET_PATTERN);
      if (countMatch) {
        details = countMatch[1];
      } else {
        const numberMatch = cleanVal.match(NUMBER_PATTERN);
        if (numberMatch) {
          details = numberMatch[1];
        } else {
          // If no numeric metric exists, extract the status word descriptor (e.g. "ready", "idle", "cleanup")
          const wordMatch = cleanVal.match(
            /(?::\s*|\b)(ready|idle|ok|done|failed|waiting|cleanup|active|online|offline|running|paused|error|success|connected|disconnected)\b/i
          );
          if (wordMatch) {
            details = wordMatch[1].toLowerCase();
          }
        }
      }
    }

    // 3. Determine state based on colors, icons, emojis or text keywords in original val
    let state: "success" | "warning" | "error" | "accent" = "success";
    const valLower = cleanVal.toLowerCase();

    if (
      valLower.includes("❌") ||
      valLower.includes("🔴") ||
      valLower.includes("✗") ||
      valLower.includes("offline") ||
      valLower.includes("error") ||
      valLower.includes("failed") ||
      valLower.includes("stopped")
    ) {
      state = "error";
    } else if (
      valLower.includes("⏸") ||
      valLower.includes("🟡") ||
      valLower.includes("?") ||
      valLower.includes("warning") ||
      valLower.includes("pause") ||
      valLower.includes("planning") ||
      valLower.includes("plan") ||
      valLower.includes("waiting") ||
      valLower.includes("cleanup")
    ) {
      state = "warning";
    } else if (
      valLower.includes("🟢") ||
      valLower.includes("✅") ||
      valLower.includes("✓") ||
      valLower.includes("online") ||
      valLower.includes("success") ||
      valLower.includes("ready") ||
      valLower.includes("idle") ||
      valLower.includes("ok") ||
      valLower.includes("done")
    ) {
      state = "success";
    } else {
      state = name === "plan" ? "accent" : "success";
    }

    // 4. Determine state glyph & indicator
    const glyphMap = preset.glyphs || {};
    let glyph =
      glyphMap[state] ||
      (state === "warning" ? "◌" : state === "error" ? "▲" : state === "accent" ? "◆" : "●");

    const hasThemeFg = theme && typeof theme.fg === "function";
    const coloredGlyph = hasThemeFg ? theme.fg(state, glyph) : glyph;
    const dimmedName = hasThemeFg ? theme.fg("muted", visualName) : visualName;

    const openBracket = preset.brackets?.[0] ?? "";
    const closeBracket = preset.brackets?.[1] ?? "";
    const prefix = preset.prefix ?? "";
    const suffix = preset.suffix ?? "";
    const sep = preset.separator ?? (preset.brackets ? " " : " ❯ ");

    // Inverse pill badge (glow preset)
    if (preset.inverse && theme && typeof theme.inverse === "function") {
      const pillContent = ` ${glyph}${details ? ` ${details}` : ""} `;
      const coloredBadge = hasThemeFg ? theme.inverse(theme.fg(state, pillContent)) : `[${pillContent}]`;
      return `${prefix}${dimmedName} ${coloredBadge}${suffix}`;
    }

    let badge = coloredGlyph;
    if (details) {
      badge = `${coloredGlyph} ${details}`;
    }
    if (openBracket && closeBracket) {
      const styledOpen = hasThemeFg ? theme.fg("dim", openBracket) : openBracket;
      const styledClose = hasThemeFg ? theme.fg("dim", closeBracket) : closeBracket;
      badge = `${styledOpen}${badge}${styledClose}`;
    } else if (details && !preset.brackets) {
      const detailStr = hasThemeFg ? theme.fg("dim", ` (${details})`) : ` (${details})`;
      badge = `${coloredGlyph}${detailStr}`;
    }

    const styledSep =
      hasThemeFg && (sep.includes("│") || sep.includes("⁝") || sep.includes("❯") || sep.includes("»"))
        ? theme.fg("dim", sep)
        : sep;

    return `${prefix}${dimmedName}${styledSep}${badge}${suffix}`;
  } catch (_error) {
    return originalVal;
  }
}

/**
 * Calculates the visual column cell width of a string, taking into account
 * full-width Unicode characters, East Asian ideographs, Kana, Hangul, emojis, and zero-width joiners.
 */
export function getStringWidth(str: string): number {
  if (!str) return 0;
  const clean = str.replace(ANSI_STRIP_REGEX, "");
  let width = 0;

  for (const char of clean) {
    const code = char.codePointAt(0) || 0;

    if (
      code === 0x200d ||
      code === 0xfe0f ||
      code === 0xfe0e ||
      (code >= 0x0300 && code <= 0x036f) ||
      (code >= 0x200b && code <= 0x200f)
    ) {
      continue;
    }

    if (isFullWidth(code)) {
      width += 2;
    } else {
      width += 1;
    }
  }

  return width;
}

/**
 * Checks if a character unicode code point is full-width (East Asian Width).
 */
export function isFullWidth(code: number): boolean {
  if (isNaN(code)) return false;
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0x3247 && code !== 0x303f) || // CJK Radicals
    (code >= 0x3040 && code <= 0x309f) || // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) || // Katakana
    (code >= 0x3250 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x4e00 && code <= 0xa4c6) || // CJK Unified Ideographs .. Yi
    (code >= 0xa960 && code <= 0xa97c) || // Hangul Jamo Extended-A
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xfe10 && code <= 0xfe19) || // Vertical Forms
    (code >= 0xfe30 && code <= 0xfe6b) || // CJK Compatibility Forms
    (code >= 0xff01 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth Symbols
    (code >= 0x1f300 && code <= 0x1f9ff) || // Emojis & Pictographs
    (code >= 0x1f600 && code <= 0x1f64f) || // Emoticons
    (code >= 0x1f680 && code <= 0x1f6ff) || // Transport & Map
    (code >= 0x2600 && code <= 0x27bf) || // Dingbats & Misc
    (code >= 0x1fa70 && code <= 0x1faff) || // Symbols Extended-A
    (code >= 0x20000 && code <= 0x3fffd) // CJK Extensions B/C/D
  );
}

/**
 * Slices a string to a maximum visual cell width without cutting surrogate pairs in half.
 */
export function sliceToVisualWidth(str: string, maxWidth: number): string {
  let width = 0;
  let sliced = "";

  for (const char of str) {
    const code = char.codePointAt(0) || 0;
    const charWidth =
      code === 0x200d ||
      code === 0xfe0f ||
      code === 0xfe0e ||
      (code >= 0x0300 && code <= 0x036f) ||
      (code >= 0x200b && code <= 0x200f)
        ? 0
        : isFullWidth(code)
          ? 2
          : 1;

    if (width + charWidth > maxWidth) {
      break;
    }
    width += charWidth;
    sliced += char;
  }

  return sliced;
}

/**
 * Pads a string's visual cell width to target width with trailing spaces.
 */
export function padToVisualWidth(str: string, targetWidth: number, padChar = " "): string {
  const currentWidth = getStringWidth(str);
  if (currentWidth >= targetWidth) {
    return str;
  }
  return str + padChar.repeat(targetWidth - currentWidth);
}

/**
 * Full-Footer Renderer (Hooked via ctx.ui.setFooter)
 * Formats working folder, Git branch, token metrics, and active model on Line 1,
 * and formats all extension statuses on Line 2.
 */
export function renderBeautifiedFooter(
  width: number,
  _tui: any,
  theme: any,
  footerData: any,
  ctx: any,
  style: string,
  customCfg?: CustomStyleConfig
): string[] {
  const preset =
    style === "custom"
      ? (customCfg || customStyleConfig || {})
      : (BUILTIN_PRESETS[style] || BUILTIN_PRESETS.minimal);

  const hasThemeFg = theme && typeof theme.fg === "function";
  const sep = preset.separator || (preset.brackets ? " " : " ❯ ");
  const styledSep =
    hasThemeFg && (sep.includes("│") || sep.includes("⁝") || sep.includes("❯") || sep.includes("»"))
      ? theme.fg("dim", sep)
      : sep;

  // 1. Folder & Git branch
  const branch = typeof footerData?.getGitBranch === "function" ? footerData.getGitBranch() : "";
  const folder = path.basename(ctx?.cwd || process.cwd()) || "workspace";
  const branchPart = branch ? `${folder} (${branch})` : folder;
  const styledBranch = hasThemeFg ? theme.fg("dim", branchPart) : branchPart;

  // 2. Model
  const modelName = ctx?.model?.name || ctx?.model?.id || "";
  const styledModel = modelName ? (hasThemeFg ? theme.fg("muted", modelName) : modelName) : "";

  // 3. Token metrics & context usage (full fidelity matching native Pi footer)
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0, cost = 0;
  let latestCacheHitRate: number | undefined;

  if (ctx?.sessionManager?.getEntries) {
    try {
      for (const entry of ctx.sessionManager.getEntries()) {
        if (entry.type === "usage" && entry.usage) {
          input += entry.usage.input || 0;
          output += entry.usage.output || 0;
          cacheRead += entry.usage.cacheRead || 0;
          cacheWrite += entry.usage.cacheWrite || 0;
          cost += entry.usage.cost?.total || 0;
        } else if (entry.type === "message" && entry.message?.role === "assistant" && entry.message?.usage) {
          const u = entry.message.usage;
          input += u.input || 0;
          output += u.output || 0;
          cacheRead += u.cacheRead || 0;
          cacheWrite += u.cacheWrite || 0;
          cost += u.cost?.total || 0;
          const promptTokens = (u.input || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0);
          if (promptTokens > 0 && u.cacheRead) {
            latestCacheHitRate = (u.cacheRead / promptTokens) * 100;
          }
        }
      }
    } catch (_) {}
  }

  const fmt = (n: number) => {
    if (n < 1000) return `${n}`;
    if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
    if (n < 1000000) return `${Math.round(n / 1000)}k`;
    if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
    return `${Math.round(n / 1000000)}M`;
  };

  const statParts: string[] = [];
  if (input > 0) statParts.push(`↑${fmt(input)}`);
  if (output > 0) statParts.push(`↓${fmt(output)}`);
  if (cacheRead > 0) statParts.push(`R${fmt(cacheRead)}`);
  if (latestCacheHitRate !== undefined) statParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
  if (cost > 0) statParts.push(`$${cost.toFixed(3)}`);

  const contextUsage = ctx?.getContextUsage?.();
  const contextWindow = contextUsage?.contextWindow || ctx?.model?.contextWindow || 0;
  if (contextUsage?.percent !== undefined && contextUsage?.percent !== null) {
    statParts.push(`${contextUsage.percent.toFixed(1)}%/${fmt(contextWindow)} (auto)`);
  }

  const tokenStr = statParts.join(" ");
  const styledTokens = tokenStr ? (hasThemeFg ? theme.fg("dim", tokenStr) : tokenStr) : "";

  // Thinking level
  const thinking = ctx?.thinkingLevel && ctx.thinkingLevel !== "off" ? ` • ${ctx.thinkingLevel}` : "";
  const fullModelStr = styledModel ? `${styledModel}${hasThemeFg ? theme.fg("dim", thinking) : thinking}` : "";

  // Left & right parts of Line 1
  const leftText = styledBranch;
  const rightParts = [styledTokens, fullModelStr].filter(Boolean);
  const rightText = rightParts.join(styledSep);

  const leftVis = getStringWidth(leftText);
  const rightVis = getStringWidth(rightText);
  const padLen = Math.max(1, width - leftVis - rightVis);
  const line1 = leftText + " ".repeat(padLen) + rightText;

  const lines = [line1];

  // Line 2: Extension status badges
  const extStatuses: Array<[string, string]> = [];
  if (footerData && typeof footerData.getExtensionStatuses === "function") {
    try {
      const map = footerData.getExtensionStatuses();
      if (map && typeof map.entries === "function") {
        for (const [k, v] of map.entries()) {
          if (v) extStatuses.push([k, v]);
        }
      }
    } catch (_) {}
  }
  if (extStatuses.length === 0) {
    for (const [k, v] of originalStatuses.entries()) {
      if (v) extStatuses.push([k, v]);
    }
  }

  if (extStatuses.length > 0) {
    const badges = extStatuses
      .map(([k, v]) => beautifyStatus(k, v, theme, style, customCfg))
      .filter(Boolean) as string[];
    if (badges.length > 0) {
      lines.push(badges.join("  "));
    }
  }

  return lines;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI || !ctx.ui) return;

    loadConfig(ctx.cwd || process.cwd());

    originalStatuses.clear();
    lastRenderedStatus.clear();

    // 1. Hook setStatus for clean status badge formatting (always active unless style === "off")
    const originalSetStatus = ctx.ui.setStatus;
    if (originalSetStatus && !(originalSetStatus as any).__beautifierHooked) {
      const wrapped = function (key: string, value: string | undefined) {
        originalStatuses.set(key, value);

        const beautified = beautifyStatus(key, value, ctx.ui.theme, currentStyle);

        const cacheKey = `${key}:${currentStyle}`;
        if (lastRenderedStatus.get(cacheKey) === beautified) {
          return;
        }
        lastRenderedStatus.set(cacheKey, beautified);

        return originalSetStatus.call(ctx.ui, key, beautified);
      };
      (wrapped as any).__beautifierHooked = true;
      ctx.ui.setStatus = wrapped;
    }

    // 2. Hook setFooter ONLY if user explicitly opted in with fullFooter === true!
    // By default fullFooter is FALSE: Pi's native top two lines remain 100% native and untouched!
    if (fullFooterEnabled && currentStyle !== "off" && typeof (ctx.ui as any).setFooter === "function") {
      (ctx.ui as any).setFooter((tui: any, theme: any, footerData: any) => {
        const unsub =
          typeof footerData?.onBranchChange === "function"
            ? footerData.onBranchChange(() => tui.requestRender())
            : undefined;

        return {
          dispose: unsub,
          invalidate() {},
          render(width: number): string[] {
            if (currentStyle === "off" || !fullFooterEnabled) return [];
            return renderBeautifiedFooter(width, tui, theme, footerData, ctx, currentStyle, customStyleConfig);
          },
        };
      });
    } else if (typeof (ctx.ui as any).setFooter === "function") {
      (ctx.ui as any).setFooter(undefined); // Restore native Pi footer
    }
  });

  // Dynamic status bar style controller registry
  pi.registerCommand("beautify", {
    description: "Choose TUI status bar beautification style or generate a custom style with AI",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI || !ctx.ui) {
        return;
      }

      const styleOptions = [
        "stream    - Clean chevron stream (e.g. name ❯ ● ready)",
        "powerline - Angled brackets & diamonds (e.g. name ‹◆ ready›)",
        "matrix    - Dot-matrix brackets & stars (e.g. name ⦗✦ ready⦘)",
        "glow      - High-contrast inverse pill (e.g. name [ ● ready ])",
        "custom    - [AI Prompt Recipe] Let your agent tailor your bespoke style",
        `footer    - Toggle Full-Footer beautification (Git/Model/Tokens) [Currently: ${fullFooterEnabled ? "ON" : "OFF"}]`,
        "off       - Revert to native Pi status bar & clean settings",
      ];

      const choice = await ctx.ui.select(`Choose status style (Current: ${currentStyle}):`, styleOptions);

      if (!choice) return;

      const styleKey = choice.split(" ")[0].trim();

      if (styleKey === "footer") {
        fullFooterEnabled = !fullFooterEnabled;
        const { targetSettingsPath } = loadConfig(ctx.cwd || process.cwd());
        try {
          if (fs.existsSync(targetSettingsPath)) {
            const data = fs.readFileSync(targetSettingsPath, "utf-8");
            const config = JSON.parse(data);
            if (!config.beautifier) config.beautifier = {};
            config.beautifier.fullFooter = fullFooterEnabled;
            const tempSettings = `${targetSettingsPath}.tmp.${process.pid}.${Date.now()}`;
            fs.writeFileSync(tempSettings, JSON.stringify(config, null, 2), "utf-8");
            fs.renameSync(tempSettings, targetSettingsPath);
          }
        } catch (_) {}

        if (fullFooterEnabled && currentStyle !== "off" && typeof (ctx.ui as any).setFooter === "function") {
          (ctx.ui as any).setFooter((tui: any, theme: any, footerData: any) => {
            const unsub = typeof footerData?.onBranchChange === "function" ? footerData.onBranchChange(() => tui.requestRender()) : undefined;
            return {
              dispose: unsub,
              invalidate() {},
              render(width: number): string[] {
                if (currentStyle === "off" || !fullFooterEnabled) return [];
                return renderBeautifiedFooter(width, tui, theme, footerData, ctx, currentStyle, customStyleConfig);
              }
            };
          });
        } else if (typeof (ctx.ui as any).setFooter === "function") {
          (ctx.ui as any).setFooter(undefined);
        }

        ctx.ui.notify(`Full-footer beautification is now ${fullFooterEnabled ? "ENABLED" : "DISABLED (Native Pi Footer)"}`, "info");
        return;
      }

      if (styleKey === "off") {
        currentStyle = "off";
        customStyleConfig = undefined;
        lastRenderedStatus.clear();

        // Restore all raw original statuses immediately
        for (const [key, val] of originalStatuses.entries()) {
          ctx.ui.setStatus(key, val);
        }

        // Zero-trace physical cleanup: completely prune the `beautifier` key from settings.json!
        const { targetSettingsPath } = loadConfig(ctx.cwd || process.cwd());
        try {
          if (fs.existsSync(targetSettingsPath)) {
            const data = fs.readFileSync(targetSettingsPath, "utf-8");
            const config = JSON.parse(data);
            if (config.beautifier) {
              delete config.beautifier;
              const tempSettings = `${targetSettingsPath}.tmp.${process.pid}.${Date.now()}`;
              fs.writeFileSync(tempSettings, JSON.stringify(config, null, 2), "utf-8");
              fs.renameSync(tempSettings, targetSettingsPath);
            }
          }
        } catch (_e) {
          // Silently ignore disk write errors
        }

        ctx.ui.notify("Reverted to native Pi status bar. Cleaned up settings.json.", "info");
        return;
      }

      if (styleKey === "custom") {
        const promptRecipe = [
          "You are acting as my Pi TUI Status Bar designer for `pi-tui-status-beautifier`.",
          "1. In my primary language, call `ask_user_question` with ASCII visual preview mockups showing ONLY realistic extension statuses (e.g. `chrome`, `toolflow`, `plan`):",
          "   - Powerline:  chrome ‹◆ ready›  |  toolflow ‹◈ 2/5›",
          "   - Matrix:     chrome ⦗✦ ready⦘  |  toolflow ⦗◍ 2/5⦘",
          "   - Stream:     chrome ❯ ● ready  |  toolflow ❯ ◐ 2/5",
          "   - Glow:       chrome [ ● ready ]  |  toolflow [ ◐ 2/5 ]",
          "   (Do NOT include git branch or model name in mockups).",
          "2. If I describe or pick a style, write the configuration into `./.pi/settings.json` (or `~/.pi/agent/settings.json`) under `beautifier`:",
          "   {",
          '     "beautifier": {',
          '       "style": "custom",',
          '       "custom": {',
          '         "separator": " » ",',
          '         "brackets": ["«", "»"],',
          '         "prefix": "",',
          '         "suffix": "",',
          '         "glyphs": { "success": "✦", "warning": "◇", "error": "✖", "accent": "✧" }',
          "       }",
          "     }",
          "   }",
          "3. If I say revert, restore, default, off, or cancel, DELETE the `beautifier` key from `settings.json` and exit quietly without asking more questions.",
          "4. Do NOT search filesystem or edit extension source files."
        ].join("\n");

        if (typeof (ctx.ui as any).setEditorText === "function") {
          (ctx.ui as any).setEditorText(promptRecipe);
          ctx.ui.notify("Press Enter to let your agent consult your style preference with visual previews!", "info");
        } else {
          ctx.ui.notify(promptRecipe, "info");
        }
        return;
      }

      if ((VALID_STYLES as readonly string[]).includes(styleKey)) {
        currentStyle = styleKey;
        lastRenderedStatus.clear();
        ctx.ui.notify(`TUI status style changed to: ${styleKey}`, "info");

        const { targetSettingsPath } = loadConfig(ctx.cwd || process.cwd());

        try {
          if (fs.existsSync(targetSettingsPath)) {
            const data = fs.readFileSync(targetSettingsPath, "utf-8");
            const config = JSON.parse(data);
            if (!config.beautifier) config.beautifier = {};
            config.beautifier.style = styleKey;
            const tempSettings = `${targetSettingsPath}.tmp.${process.pid}.${Date.now()}`;
            fs.writeFileSync(tempSettings, JSON.stringify(config, null, 2), "utf-8");
            fs.renameSync(tempSettings, targetSettingsPath);
          }
        } catch (_e) {
          // Silently ignore disk write errors
        }

        for (const [key, val] of originalStatuses.entries()) {
          ctx.ui.setStatus(key, val);
        }
      }
    },
  });
}
