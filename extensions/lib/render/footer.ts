/**
 * Full-footer renderer (opt-in via `beautifier.fullFooter === true`).
 *
 * Cost model: the token totals scan is the only O(session length) work here, so
 * it is memoised on (array reference, length, last entry reference). Appending a
 * turn invalidates it; compaction replaces the array and invalidates it too.
 * Everything else is per-render and O(badges).
 */

import * as path from "path";
import { CustomStyleConfig, getPreset, resolveStyleKey } from "../theme/presets";
import { getStringWidth } from "../core/width";
import { formatFoldedBadges, Badge } from "../core/fold";
import { beautifyStatus } from "./status";
import { sanitizeCustomConfig } from "../config/settings";
import { originalStatuses, runtime } from "../state";

interface Totals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  hitRate?: number;
}

let totalsCache: { source: any; length: number; last: any; totals: Totals } | null = null;
let cwdMemo: { cwd: string; base: string } | null = null;

function computeTotals(source: any[]): Totals {
  const totals: Totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  for (const entry of source) {
    if (entry?.type === "usage" && entry.usage) {
      const u = entry.usage;
      totals.input += u.input || 0;
      totals.output += u.output || 0;
      totals.cacheRead += u.cacheRead || 0;
      totals.cacheWrite += u.cacheWrite || 0;
      totals.cost += u.cost?.total || 0;
    } else if (entry?.type === "message" && entry.message?.role === "assistant" && entry.message?.usage) {
      const u = entry.message.usage;
      totals.input += u.input || 0;
      totals.output += u.output || 0;
      totals.cacheRead += u.cacheRead || 0;
      totals.cacheWrite += u.cacheWrite || 0;
      totals.cost += u.cost?.total || 0;
      const promptTokens = (u.input || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0);
      if (promptTokens > 0 && u.cacheRead) {
        totals.hitRate = (u.cacheRead / promptTokens) * 100;
      }
    }
  }
  return totals;
}

function getTotals(source: any): Totals {
  if (!Array.isArray(source)) return computeTotals([]);
  const last = source.length > 0 ? source[source.length - 1] : undefined;
  if (totalsCache && totalsCache.source === source && totalsCache.length === source.length && totalsCache.last === last) {
    return totalsCache.totals;
  }
  const totals = computeTotals(source);
  totalsCache = { source, length: source.length, last, totals };
  return totals;
}

function workspaceBasename(cwd: string): string {
  if (cwdMemo && cwdMemo.cwd === cwd) return cwdMemo.base;
  const base = path.basename(cwd) || "workspace";
  cwdMemo = { cwd, base };
  return base;
}

