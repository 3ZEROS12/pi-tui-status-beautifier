/**
 * Single mutable runtime state for the extension.
 *
 * Why one object instead of three module-level `let`s: the setStatus wrapper is
 * installed once per session and must observe the CURRENT style at call time.
 * Reading `runtime.style` off a stable object reference avoids stale closures
 * and gives the apply/revert paths exactly one place to write.
 */

import { CustomStyleConfig } from "./theme/presets";
import { ResolvedConfig } from "./config/settings";

export interface RuntimeState {
  style: string;
  fullFooter: boolean;
  custom?: CustomStyleConfig;
  targetSettingsPath: string;
}

export const runtime: RuntimeState = {
  style: "minimal",
  fullFooter: false,
  targetSettingsPath: "",
};

/**
 * Applies a resolved config, optionally overriding the two fields the user just
 * changed. Overrides win over whatever is still on disk — that ordering is the
 * fix for "style change only takes effect after restart".
 */
export function applyConfig(
  cfg: ResolvedConfig,
  over?: { style?: string; fullFooter?: boolean }
): void {
  runtime.style = over?.style ?? cfg.style;
  runtime.fullFooter = over?.fullFooter ?? cfg.fullFooter;
  runtime.custom = cfg.custom;
  runtime.targetSettingsPath = cfg.targetSettingsPath;
}

export function resetRuntime(): void {
  runtime.style = "off";
  runtime.fullFooter = false;
  runtime.custom = undefined;
}

// Store original statuses to allow dynamic redrawing on configuration changes.
export const originalStatuses = new Map<string, string | undefined>();

// State cache for dirty-checking.
export const lastRenderedStatus = new Map<string, string | undefined>();
