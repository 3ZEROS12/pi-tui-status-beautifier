import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beautifyStatus, isSpinningStatus } from "./lib/render/status";
import { loadConfig } from "./lib/config/settings";
import { createFooterFactory } from "./lib/render/footer";
import { applyConfig, lastRenderedStatus, originalStatuses, runtime } from "./lib/state";
import { runBeautify } from "./lib/command";

// Public surface kept on the entry module so tests and downstream imports keep
// resolving from a single path.
export { beautifyStatus, isSpinningStatus, GENERIC_IDLE_WORDS } from "./lib/render/status";
export type { BeautifyStatusOptions } from "./lib/render/status";
export { getStringWidth, isFullWidth, sliceToVisualWidth, padToVisualWidth } from "./lib/core/width";
export { formatFoldedBadges } from "./lib/core/fold";
export type { Badge } from "./lib/core/fold";
export { renderBeautifiedFooter, createFooterFactory } from "./lib/render/footer";
export {
  loadConfig,
  sanitizeCustomConfig,
  writeBeautifierSettings,
  removeBeautifierSettings,
  settingsPaths,
  normalizeStoredStyle,
} from "./lib/config/settings";
export { runtime, applyConfig, resetRuntime } from "./lib/state";
export { BUILTIN_PRESETS, VALID_STYLES, STYLE_ALIASES, OFF_STYLES, resolveStyleKey, getPreset } from "./lib/theme/presets";
export { runBeautify, STYLE_MENU } from "./lib/command";
export type { CustomStyleConfig } from "./lib/theme/presets";
export type { ResolvedConfig } from "./lib/config/settings";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event: any, ctx: any) => {
    if (!ctx.hasUI || !ctx.ui) return;

    applyConfig(loadConfig(ctx.cwd || process.cwd()));

    originalStatuses.clear();
    lastRenderedStatus.clear();

    // 1. Hook setStatus for clean status badge formatting (always active unless style === "off")
    const originalSetStatus = ctx.ui.setStatus;
    if (originalSetStatus && !(originalSetStatus as any).__beautifierHooked) {
      const wrapped = function (key: string, value: string | undefined) {
        originalStatuses.set(key, value);

        const beautified = beautifyStatus(key, value, ctx.ui.theme, runtime.style, runtime.custom);

        // The spinner advances with wall-clock time, so only spinner-bearing
        // badges bypass the dirty check. Everything else is compared by value.
        const frame = isSpinningStatus(value) ? Math.floor(Date.now() / 300) : 0;
        const cacheKey = `${key}:${runtime.style}`;
        const fingerprint = frame ? `${frame}|${beautified}` : beautified;
        if (lastRenderedStatus.get(cacheKey) === fingerprint) {
          return;
        }
        lastRenderedStatus.set(cacheKey, fingerprint);

        return originalSetStatus.call(ctx.ui, key, beautified);
      };
      (wrapped as any).__beautifierHooked = true;
      ctx.ui.setStatus = wrapped;
    }

    // 2. Hook setFooter ONLY if user explicitly opted in with fullFooter === true!
    // By default fullFooter is FALSE: Pi's native top two lines remain 100% native and untouched!
    if (typeof (ctx.ui as any).setFooter === "function") {
      if (runtime.fullFooter && runtime.style !== "off") {
        (ctx.ui as any).setFooter(createFooterFactory(ctx));
      } else {
        (ctx.ui as any).setFooter(undefined); // Restore native Pi footer
      }
    }
  });

  // Dynamic status bar style controller registry
  pi.registerCommand("beautify", {
    description:
      "Choose TUI status bar style or customize with AI (/beautify [claude|openai|gemini|linear|tokyo|nord|stream|minimal|glow|custom|off])",
    handler: async (args: string, ctx: any) => {
      await runBeautify(pi, args, ctx);
    },
  });
}