function formatCount(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

export function renderBeautifiedFooter(
  width: number,
  _tui: any,
  theme: any,
  footerData: any,
  ctx: any,
  style: string,
  customCfg?: CustomStyleConfig
): string[] {
  const styleKey = resolveStyleKey(style);
  const preset =
    styleKey === "custom"
      ? sanitizeCustomConfig(customCfg) || sanitizeCustomConfig(runtime.custom) || {}
      : getPreset(styleKey, undefined, "minimal");

  const hasThemeFg = theme && typeof theme.fg === "function";
  const sep =
    typeof preset.separator === "string" && preset.separator
      ? preset.separator
      : preset.brackets
        ? " "
        : " ❯ ";
  const styledSep =
    hasThemeFg && (sep.includes("│") || sep.includes("⁝") || sep.includes("❯") || sep.includes("»"))
      ? theme.fg("dim", sep)
      : sep;

  // 1. Folder & Git branch
  const branch = typeof footerData?.getGitBranch === "function" ? footerData.getGitBranch() : "";
  const folder = workspaceBasename(ctx?.cwd || process.cwd());
  const branchPart = branch ? `${folder} (${branch})` : folder;
  const styledBranch = hasThemeFg ? theme.fg("dim", branchPart) : branchPart;

  // 2. Model
  const modelName = ctx?.model?.name || ctx?.model?.id || "";
  const styledModel = modelName ? (hasThemeFg ? theme.fg("muted", modelName) : modelName) : "";

  // 3. Token metrics & context usage (full fidelity matching native Pi footer)
  const entriesSource = ctx?.sessionManager?.getEntries?.() || ctx?.sessionManager?.getBranch?.();
  const totals = getTotals(entriesSource);

  const statParts: string[] = [];
  if (totals.input > 0) statParts.push(`↑${formatCount(totals.input)}`);
  if (totals.output > 0) statParts.push(`↓${formatCount(totals.output)}`);
  if (totals.cacheRead > 0) statParts.push(`R${formatCount(totals.cacheRead)}`);
  if (totals.hitRate !== undefined) statParts.push(`CH${totals.hitRate.toFixed(1)}%`);
  if (totals.cost > 0) statParts.push(`$${totals.cost.toFixed(3)}`);

  const contextUsage = ctx?.getContextUsage?.();
  const contextWindow = contextUsage?.contextWindow || ctx?.model?.contextWindow || 0;
  if (contextUsage?.percent !== undefined && contextUsage?.percent !== null) {
    const pct = contextUsage.percent;
    const pctColor = pct > 85 ? "error" : pct > 70 ? "warning" : "dim";
    const pctStr = `${pct.toFixed(0)}%`;
    const styledPct = hasThemeFg ? theme.fg(pctColor, pctStr) : pctStr;
    statParts.push(`${styledPct}/${formatCount(contextWindow)}`);
  }

  const tokenStr = statParts.join(" ");
  const styledTokens = tokenStr ? (hasThemeFg ? theme.fg("dim", tokenStr) : tokenStr) : "";

  // Thinking level with kinetic glyphs (🧠 max/high, 💭 med, ⚡ low/minimal)
  const thinkingGlyph =
    ctx?.thinkingLevel === "max" || ctx?.thinkingLevel === "high"
      ? "🧠"
      : ctx?.thinkingLevel === "medium"
        ? "💭"
        : ctx?.thinkingLevel === "low" || ctx?.thinkingLevel === "minimal"
          ? "⚡"
          : "•";
  const thinking = ctx?.thinkingLevel && ctx.thinkingLevel !== "off" ? ` ${thinkingGlyph} ${ctx.thinkingLevel}` : "";
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
    } catch {
      // Footer data is host-owned; a throwing accessor must not blank the footer.
    }
  }
  if (extStatuses.length === 0) {
    for (const [k, v] of originalStatuses.entries()) {
      if (v) extStatuses.push([k, v]);
    }
  }

  if (extStatuses.length > 0) {
    const rawBadges = extStatuses
      .map(([k, v]): Badge | null => {
        const rendered = beautifyStatus(k, v, theme, styleKey, customCfg);
        if (!rendered) return null;
        // Visible width must be measured on unstyled text: theme.fg only wraps,
        // and measuring the wrapped string would count its escape sequences.
        const plain = beautifyStatus(k, v, null, styleKey, customCfg) || "";
        const valLower = (v || "").toLowerCase();
        const isHigh =
          valLower.includes("error") ||
          valLower.includes("fail") ||
          valLower.includes("warn") ||
          valLower.includes("running") ||
          valLower.includes("active") ||
          valLower.includes("starting");
        return { key: k, val: v, rendered, isHighPriority: isHigh, width: getStringWidth(plain) };
      })
      .filter((b): b is Badge => b !== null);

    if (rawBadges.length > 0) {
      lines.push(formatFoldedBadges(rawBadges, width - 2, theme));
    }
  }

  return lines;
}

/**
 * Builds the setFooter factory once. Both session_start and /beautify use this,
 * so the render guard can never drift between the two call sites.
 */
export function createFooterFactory(ctx: any) {
  return (tui: any, theme: any, footerData: any) => {
    const unsub =
      typeof footerData?.onBranchChange === "function"
        ? footerData.onBranchChange(() => tui.requestRender())
        : undefined;

    return {
      dispose: unsub,
      invalidate() {
        // Host repaints drive everything; nothing to invalidate locally.
      },
      render(width: number): string[] {
        if (runtime.style === "off" || !runtime.fullFooter) return [];
        return renderBeautifiedFooter(width, tui, theme, footerData, ctx, runtime.style, runtime.custom);
      },
    };
  };
}
