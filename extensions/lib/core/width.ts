/**
 * Terminal visual-cell measurement.
 *
 * Rules that this file must keep:
 * - ANSI escapes are stripped before measuring.
 * - East Asian Wide/Fullwidth = 2 cells; Ambiguous = 1 cell (terminal default).
 * - Dingbats / Misc Symbols (U+2600-U+27BF) are 1 cell. They used to be counted
 *   as 2, which drifted every badge rendered with ✓ ✗ ✦ ▲ ◆.
 * - Combining marks, variation selectors and ZWJ are 0 cells.
 * - Keycap sequences (base + FE0F + 20E3) are 2 cells.
 * - Emoji presentation selector (FE0F) after a 2600-27BF base promotes it to 2.
 */

// Safe, non-backtracking ReDoS-mitigated ANSI escape sequence matcher (supporting ; and :)
export const ANSI_STRIP_REGEX =
  /[\u001B\u009B][[\]\\()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:[:;]\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

const EMOJI_PRESENTATION_BASE_MIN = 0x2600;
const EMOJI_PRESENTATION_BASE_MAX = 0x27bf;

const isZeroWidthCode = (code: number): boolean =>
  code === 0x200b ||
  code === 0x200c ||
  code === 0x200d ||
  code === 0x200e ||
  code === 0x200f ||
  code === 0xfe0e ||
  code === 0xfe0f ||
  (code >= 0x0300 && code <= 0x036f) || // Combining Diacritical Marks
  (code >= 0x1ab0 && code <= 0x1aff) || // Combining Diacritical Marks Extended
  (code >= 0x1dc0 && code <= 0x1dff) || // Combining Diacritical Marks Supplement
  (code >= 0x20d0 && code <= 0x20ff) || // Combining Diacritical Marks for Symbols
  (code >= 0xfe00 && code <= 0xfe0f) || // Variation Selectors
  (code >= 0xfe20 && code <= 0xfe2f) || // Combining Half Marks
  (code >= 0x1f3fb && code <= 0x1f3ff); // Emoji Modifiers (skin tones)

/**
 * Checks if a code point occupies two terminal cells (Unicode UAX #11 W/F).
 */
export function isFullWidth(code: number): boolean {
  if (Number.isNaN(code)) return false;
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0x3247 && code !== 0x303f) || // CJK Radicals .. Enclosed CJK
    (code >= 0x3040 && code <= 0x309f) || // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) || // Katakana
    (code >= 0x3250 && code <= 0x4dbf) || // Enclosed CJK .. CJK Extension A
    (code >= 0x4e00 && code <= 0xa4c6) || // CJK Unified Ideographs .. Yi
    (code >= 0xa960 && code <= 0xa97c) || // Hangul Jamo Extended-A
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xfe10 && code <= 0xfe19) || // Vertical Forms
    (code >= 0xfe30 && code <= 0xfe6b) || // CJK Compatibility Forms
    (code >= 0xff01 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth Signs
    (code >= 0x1f300 && code <= 0x1f64f) || // Misc Symbols & Pictographs, Emoticons
    (code >= 0x1f680 && code <= 0x1f6ff) || // Transport & Map
    (code >= 0x1f900 && code <= 0x1f9ff) || // Supplemental Symbols & Pictographs
    (code >= 0x1fa70 && code <= 0x1faff) || // Symbols & Pictographs Extended-A
    (code >= 0x20000 && code <= 0x3fffd) // CJK Extensions B..F
  );
}

/**
 * Calculates the visual column cell width of a string, taking into account
 * full-width Unicode characters, East Asian ideographs, Kana, Hangul, emojis,
 * ZWJ sequences, variation selectors and keycap sequences.
 */
export function getStringWidth(str: string): number {
  if (!str) return 0;
  const clean = str.replace(ANSI_STRIP_REGEX, "");
  let width = 0;
  let afterZwj = false;
  let lastBase = -1;

  for (const char of clean) {
    const code = char.codePointAt(0) || 0;

    if (code === 0x200d) {
      afterZwj = true;
      continue;
    }

    // Emoji presentation selector promotes a dingbat base from 1 to 2 cells.
    if (code === 0xfe0f) {
      if (lastBase >= EMOJI_PRESENTATION_BASE_MIN && lastBase <= EMOJI_PRESENTATION_BASE_MAX) {
        width += 1;
      }
      continue;
    }

    // Keycap combining enclosing keycap adds the one cell the base lacks.
    if (code === 0x20e3) {
      width += 1;
      continue;
    }

    if (isZeroWidthCode(code)) {
      continue;
    }

    if (afterZwj) {
      afterZwj = false;
      lastBase = code;
      continue;
    }

    width += isFullWidth(code) ? 2 : 1;
    lastBase = code;
  }

  return width;
}

/**
 * Slices a string to a maximum visual cell width without cutting surrogate
 * pairs or ZWJ sequences in half.
 */
export function sliceToVisualWidth(str: string, maxWidth: number): string {
  if (!str || maxWidth <= 0) return "";
  let width = 0;
  let sliced = "";
  let pendingZwj = false;

  for (const char of str) {
    const code = char.codePointAt(0) || 0;
    if (code === 0x200d) {
      if (sliced.length > 0) pendingZwj = true;
      continue;
    }
    if (isZeroWidthCode(code)) {
      if (sliced.length > 0) sliced += char;
      continue;
    }
    if (pendingZwj) {
      sliced += "\u200d" + char;
      pendingZwj = false;
      continue;
    }
    const charWidth = isFullWidth(code) ? 2 : 1;

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
