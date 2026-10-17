/**
 * Settings resolution and persistence.
 *
 * `loadConfig` is PURE: it reads and returns, it never mutates module state.
 * (The previous version also wrote module globals, which silently reverted the
 * style the user had just picked in /beautify.)
 */

import * as fs from "fs";
import * as path from "path";
import {
  CustomStyleConfig,
  OFF_STYLES,
  STYLE_ALIASES,
  VALID_STYLES,
} from "../theme/presets";

export interface ResolvedConfig {
  style: string;
  fullFooter: boolean;
  custom?: CustomStyleConfig;
  targetSettingsPath: string;
}

export interface SettingsPaths {
  globalPath: string;
  localPath: string;
}

export function isTestEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST !== undefined ||
    process.env.NODE_TEST_CONTEXT !== undefined ||
    process.execArgv.some((a) => a.includes("test") || a.includes("vitest")) ||
    process.env.npm_lifecycle_event === "test"
  );
}

export function settingsPaths(cwd?: string): SettingsPaths {
  const effectiveCwd = cwd || process.cwd();
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return {
    globalPath: path.join(home, ".pi/agent/settings.json"),
    localPath: path.join(effectiveCwd, ".pi/settings.json"),
  };
}

/** Accepts retired preset names so old settings.json files keep working. */
export function normalizeStoredStyle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const key = raw.toLowerCase().trim();
  if (OFF_STYLES.has(key)) return "off";
  const alias = STYLE_ALIASES[key];
  if (alias) return alias;
  return (VALID_STYLES as readonly string[]).includes(key) ? key : undefined;
}

interface BeautifierBlock {
  hasKey: boolean;
  style?: string;
  fullFooter?: boolean;
  custom?: CustomStyleConfig;
}

function readBeautifierBlock(filePath: string): BeautifierBlock {
  const empty: BeautifierBlock = { hasKey: false };
  try {
    if (!fs.existsSync(filePath)) return empty;
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const block = data?.beautifier;
    if (!block || typeof block !== "object") return empty;

    const result: BeautifierBlock = { hasKey: true };
    const style = normalizeStoredStyle(block.style);
    if (style) result.style = style;
    if (typeof block.fullFooter === "boolean") result.fullFooter = block.fullFooter;
    if (block.custom && typeof block.custom === "object" && !Array.isArray(block.custom)) {
      result.custom = block.custom;
    }
    return result;
  } catch {
    // Unreadable or malformed settings must never break status rendering.
    return empty;
  }
}

export function loadConfig(cwd?: string): ResolvedConfig {
  const { globalPath, localPath } = settingsPaths(cwd);
  // Multi-probe test isolation: never read the real global settings unless the
  // caller explicitly passed a cwd.
  const skipGlobal = isTestEnvironment() && cwd === undefined;

  let style = "minimal";
  let fullFooter = false;
  let custom: CustomStyleConfig | undefined;

  if (!skipGlobal) {
    const global = readBeautifierBlock(globalPath);
    if (global.style) style = global.style;
    if (global.fullFooter !== undefined) fullFooter = global.fullFooter;
    if (global.custom) custom = global.custom;
  }

  const local = readBeautifierBlock(localPath);
  if (local.style) style = local.style;
  if (local.fullFooter !== undefined) fullFooter = local.fullFooter;
  if (local.custom) custom = { ...(custom || {}), ...local.custom };

  // Write target: project-local settings if the project opted in, else global.
  const targetSettingsPath = fs.existsSync(localPath) ? localPath : globalPath;

  return { style, fullFooter, custom, targetSettingsPath };
}

export function sanitizeCustomConfig(raw: any): CustomStyleConfig | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const clampStr = (v: unknown, maxLen = 16): string | undefined =>
    typeof v === "string" ? v.slice(0, maxLen) : undefined;
  const brackets =
    Array.isArray(raw.brackets) &&
    raw.brackets.length === 2 &&
    typeof raw.brackets[0] === "string" &&
    typeof raw.brackets[1] === "string"
      ? ([raw.brackets[0].slice(0, 4), raw.brackets[1].slice(0, 4)] as [string, string])
      : undefined;
  const rawGlyphs =
    raw.glyphs && typeof raw.glyphs === "object" && !Array.isArray(raw.glyphs) ? raw.glyphs : undefined;
  const glyphs = rawGlyphs
    ? {
        success: clampStr(rawGlyphs.success, 4),
        warning: clampStr(rawGlyphs.warning, 4),
        error: clampStr(rawGlyphs.error, 4),
        accent: clampStr(rawGlyphs.accent, 4),
      }
    : undefined;
  return {
    prefix: clampStr(raw.prefix, 16),
    suffix: clampStr(raw.suffix, 16),
    separator: clampStr(raw.separator, 12),
    brackets,
    inverse: typeof raw.inverse === "boolean" ? raw.inverse : undefined,
    padName: typeof raw.padName === "boolean" ? raw.padName : undefined,
    glyphs,
  };
}

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf-8");
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Best effort temp cleanup only.
    }
    throw error;
  }
}

export function writeBeautifierSettings(targetPath: string, style: string, fullFooter: boolean): void {
  const config = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, "utf-8")) : {};
  if (!config.beautifier || typeof config.beautifier !== "object") config.beautifier = {};
  config.beautifier.style = style;
  config.beautifier.fullFooter = fullFooter;
  atomicWriteJson(targetPath, config);
}

/**
 * Physically removes the `beautifier` key from BOTH the local and the global
 * settings file, so `off` leaves zero residue even when the local file exists
 * but never contained a beautifier block.
 */
export function removeBeautifierSettings(cwd?: string): { removed: string[]; errors: string[] } {
  const { globalPath, localPath } = settingsPaths(cwd);
  const removed: string[] = [];
  const errors: string[] = [];
  const targets = localPath === globalPath ? [localPath] : [localPath, globalPath];

  for (const filePath of targets) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const config = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (!config || typeof config !== "object" || !("beautifier" in config)) continue;
      delete config.beautifier;
      atomicWriteJson(filePath, config);
      removed.push(filePath);
    } catch (error) {
      errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { removed, errors };
}
