/**
 * Preset table and style-key resolution.
 *
 * Invariant: no two presets may be byte-identical. Aliases exist so retired
 * names keep working without keeping a duplicate render table alive.
 */

// Mapping of internal package names to clean human-readable TUI status names
export const COMMON_NAMES: Record<string, string> = {
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
  anchor: "anchor",
  "pi-anchor": "anchor",
  lingual: "lingual",
  "pi-lingual": "lingual",
};

export const SPINNERS = ["◐", "◓", "◑", "◒"] as const;

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

export const BUILTIN_PRESETS: Record<string, CustomStyleConfig> = {
  // Claude / Anthropic Style: Warm, organic, serene, high-signal dot markers
  claude: {
    separator: " · ",
    glyphs: {
      success: "●",
      warning: "○",
      error: "▲",
      accent: "◆",
    },
  },
  // OpenAI / GPT Style: Precision slate & emerald geometric tokens
  openai: {
    brackets: ["⦋", "⦌"],
    separator: " ",
    glyphs: {
      success: "▪",
      warning: "▫",
      error: "✖",
      accent: "■",
    },
  },
  // Gemini Style: Ethereal celestial sparkle gradients
  gemini: {
    brackets: ["✧", "✦"],
    separator: " ",
    glyphs: {
      success: "✦",
      warning: "✧",
      error: "✖",
      accent: "✶",
    },
  },
  // Linear / Raycast Style: High-density keyboard-driven monochrome chevron
  linear: {
    separator: " ❯ ",
    glyphs: {
      success: "●",
      warning: "◐",
      error: "▲",
      accent: "◆",
    },
  },
  // Tokyo Night Style: Cyberpunk midnight brackets and neon stars
  tokyo: {
    brackets: ["⦗", "⦘"],
    separator: " ",
    glyphs: {
      success: "✦",
      warning: "◍",
      error: "✖",
      accent: "✧",
    },
  },
  // Nord Style: Arctic frost chevrons and calm snowstorm symbols
  nord: {
    brackets: ["‹", "›"],
    separator: " ",
    glyphs: {
      success: "◆",
      warning: "◌",
      error: "▲",
      accent: "◈",
    },
  },
  // Classic stream: bare chevron separator
  stream: {
    separator: " ❯ ",
  },
  // High-contrast inverse pill
  glow: {
    brackets: ["[", "]"],
    inverse: true,
  },
  // Minimal: chevron with a fixed 10-column name gutter
  minimal: {
    separator: " ❯ ",
    padName: true,
  },
};

export const VALID_STYLES = [
  "claude",
  "openai",
  "gemini",
  "linear",
  "tokyo",
  "nord",
  "stream",
  "glow",
  "minimal",
  "custom",
  "off",
] as const;

/** Retired names kept as aliases so existing settings.json files keep working. */
export const STYLE_ALIASES: Record<string, string> = {
  matrix: "tokyo",
  powerline: "nord",
  glass: "nord",
};

export const OFF_STYLES = new Set(["off", "default", "none", "raw", "vanilla", "disable", "disabled"]);

/**
 * Canonicalises a raw style key: trims, lowercases, expands aliases and
 * normalises every off-synonym to "off". Unknown keys pass through untouched
 * so callers can decide their own fallback.
 */
export function resolveStyleKey(raw: string | undefined): string {
  const key = (raw || "").toLowerCase().trim();
  if (!key) return "stream";
  if (OFF_STYLES.has(key)) return "off";
  return STYLE_ALIASES[key] || key;
}

export function getPreset(
  style: string,
  customCfg?: CustomStyleConfig,
  fallback: string = "stream"
): CustomStyleConfig {
  const key = resolveStyleKey(style);
  if (key === "custom") return customCfg || {};
  return BUILTIN_PRESETS[key] || BUILTIN_PRESETS[fallback] || {};
}
