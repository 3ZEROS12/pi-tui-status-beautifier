/**
 * Status badge beautifier: ANSI strip -> metric extraction -> state inference
 * -> preset rendering.
 */

import {
  COMMON_NAMES,
  CustomStyleConfig,
  SPINNERS,
  resolveSeparator,
  resolveStyleKey,
  styleSeparator,
  OFF_STYLES,
} from "../theme/presets";
import { ANSI_STRIP_REGEX, getStringWidth, padToVisualWidth, sliceToVisualWidth } from "../core/width";
import { runtime } from "../state";
import { resolveActivePreset } from "../config/settings";

// Hoisted regex patterns to prevent instantiation and GC overhead in the render hot-path
const STATUS_PATTERN =
  /[🟢🔴🟡⚪⏸✅❌✓✗?✔✖☑☐◆📋⌬★✦◇»«‹›⦗⦘⌖⇄]|[0-9]+\/[0-9]+|\b(?:active|online|offline|running|paused|error|success|connected|disconnected|ready|idle|ok|done|failed|waiting|stopped|listening|cleanup|starting|tokens?\s+saved|~?\d+(?:\.\d+)?[kKmM]?\s*saved|guard(?:\s+active)?|cache\s+hits?|[a-z]{2,3}\s*·\s*(?:direct|spec\s+ok))\b/i;
const NAME_SUFFIX_PATTERN = /-(extension|plugin|assistant|adapter|slash-text|slash|text|widget)$/gi;
const LANG_PAIR_PATTERN = /([a-z]{2,3}\s*⇄\s*[a-z]{2,3}(?:\s*·\s*[^\r\n]+)?|\b[a-z]{2,3}\s*·\s*(?:direct|spec\s+ok)\b)/i;
// Toolflow omits the unit below 1000 (`~850 saved`, and `~0 saved` on a fresh install), so the
// suffix must be optional here exactly as it already is in STATUS_PATTERN.
const SAVED_METRIC_PATTERN = /(~?\d+(?:\.\d+)?[kKmM]?\s+saved|\bguard\s+active\b|\bguard\b)/i;
const FRACTION_PATTERN = /(\d+\/\d+|\d+%\s*)/;
// Signed deltas and signed units were two byte-identical patterns; one source of truth.
const SIGNED_UNIT_PATTERN = /([+-]?\d+(?:\.\d+)?[kKmM]\b|[+-]\d+(?:\.\d+)?%?)/;
const COUNT_PATTERN = /[[(](\d+)[)\]]/;
const NUMBER_PATTERN = /\b(\d+)\b/;
const WORD_STATE_PATTERN =
  /(?::\s*|\b)(ready|idle|ok|done|failed|waiting|cleanup|active|online|offline|running|paused|error|success|connected|disconnected|listening|stopped|starting)\b/i;

export const GENERIC_IDLE_WORDS = new Set([
  "ready",
  "idle",
  "ok",
  "online",
  "active",
  "connected",
  "listening",
]);

export interface BeautifyStatusOptions {
  compact?: boolean;
}

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
  customCfg?: CustomStyleConfig,
  options?: BeautifyStatusOptions
): string | undefined {
  if (originalVal === undefined) return undefined;
  const styleKey = resolveStyleKey(style);
  if (styleKey === "off" || OFF_STYLES.has((style || "").toLowerCase().trim())) return originalVal;

  try {
    // Strip ANSI first, then cap: a 512-unit slice can bisect an escape sequence and the
    // orphaned parameters (`38;5`) then read as badge metrics. The cap itself is applied on
    // code points so a surrogate pair is never split.
    const stripped = originalVal.replace(ANSI_STRIP_REGEX, "");
    const boundedVal = stripped.length > 512 ? [...stripped].slice(0, 512).join("") : stripped;
    const cleanVal = boundedVal.trim();

    if (cleanVal === "") return "";

    if (!STATUS_PATTERN.test(cleanVal)) {
      // Cells, not UTF-16 units: 40 CJK glyphs are 80 columns wide.
      return getStringWidth(cleanVal) > 64 ? sliceToVisualWidth(cleanVal, 32) : originalVal;
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
    // Disk data reaches this point unsanitized (footer passes the raw custom block through),
    // and a malformed value like `separator: 12` used to throw and reset every badge.
    const { preset } = resolveActivePreset(styleKey, customCfg, runtime.custom);

    const isCompact = options?.compact === true;
    const visualName =
      preset.padName === true && !isCompact
        ? padToVisualWidth(sliceToVisualWidth(name, 10), 10)
        : name;

    // Dynamic micro-spinner for active in-progress / running states (running, working, starting, waiting)
    const isSpinning = isSpinningStatus(cleanVal);

    // 2. Extract metrics/progress details safely (e.g. (2) or fraction 2/5 or count)
    let details: string | undefined;

    if (!isSpinning) {
      const langMatch = cleanVal.match(LANG_PAIR_PATTERN);
      if (langMatch) {
        details = langMatch[1].trim();
      }
    }
    if (!details) {
      const savedMatch = cleanVal.match(SAVED_METRIC_PATTERN);
      if (savedMatch) {
        const progressMatch = cleanVal.match(FRACTION_PATTERN);
        details = progressMatch
          ? `${progressMatch[1].trim()} · ${savedMatch[1].trim()}`
          : savedMatch[1].trim();
      }
    }

    if (!details) {
      const fractionMatch = cleanVal.match(FRACTION_PATTERN);
      if (fractionMatch) {
        const deltaMatch = cleanVal.match(SIGNED_UNIT_PATTERN);
        if (deltaMatch) {
          details = `${fractionMatch[1].trim()} · ${deltaMatch[1].trim()}`;
        } else {
          details = fractionMatch[1].trim();
        }
      } else {
        const metricMatch = cleanVal.match(SIGNED_UNIT_PATTERN);
        if (metricMatch) {
          details = metricMatch[1].trim();
        } else {
          const countMatch = cleanVal.match(COUNT_PATTERN);
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
      }
    }

    if (isCompact && details && GENERIC_IDLE_WORDS.has(details.toLowerCase())) {
      details = undefined;
    }

    // 3. Determine state based on colors, icons, emojis or text keywords in original val
    let state: "success" | "warning" | "error" | "accent";
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
    } else {
      // Everything that is not error/warning reads as success, except the plan badge, which
      // stays accent. The former explicit success branch restated this fallback verbatim.
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
    const sep = resolveSeparator(preset);

    // Inverse pill badge (glow preset)
    if (preset.inverse && theme && typeof theme.inverse === "function") {
      const pillContent = ` ${glyph}${details ? ` ${details}` : ""} `;
      const coloredBadge = hasThemeFg ? theme.inverse(theme.fg(state, pillContent)) : `[${pillContent}]`;
      return `${prefix}${dimmedName}${styleSeparator(sep, theme)}${coloredBadge}${suffix}`;
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

    return `${prefix}${dimmedName}${styleSeparator(sep, theme)}${badge}${suffix}`;
  } catch {
    return originalVal;
  }
}
