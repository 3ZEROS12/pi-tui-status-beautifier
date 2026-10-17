/**
 * Adaptive badge folding for narrow terminals.
 *
 * Contract: the returned string never exceeds `maxWidth` visual cells.
 * Widths are measured once per badge (O(n)); the fold label width is measured
 * per candidate count, not per character.
 */

import { getStringWidth, sliceToVisualWidth } from "./width";

export interface Badge {
  key: string;
  val: string;
  rendered: string;
  isHighPriority: boolean;
  /**
   * Visible cell width of `rendered`, measured WITHOUT theme styling. Callers
   * that already know it should pass it so themed output (whose ANSI wrappers
   * would otherwise be measured) is never over-counted.
   */
  width?: number;
}

const SEP = "  ";
const SEP_WIDTH = 2;

type FoldLabel = (remaining: number) => string;

function makeLabel(theme: any, kind: "idle" | "more"): FoldLabel {
  return (remaining: number) => {
    const text = `(+${remaining} ${kind})`;
    return theme && typeof theme.fg === "function" ? theme.fg("dim", text) : text;
  };
}

/** Width of the first `count` items joined by the separator. */
function joinedWidth(widths: number[], count: number): number {
  if (count <= 0) return 0;
  let total = 0;
  for (let i = 0; i < count; i++) total += widths[i];
  return total + SEP_WIDTH * (count - 1);
}

/**
 * Packs `rendered` left-to-right while always leaving room for the fold label
 * that covers `extra` additional items beyond this list.
 */
function pack(
  rendered: string[],
  widths: number[],
  maxWidth: number,
  labelFor: FoldLabel,
  extra: number
): string {
  const n = rendered.length;
  if (n === 0) {
    return extra > 0 ? labelFor(extra) : "";
  }

  let shown = 0;
  for (let i = 0; i < n; i++) {
    const remaining = n - (i + 1) + extra;
    const tail = remaining > 0 ? SEP_WIDTH + getStringWidth(labelFor(remaining)) : 0;
    if (joinedWidth(widths, i + 1) + tail <= maxWidth) {
      shown = i + 1;
    } else {
      break;
    }
  }

  if (shown === n) {
    const head = rendered.join(SEP);
    return extra > 0 ? `${head}${SEP}${labelFor(extra)}` : head;
  }

  if (shown === 0) {
    const label = labelFor(n + extra);
    return getStringWidth(label) <= maxWidth
      ? label
      : sliceToVisualWidth(`(+${n + extra} more)`, maxWidth);
  }

  return `${rendered.slice(0, shown).join(SEP)}${SEP}${labelFor(n - shown + extra)}`;
}

export function formatFoldedBadges(badges: Badge[], maxWidth: number, theme: any): string {
  if (!badges || badges.length === 0) return "";
  if (maxWidth <= 0) return "";

  const rendered = badges.map((b) => b.rendered);
  const widths = badges.map((b) => (typeof b.width === "number" ? b.width : getStringWidth(b.rendered)));

  if (joinedWidth(widths, badges.length) <= maxWidth) {
    return rendered.join(SEP);
  }

  const idleLabel = makeLabel(theme, "idle");
  const moreLabel = makeLabel(theme, "more");

  const high = badges.filter((b) => b.isHighPriority);
  if (high.length === 0) {
    return pack(rendered, widths, maxWidth, idleLabel, 0);
  }

  const highRendered = high.map((b) => b.rendered);
  const highWidths = high.map((b) => (typeof b.width === "number" ? b.width : getStringWidth(b.rendered)));
  const lowCount = badges.length - high.length;

  // Keep every high-priority badge, fold all idle ones.
  if (lowCount > 0) {
    const withFold = joinedWidth(highWidths, high.length) + SEP_WIDTH + getStringWidth(idleLabel(lowCount));
    if (withFold <= maxWidth) {
      return `${highRendered.join(SEP)}${SEP}${idleLabel(lowCount)}`;
    }
  }

  if (joinedWidth(highWidths, high.length) <= maxWidth) {
    return highRendered.join(SEP);
  }

  // High-priority badges alone overflow: degrade them too, counting folded
  // idle badges as "more" so the label stays truthful.
  return pack(highRendered, highWidths, maxWidth, moreLabel, lowCount);
}
