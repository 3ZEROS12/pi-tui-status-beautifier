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
};

export interface CustomStyleConfig {
  prefix?: string;
  suffix?: string;
  separator?: string;
  brackets?: [string, string];
  inverse?: boolean;
  glyphs?: {
    success?: string;
    warning?: string;
    error?: string;
    accent?: string;
  };
}

const BUILTIN_PRESETS: Record<string, CustomStyleConfig> = {
  minimal: {
    separator: " ❯ "
  },
  glass: {
    prefix: "▕ ",
    suffix: " ▏",
    separator: " "
  },
  glow: {
    brackets: ["[", "]"],
    inverse: true
  }
};

const VALID_STYLES = ["minimal", "glass", "glow", "custom", "off"] as const;

// Store original statuses to allow dynamic redrawing on configuration changes.
const originalStatuses = new Map<string, string | undefined>();

// State Cache for Dirty-Checking
const lastRenderedStatus = new Map<string, string | undefined>();

// Safe, non-backtracking ReDoS-mitigated ANSI escape sequence matcher (supporting ; and :)
const ANSI_STRIP_REGEX =
  /[\u001B\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

// Hoisted regex patterns to prevent instantiation and GC overhead in the render hot-path
const STATUS_PATTERN =
  /[🟢🔴🟡⚪⏸✅❌✓✗?✔✖☑☐◆📋⌬]|[0-9]+\/[0-9]+|active|online|offline|running|paused|error|success|connected|disconnected/i;
const NAME_SUFFIX_PATTERN = /-(extension|plugin|assistant|adapter|slash-text|slash|text|widget)$/gi;
const FRACTION_PATTERN = /(\d+\/\d+|\d+%\s*)/;
const PARENTHESES_PATTERN = /\((\d+)\)/;
const BRACKET_PATTERN = /\[(\d+)\]/;
const NUMBER_PATTERN = /\b(\d+)\b/;

// Load settings path
const home = process.env.HOME || process.env.USERPROFILE || "";
const settingsPath = path.join(home, ".pi/agent/settings.json");

let currentStyle = "minimal";
let customStyleConfig: CustomStyleConfig | undefined;

try {
  if (fs.existsSync(settingsPath)) {
    const data = fs.readFileSync(settingsPath, "utf-8");
    const config = JSON.parse(data);
    if (config.beautifier && typeof config.beautifier.style === "string") {
      const saved = config.beautifier.style;
      currentStyle = (VALID_STYLES as readonly string[]).includes(saved) ? saved : "minimal";
    }
    if (config.beautifier?.custom && typeof config.beautifier.custom === "object") {
      customStyleConfig = config.beautifier.custom;
    }
  }
} catch (_e) {
  // Graceful fallback to default in case of JSON parse or read errors
}

// Clean status text and map state and details
export function beautifyStatus(
  key: string,
  originalVal: string | undefined,
  theme: any,
  style: string,
  customCfg?: CustomStyleConfig
): string | undefined {
  if (originalVal === undefined) return undefined;
  if (style === "off") return originalVal;

  try {
    const hasAnsi = originalVal.includes("\u001B") || originalVal.includes("\u009B");
    const cleanVal = hasAnsi ? originalVal.replace(ANSI_STRIP_REGEX, "").trim() : originalVal.trim();

    if (cleanVal === "") return "";

    if (!STATUS_PATTERN.test(cleanVal)) {
      return originalVal;
    }

    // 1. Get display name
    let name = key.toLowerCase();
    if (COMMON_NAMES[name]) {
      name = COMMON_NAMES[name];
    } else {
      const lastSlash = name.lastIndexOf("/");
      if (lastSlash !== -1) {
        name = name.slice(lastSlash + 1);
      }
      name = name.replace(NAME_SUFFIX_PATTERN, "").toLowerCase();
    }
    const visualName = padToVisualWidth(sliceToVisualWidth(name, 10), 10);

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
      valLower.includes("failed")
    ) {
      state = "error";
    } else if (
      valLower.includes("⏸") ||
      valLower.includes("🟡") ||
      valLower.includes("?") ||
      valLower.includes("warning") ||
      valLower.includes("pause") ||
      valLower.includes("planning") ||
      valLower.includes("plan")
    ) {
      state = "warning";
    } else if (
      valLower.includes("🟢") ||
      valLower.includes("✅") ||
      valLower.includes("✓") ||
      valLower.includes("online") ||
      valLower.includes("success")
    ) {
      state = "success";
    } else {
      state = name === "plan" ? "accent" : "success";
    }

    // 4. Determine state glyph & indicator
    const preset =
      style === "custom"
        ? (customCfg || customStyleConfig || {})
        : (BUILTIN_PRESETS[style] || BUILTIN_PRESETS.minimal);

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
      hasThemeFg && (sep.includes("│") || sep.includes("⁝") || sep.includes("❯"))
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

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI || !ctx.ui) return;

    originalStatuses.clear();
    lastRenderedStatus.clear();

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
  });

  // Dynamic status bar style controller registry
  pi.registerCommand("beautify", {
    description: "Choose TUI status bar beautification style or generate a custom style with AI",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI || !ctx.ui) {
        return;
      }

      const styleOptions = [
        "custom  - [AI Prompt Recipe] Let your agent generate or tailor your own style",
        "minimal - Clean chevron indicator (e.g. name ❯ ●)",
        "glass   - Framed capsule badge (e.g. ▕ name ● ▏)",
        "glow    - High-contrast inverse pill (e.g. name [ ● ])",
        "off     - Pass through raw status output",
      ];

      const choice = await ctx.ui.select(`Choose status style (Current: ${currentStyle}):`, styleOptions);

      if (!choice) return;

      const styleKey = choice.split(" ")[0].trim();

      if (styleKey === "custom") {
        const promptRecipe = [
          "You are acting as my Pi TUI Status Bar designer for `pi-tui-status-beautifier`.",
          "1. In my primary language, call `ask_user_question` with ASCII visual preview mockups (e.g. Cyber Powerline ‹●›, Nordic Minimalist │ ◈, Capsule Pill [●], Tokyo Night » ✦) to consult my visual taste.",
          "2. Once I select or describe my aesthetic, save the configuration directly into `settings.json` under `beautifier.style = 'custom'` and `beautifier.custom = { separator, brackets, glyphs, prefix, suffix }`.",
          "Do NOT edit any extension source code files."
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

        try {
          if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, "utf-8");
            const config = JSON.parse(data);
            if (config.beautifier?.custom && typeof config.beautifier.custom === "object") {
              customStyleConfig = config.beautifier.custom;
            }
            if (!config.beautifier) config.beautifier = {};
            config.beautifier.style = styleKey;
            const tempSettings = `${settingsPath}.tmp.${process.pid}.${Date.now()}`;
            fs.writeFileSync(tempSettings, JSON.stringify(config, null, 2), "utf-8");
            fs.renameSync(tempSettings, settingsPath);
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
