/**
 * Status badge beautifier: ANSI strip -> metric extraction -> state inference
 * -> preset rendering.
 */

import {
  COMMON_NAMES,
  CustomStyleConfig,
  SPINNERS,
  getPreset,
  resolveStyleKey,
  OFF_STYLES,
} from "../theme/presets";
import { ANSI_STRIP_REGEX, padToVisualWidth, sliceToVisualWidth } from "../core/width";
import { runtime } from "../state";

// Hoisted regex patterns to prevent instantiation and GC overhead in the render hot-path
const STATUS_PATTERN =
  /[🟢🔴🟡⚪⏸✅❌✓✗?✔✖☑☐◆📋⌬★✦◇»«‹›⦗⦘]|[0-9]+\/[0-9]+|\b(?:active|online|offline|running|paused|error|success|connected|disconnected|ready|idle|ok|done|failed|waiting|stopped|listening|cleanup|starting)\b/i;
const NAME_SUFFIX_PATTERN = /-(extension|plugin|assistant|adapter|slash-text|slash|text|widget)$/gi;
const FRACTION_PATTERN = /(\d+\/\d+|\d+%\s*)/;
const PARENTHESES_PATTERN = /\((\d+)\)/;
const BRACKET_PATTERN = /\[(\d+)\]/;
const NUMBER_PATTERN = /\b(\d+)\b/;
const WORD_STATE_PATTERN =
  /(?::\s*|\b)(ready|idle|ok|done|failed|waiting|cleanup|active|online|offline|running|paused|error|success|connected|disconnected)\b/i;

/** True when the status text implies an in-flight operation (drives the spinner). */
export function isSpinningStatus(value: string | undefined): boolean {
  if (!value) return false;
  const valLower = value.toLowerCase();
  return (
    valLower.includes("running") ||
    valLower.includes("working") ||
    valLower.includes("starting") ||
    valLower.includes("waiting") ||
    valLower.includes("...")
  );
}

export function beautifyStatus(
  key: string,
  originalVal: string | undefined,
  theme: any,
  style: string,
  customCfg?: CustomStyleConfig
): string | undefined {
  if (originalVal === undefined) return undefined;
  const styleKey = resolveStyleKey(style);
  if (styleKey === "off" || OFF_STYLES.has((style || "").toLowerCase().trim())) return originalVal;

  try {
    const boundedVal = originalVal.length > 512 ? originalVal.slice(0, 512) : originalVal;
    const hasAnsi = boundedVal.includes("\u001B") || boundedVal.includes("\u009B");
    const cleanVal = hasAnsi ? boundedVal.replace(ANSI_STRIP_REGEX, "").trim() : boundedVal.trim();

    if (cleanVal === "") return "";

    if (!STATUS_PATTERN.test(cleanVal)) {
      return originalVal.length > 64 ? sliceToVisualWidth(cleanVal, 32) : originalVal;
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
    const preset = getPreset(styleKey, styleKey === "custom" ? customCfg || runtime.custom || {} : customCfg);

    const visualName =
      preset.padName === true
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
          const wordMatch = cleanVal.match(WORD_STATE_PATTERN);
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
      state = name === "plan" ? "accent" : "success";
    } else {
      state = name === "plan" ? "accent" : "success";
    }

    // 4. Determine state glyph & indicator
    const glyphMap = preset.glyphs || {};
    const isEcosystemGlyph = name === "anchor" || name === "toolflow" || name === "lingual";
    let defaultGlyph =
      name === "anchor"
        ? "⌖"
        : name === "toolflow"
          ? "⌬"
          : name === "lingual"
            ? "⇄"
            : state === "warning"
              ? "◌"
              : state === "error"
                ? "▲"
                : state === "accent"
                  ? "◆"
                  : "●";

    // Dynamic micro-spinner for active in-progress / running states (running, working, starting, waiting)
    const isSpinning = isSpinningStatus(cleanVal);
    if (isSpinning) {
      defaultGlyph = SPINNERS[Math.floor(Date.now() / 300) % SPINNERS.length];
    }

    // Preserve ecosystem glyphs (⌖, ⌬, ⇄) and active spinners across all preset themes unless overridden in custom style
    const glyph =
      isSpinning || (isEcosystemGlyph && styleKey !== "custom")
        ? defaultGlyph
        : glyphMap[state] || defaultGlyph;

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
  } catch {
    return originalVal;
  }
}
