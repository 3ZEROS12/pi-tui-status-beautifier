/**
 * `/beautify` command flow: style picker -> scope wizard -> apply / revert.
 *
 * Apply ordering matters: read config once, write the runtime state with the
 * user's fresh choice as an override, THEN persist. The old code persisted and
 * re-read, which clobbered the choice it had just made.
 */

import { VALID_STYLES, resolveStyleKey } from "./theme/presets";
import {
  loadConfig,
  removeBeautifierSettings,
  writeBeautifierSettings,
} from "./config/settings";
import { applyConfig, lastRenderedStatus, originalStatuses, resetRuntime, runtime } from "./state";
import { createFooterFactory } from "./render/footer";

export const STYLE_MENU: string[] = [
  "claude    - Anthropic warm minimalist dots (e.g. name · ● ready)",
  "openai    - GPT slate emerald geometric tokens (e.g. name ⦋▪ ready⦌)",
  "gemini    - Google celestial sparkle gradients (e.g. name ✧✦ ready)",
  "linear    - Linear / Raycast precision chevrons (e.g. name ❯ ● ready)",
  "tokyo     - Tokyo Night cyberpunk brackets & stars (e.g. name ⦗✦ ready⦘)",
  "nord      - Nordic arctic frost chevrons (e.g. name ‹◆ ready›)",
  "stream    - Clean stream chevron (e.g. name ❯ ● ready)",
  "minimal   - Chevron with a fixed 10-column name gutter",
  "glow      - High-contrast inverse pill (e.g. name [ ● ready ])",
  "custom    - Describe your custom aesthetic to AI",
  "off       - Revert to native Pi status bar & clean settings",
];

export const STYLE_MENU_KEYS = STYLE_MENU.map((line) => line.split(" ")[0].trim());

function revertToNative(ctx: any): void {
  resetRuntime();
  lastRenderedStatus.clear();

  for (const [key, val] of originalStatuses.entries()) {
    ctx.ui.setStatus(key, val);
  }
  if (typeof (ctx.ui as any).setFooter === "function") {
    (ctx.ui as any).setFooter(undefined);
  }

  const { removed, errors } = removeBeautifierSettings(ctx.cwd || process.cwd());

  if (errors.length > 0) {
    ctx.ui.notify(
      `Reverted to native Pi status bar, but settings cleanup failed: ${errors.join("; ")}`,
      "warning"
    );
  } else if (removed.length === 0) {
    ctx.ui.notify("Reverted to native Pi status bar. No beautifier settings to clean.", "info");
  } else {
    ctx.ui.notify(
      `Reverted to native Pi status bar. Cleaned beautifier key from ${removed.length} settings file(s).`,
      "info"
    );
  }
}

function buildCustomInstruction(userDesire: string): string {
  return [
    "Please configure a custom Pi TUI status bar style for `pi-tui-status-beautifier`.",
    `User's requested aesthetic: "${userDesire}"`,
    "",
    "Requirements:",
    `1. In the user's primary language, call \`ask_user_question\` with 3 distinct ASCII visual preview mockups tailored to "${userDesire}". Show ONLY realistic extension status items (e.g. \`chrome\`, \`toolflow\`, \`plan\`). Do NOT include git branch or model name in mockups.`,
    "2. Once selected, save the configuration into `./.pi/settings.json` (or `~/.pi/agent/settings.json`) under `beautifier`:",
    "   {",
    '     "beautifier": {',
    '       "style": "custom",',
    '       "custom": {',
    '         "separator": " ... ",',
    '         "brackets": ["...", "..."],',
    '         "prefix": "...",',
    '         "suffix": "...",',
    '         "glyphs": { "success": "...", "warning": "...", "error": "...", "accent": "..." }',
    "       }",
    "     }",
    "   }",
    "3. If the user ever asks to revert, cancel, or restore default, cleanly delete `beautifier` from `settings.json` without asking questions.",
    "4. Do NOT search the filesystem or edit extension source files. Confirm when applied.",
  ].join("\n");
}

