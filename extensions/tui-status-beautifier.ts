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

// Store original statuses to allow dynamic redrawing on configuration changes.
// Cleaned up on session restart to prevent memory leaks from replaced sessions.
const originalStatuses = new Map<string, string | undefined>();

// Memoization cache for Google colorized text to reduce GC overhead and theme calls.
const googleColorizeCache = new Map<string, string>();

// Safe, non-backtracking ReDoS-mitigated ANSI escape sequence matcher (supporting ; and :)
const ANSI_STRIP_REGEX =
  /[\u001B\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

// Hoisted regex patterns to prevent instantiation and GC overhead in the render hot-path
const STATUS_PATTERN =
  /[🟢🔴🟡⚪⏸✅❌✓✗?✔✖☑☐◆📋]|[0-9]+\/[0-9]+|active|online|offline|running|paused|error|success|connected|disconnected/i;
const NAME_SUFFIX_PATTERN = /-(extension|plugin|assistant|adapter|slash-text|slash|text|widget)$/gi;
const FRACTION_PATTERN = /(\d+\/\d+|\d+%\s*)/;
const PARENTHESES_PATTERN = /\((\d+)\)/;
const BRACKET_PATTERN = /\[(\d+)\]/;
const NUMBER_PATTERN = /\b(\d+)\b/;

// Load settings path
const home = process.env.HOME || process.env.USERPROFILE || "";
const settingsPath = path.join(home, ".pi/agent/settings.json");

// Command-Driven I/O State:
// Loaded ONCE synchronously during extension loading, thereafter handled entirely in memory.
// Disk I/O only occurs when the user triggers the "/beautify" selection command.
let currentStyle = "minimal";

try {
  if (fs.existsSync(settingsPath)) {
    const data = fs.readFileSync(settingsPath, "utf-8");
    const config = JSON.parse(data);
    if (config.beautifier && typeof config.beautifier.style === "string") {
      currentStyle = config.beautifier.style;
    }
  }
} catch (e) {
  // Graceful fallback to default in case of JSON parse or read errors
}

// Google playful multi-color letter colorizer with type safeguards and memoization
export function googleColorize(text: string, theme: any): string {
  if (!theme || typeof theme.fg !== "function") return text;

  const cached = googleColorizeCache.get(text);
  if (cached !== undefined) return cached;

  // Google's brand colors cycle: Blue, Red, Yellow, Green
  const colors = ["accent", "error", "warning", "success"];
  const colorized = text
    .split("")
    .map((char, index) => {
      const color = colors[index % colors.length];
      return theme.fg(color, char);
    })
    .join("");

  googleColorizeCache.set(text, colorized);
  return colorized;
}

// Clean status text and map state and details
export function beautifyStatus(
  key: string,
  originalVal: string | undefined,
  theme: any,
  style: string
): string | undefined {
  if (originalVal === undefined) return undefined;
  if (style === "off") return originalVal; // Pass through untouched if disabled

  try {
    // Fast-path: bypass Regex search if no ESC or CSI bytes exist to reduce hot redraw latency
    const hasAnsi = originalVal.includes("\u001B") || originalVal.includes("\u009B");
    const cleanVal = hasAnsi ? originalVal.replace(ANSI_STRIP_REGEX, "").trim() : originalVal.trim();

    if (cleanVal === "") return "";

    // Safely bypass values that have no status signifiers (such as logs or text widgets)
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
      name = name.slice(0, 10);
    }

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
      valLower.includes("未登录") ||
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
      valLower.includes("success") ||
      valLower.includes("已连接")
    ) {
      state = "success";
    } else {
      state = name === "plan" ? "accent" : "success";
    }

    // 4. Map state to target glyph shapes
    let char = "●";
    if (state === "warning") char = "◌";
    else if (state === "error") char = "▲";

    const hasThemeFg = theme && typeof theme.fg === "function";
    const coloredIndicator = hasThemeFg ? theme.fg(state, char) : char;

    // 5. Render layout presets
    switch (style) {
      case "apple": {
        const separator = hasThemeFg ? theme.fg("dim", "  │  ") : "  │  ";
        const dimmedName = hasThemeFg ? theme.fg("dim", name) : name;
        const detailStr = details ? ` (${details})` : "";
        return `${dimmedName}${separator}${coloredIndicator}${detailStr}`;
      }
      case "openai": {
        const spirograph = hasThemeFg ? theme.fg("success", "❂") : "❂";
        const detailStr = details ? ` [${details}]` : "";
        const dimmedName = hasThemeFg ? theme.fg("muted", name) : name;
        return `${spirograph} ${dimmedName}${detailStr}`;
      }
      case "anthropic": {
        const organicStar = "✦";
        const coloredStar = hasThemeFg ? theme.fg(state, organicStar) : organicStar;
        const dimmedName = hasThemeFg ? theme.fg("muted", name) : name;
        const detailStr = details ? ` ❖ ${details}` : "";
        return `${dimmedName} ${coloredStar}${detailStr}`;
      }
      case "microsoft": {
        const windowsLogo = hasThemeFg ? theme.fg("accent", "⊞") : "⊞";
        const detailStr = details ? ` │ ${details}` : "";
        const prefix = hasThemeFg ? theme.fg("dim", "[") : "[";
        const suffix = hasThemeFg ? theme.fg("dim", "]") : "]";
        return `${windowsLogo} ${prefix}${name}${suffix} ${coloredIndicator}${detailStr}`;
      }
      case "google": {
        const coloredName = googleColorize(name, theme);
        const detailStr = details ? `:${details}` : "";
        return `${coloredName} ➔ ${coloredIndicator}${detailStr}`;
      }
      case "glass": {
        const prefix = hasThemeFg ? theme.fg("dim", "▕ ") : "▕ ";
        const suffix = hasThemeFg ? theme.fg("dim", " ▏") : " ▏";
        const dimmedName = hasThemeFg ? theme.fg("muted", name) : name;
        const detailStr = details ? ` (${details})` : "";
        return `${prefix}${dimmedName} ${coloredIndicator}${detailStr}${suffix}`;
      }
      case "glow": {
        const label = ` ${char}${details ? ` ${details}` : ""} `;
        const hasInverse = theme && typeof theme.inverse === "function";
        const coloredBadge = hasInverse && hasThemeFg ? theme.inverse(theme.fg(state, label)) : `[${label}]`;
        const dimmedName = hasThemeFg ? theme.fg("muted", name) : name;
        return `${dimmedName} ${coloredBadge}`;
      }
      case "matrix": {
        const prefix = hasThemeFg ? theme.fg("dim", " ⦗ ") : " ⦗ ";
        const suffix = hasThemeFg ? theme.fg("dim", " ⦘") : "  ⦘";
        const separator = hasThemeFg ? theme.fg("dim", " | ") : " | ";
        const detailStr = details ? `${separator}${details}` : "";
        return `${name}${prefix}${coloredIndicator}${detailStr}${suffix}`;
      }
      case "minimal": {
        const separator = hasThemeFg ? theme.fg("dim", " ❯ ") : " ❯ ";
        const dimmedName = hasThemeFg ? theme.fg("muted", name) : name;
        const detailStr = details ? ` (${details})` : "";
        return `${dimmedName}${separator}${coloredIndicator}${detailStr}`;
      }
      default:
        return originalVal;
    }
  } catch (error) {
    // Resilience fallback: prevent rendering exceptions from ever crashing UI updates
    return originalVal;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI || !ctx.ui) return;

    // Flush stale statuses from previous sessions to prevent memory leaks and clear color cache
    originalStatuses.clear();
    googleColorizeCache.clear();

    const originalSetStatus = ctx.ui.setStatus;
    if (originalSetStatus && !(originalSetStatus as any).__beautifierHooked) {
      const wrapped = function (key: string, value: string | undefined) {
        // Track original statuses for dynamic updates
        originalStatuses.set(key, value);

        // Uses in-memory synchronization (zero file I/O overhead on render pipeline ticks)
        const beautified = beautifyStatus(key, value, ctx.ui.theme, currentStyle);

        return originalSetStatus.call(ctx.ui, key, beautified);
      };
      (wrapped as any).__beautifierHooked = true;
      ctx.ui.setStatus = wrapped;
    }
  });

  // Dynamic status bar style controller registry
  pi.registerCommand("beautify", {
    description: "Choose TUI status bar beautification style",
    handler: async (args, ctx) => {
      if (!ctx.hasUI || !ctx.ui) {
        return;
      }

      const styleOptions = [
        "minimal (Millennial Minimalist - e.g. name ❯ ●)",
        "apple (Apple Cupertino - e.g. name │ ●)",
        "openai (OpenAI Spirograph - e.g. ❂ name)",
        "anthropic (Anthropic Claude - e.g. name ✦)",
        "google (Google Playful - e.g. n-a-m-e ➔ ●)",
        "microsoft (Microsoft Fluent - e.g. ⊞ [name] ●)",
        "glass (Charm Glass - e.g. ▕ name ● ▏)",
        "glow (Glow Badge - e.g. name [ ● ])",
        "matrix (Retro Matrix - e.g. name ⦗ ● | 2 ⦘)",
        "off (use raw output)",
      ];

      const choice = await ctx.ui.select(`Choose status style (Current: ${currentStyle}):`, styleOptions);

      if (choice) {
        const styleKey = choice.split(" ")[0].trim();
        const validStyles = [
          "apple",
          "openai",
          "anthropic",
          "google",
          "microsoft",
          "minimal",
          "glass",
          "glow",
          "matrix",
          "off",
        ];

        if (validStyles.includes(styleKey)) {
          // 1. Instantly update in-memory caching
          currentStyle = styleKey;
          googleColorizeCache.clear(); // Clear cache when changing style/redrawing to ensure new colors are loaded
          ctx.ui.notify(`TUI status style changed to: ${styleKey}`, "info");

          // 2. Redraw TUI indicator widgets instantly on configuration event using cached data
          for (const [key, val] of originalStatuses.entries()) {
            ctx.ui.setStatus(key, val);
          }

          // 3. Command-Driven Disk I/O: Persist settings to disk asynchronously outside core paint loop
          try {
            if (fs.existsSync(settingsPath)) {
              const data = fs.readFileSync(settingsPath, "utf-8");
              const config = JSON.parse(data);
              if (!config.beautifier) config.beautifier = {};
              config.beautifier.style = styleKey;
              fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2), "utf-8");
            }
          } catch (e) {
            // Silently fail disk write to avoid crashing active user sessions
          }
        }
      }
    },
  });
}