async function pickStyle(ctx: any, rawInput: string): Promise<string | undefined> {
  if (rawInput) {
    const resolved = resolveStyleKey(rawInput);
    if ((VALID_STYLES as readonly string[]).includes(resolved)) return resolved;
  }

  // Stage 1: Select Style / Theme
  const choice = await ctx.ui.select(`Choose status bar style (Current: ${runtime.style}):`, STYLE_MENU);
  if (!choice) return undefined;
  return choice.split(" ")[0].trim();
}

export async function runBeautify(pi: any, args: string | undefined, ctx: any): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) return;

  const tokens = (args || "").trim().split(/\s+/).filter(Boolean);
  const firstToken = tokens[0] || "";
  const secondToken = tokens[1]?.toLowerCase();

  const styleKey = await pickStyle(ctx, firstToken.toLowerCase());
  if (!styleKey) return;

  // Zero-trace physical cleanup & revert
  if (styleKey === "off") {
    revertToNative(ctx);
    return;
  }

  // Custom style: hand the aesthetic brief to the agent, which writes settings.
  if (styleKey === "custom") {
    let userDesire: string | undefined;
    if (typeof (ctx.ui as any).input === "function") {
      userDesire = await (ctx.ui as any).input(
        "Describe your custom status bar style:",
        "e.g. Cyberpunk dot matrix / Minimal dots / Soft warm pastel / Powerline diamonds"
      );
    }
    if (!userDesire || !userDesire.trim()) return;

    const instruction = buildCustomInstruction(userDesire.trim());

    if (pi && typeof pi.sendUserMessage === "function") {
      pi.sendUserMessage(instruction, { deliverAs: "followUp" });
      ctx.ui.notify("Consulting AI status bar designer...", "info");
    } else if (typeof (ctx.ui as any).setEditorText === "function") {
      (ctx.ui as any).setEditorText(instruction);
      ctx.ui.notify("Press Enter to send custom style request to your agent!", "info");
    }
    return;
  }

  // Stage 2: Scope Selection Wizard (Two-stage flow)
  let isFullFooter: boolean;
  if (secondToken === "status" || secondToken === "status-only") {
    isFullFooter = false;
  } else if (secondToken === "full" || secondToken === "full-footer") {
    isFullFooter = true;
  } else {
    const scopeOptions = [
      "status-only - Plugin status badges only (Recommended: keeps native Pi path, tokens & thinking level)",
      "full-footer - Full-footer beautification (Transforms Git branch, model, and tokens too)",
    ];

    const scopeChoice = await ctx.ui.select("Choose beautification scope:", scopeOptions);
    if (!scopeChoice) return;

    isFullFooter = scopeChoice.startsWith("full-footer");
  }

  const cwd = ctx.cwd || process.cwd();

  // Read once, then apply the user's fresh choice as an override, then persist.
  const cfg = loadConfig(cwd);
  applyConfig(cfg, { style: styleKey, fullFooter: isFullFooter });
  lastRenderedStatus.clear();

  let writeError: string | undefined;
  try {
    writeBeautifierSettings(cfg.targetSettingsPath, styleKey, isFullFooter);
  } catch (error) {
    writeError = error instanceof Error ? error.message : String(error);
  }

  if (typeof (ctx.ui as any).setFooter === "function") {
    (ctx.ui as any).setFooter(isFullFooter ? createFooterFactory(ctx) : undefined);
  }

  for (const [key, val] of originalStatuses.entries()) {
    ctx.ui.setStatus(key, val);
  }

  if (writeError) {
    ctx.ui.notify(
      `Style applied for this session, but settings.json could not be written: ${writeError}`,
      "warning"
    );
    return;
  }

  ctx.ui.notify(
    `TUI status style changed to: ${styleKey} (${isFullFooter ? "Full-Footer" : "Status Only"})`,
    "info"
  );
}
