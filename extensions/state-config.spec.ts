import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  beautifyStatus,
  getStringWidth,
  formatFoldedBadges,
  loadConfig,
  writeBeautifierSettings,
  removeBeautifierSettings,
  resolveStyleKey,
  applyConfig,
  resetRuntime,
  runtime,
} from "./tui-status-beautifier";

const mockTheme = {
  fg: (color: string, text: string) => `[${color}]${text}[/color]`,
  inverse: (text: string) => `[inv]${text}[/inv]`,
};

let home: string;
let project: string;
let previousHome: string | undefined;
let previousUserProfile: string | undefined;

const globalSettings = () => path.join(home, ".pi", "agent", "settings.json");
const localSettings = () => path.join(project, ".pi", "settings.json");

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

beforeEach(() => {
  previousHome = process.env.HOME;
  previousUserProfile = process.env.USERPROFILE;
  home = fs.mkdtempSync(path.join(os.tmpdir(), "beautifier-home-"));
  project = fs.mkdtempSync(path.join(os.tmpdir(), "beautifier-proj-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  if (previousUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = previousUserProfile;
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(project, { recursive: true, force: true });
});

describe("Config resolution is pure and hierarchical", () => {
  it("does not mutate runtime state when read", () => {
    writeJson(localSettings(), { beautifier: { style: "tokyo" } });
    runtime.style = "minimal";

    const cfg = loadConfig(project);
    expect(cfg.style).toBe("tokyo");

    // Regression guard: loadConfig used to write these globals, which reverted
    // the style the user had just picked in /beautify.
    expect(runtime.style).toBe("minimal");
  });

  it("local style overrides global, global fullFooter is inherited", () => {
    writeJson(globalSettings(), { beautifier: { style: "claude", fullFooter: true } });
    writeJson(localSettings(), { beautifier: { style: "nord" } });

    const cfg = loadConfig(project);
    expect(cfg.style).toBe("nord");
    expect(cfg.fullFooter).toBe(true);
  });

  it("resolves retired preset names from disk to their surviving preset", () => {
    writeJson(localSettings(), { beautifier: { style: "matrix" } });
    expect(loadConfig(project).style).toBe("tokyo");

    writeJson(localSettings(), { beautifier: { style: "powerline" } });
    expect(loadConfig(project).style).toBe("nord");

    writeJson(localSettings(), { beautifier: { style: "glass" } });
    expect(loadConfig(project).style).toBe("nord");
  });

  it("targets the local settings file when one exists", () => {
    writeJson(globalSettings(), { beautifier: { style: "claude" } });
    writeJson(localSettings(), { other: true });

    expect(loadConfig(project).targetSettingsPath).toBe(localSettings());
  });
});

describe("Apply / revert keep runtime state authoritative", () => {
  it("applies a style change immediately without re-reading disk", () => {
    writeJson(localSettings(), { beautifier: { style: "minimal" } });

    const cfg = loadConfig(project);
    applyConfig(cfg, { style: "nord", fullFooter: false });

    expect(runtime.style).toBe("nord");
    expect(beautifyStatus("chrome", "ready", mockTheme, runtime.style)).toContain("‹");
  });

  it("applies full-footer on the same tick it is requested", () => {
    writeJson(localSettings(), { beautifier: { style: "minimal", fullFooter: false } });

    const cfg = loadConfig(project);
    applyConfig(cfg, { style: "minimal", fullFooter: true });

    expect(runtime.fullFooter).toBe(true);
  });

  it("revert resets runtime so the next status write is raw", () => {
    applyConfig({ style: "tokyo", fullFooter: true, targetSettingsPath: "" });
    resetRuntime();

    expect(runtime.style).toBe("off");
    expect(runtime.fullFooter).toBe(false);
    expect(beautifyStatus("chrome", "ready", mockTheme, runtime.style)).toBe("ready");
  });
});

describe("Zero-trace settings cleanup", () => {
  it("removes the global beautifier block even when the local file has no such key", () => {
    writeJson(globalSettings(), { beautifier: { style: "nord" }, theme: "dark" });
    writeJson(localSettings(), { other: true });

    const { removed, errors } = removeBeautifierSettings(project);

    expect(errors).toEqual([]);
    expect(removed).toContain(globalSettings());
    const globalAfter = JSON.parse(fs.readFileSync(globalSettings(), "utf-8"));
    expect(globalAfter).not.toHaveProperty("beautifier");
    expect(globalAfter.theme).toBe("dark");
  });

  it("leaves files untouched when no beautifier key exists anywhere", () => {
    writeJson(globalSettings(), { theme: "dark" });

    const { removed, errors } = removeBeautifierSettings(project);

    expect(removed).toEqual([]);
    expect(errors).toEqual([]);
    expect(JSON.parse(fs.readFileSync(globalSettings(), "utf-8"))).toEqual({ theme: "dark" });
  });

  it("round-trips a written style through loadConfig", () => {
    writeBeautifierSettings(globalSettings(), "glow", true);

    const cfg = loadConfig(project);
    expect(cfg.style).toBe("glow");
    expect(cfg.fullFooter).toBe(true);
  });
});

describe("Preset aliases", () => {
  it("maps retired names to the surviving preset without keeping duplicates", () => {
    expect(resolveStyleKey("matrix")).toBe("tokyo");
    expect(resolveStyleKey("powerline")).toBe("nord");
    expect(resolveStyleKey("glass")).toBe("nord");
    expect(resolveStyleKey("default")).toBe("off");
  });

  it("renders retired names byte-identically to their survivor", () => {
    expect(beautifyStatus("chrome", "ready", mockTheme, "matrix")).toBe(
      beautifyStatus("chrome", "ready", mockTheme, "tokyo")
    );
    expect(beautifyStatus("chrome", "ready", mockTheme, "powerline")).toBe(
      beautifyStatus("chrome", "ready", mockTheme, "nord")
    );
  });
});

describe("Terminal cell width", () => {
  it("treats dingbats and geometric shapes as single-cell", () => {
    for (const glyph of ["✓", "✗", "✦", "▲", "◆", "●", "❯", "‹", "›", "⌖", "⌬", "⇄"]) {
      expect(getStringWidth(glyph)).toBe(1);
    }
  });

  it("counts emoji presentation, keycaps and ZWJ sequences correctly", () => {
    expect(getStringWidth("❤️")).toBe(2);
    expect(getStringWidth("1️⃣")).toBe(2);
    expect(getStringWidth("👨‍👩‍👧")).toBe(2);
    expect(getStringWidth("🇨🇳")).toBe(2);
  });

  it("counts combining marks as zero width", () => {
    expect(getStringWidth("e\u0301")).toBe(1);
    expect(getStringWidth("a\u0300\u0323")).toBe(1);
  });

  it("keeps CJK, Kana and Hangul at two cells", () => {
    expect(getStringWidth("测试")).toBe(4);
    expect(getStringWidth("こんにちは")).toBe(10);
    expect(getStringWidth("안녕하세요")).toBe(10);
  });
});

describe("Badge folding boundaries", () => {
  const badges = [
    { key: "alpha", val: "ready", rendered: "alpha", isHighPriority: false },
    { key: "beta", val: "ready", rendered: "beta", isHighPriority: false },
    { key: "gamma", val: "ready", rendered: "gamma", isHighPriority: false },
  ];

  it("keeps every badge at the exact joined width", () => {
    // alpha(5) + 2 + beta(4) + 2 + gamma(5) = 18
    const out = formatFoldedBadges(badges, 18, null);
    expect(out).toBe("alpha  beta  gamma");
  });

  it("folds at one column below the joined width", () => {
    const out = formatFoldedBadges(badges, 17, null);
    expect(out).toContain("(+2 idle)");
    expect(getStringWidth(out)).toBeLessThanOrEqual(17);
  });

  it("never exceeds maxWidth across a width sweep", () => {
    for (let width = 8; width <= 120; width++) {
      const out = formatFoldedBadges(badges, width, null);
      expect(getStringWidth(out)).toBeLessThanOrEqual(width);
    }
  });

  it("never exceeds maxWidth when high-priority badges alone overflow", () => {
    const highs = [
      { key: "a", val: "error", rendered: "aaaaaaaaaaaaaaaaaaaa", isHighPriority: true },
      { key: "b", val: "error", rendered: "bbbbbbbbbbbbbbbbbbbb", isHighPriority: true },
      { key: "c", val: "ready", rendered: "cccc", isHighPriority: false },
    ];
    for (let width = 8; width <= 60; width++) {
      const out = formatFoldedBadges(highs, width, null);
      expect(getStringWidth(out)).toBeLessThanOrEqual(width);
    }
  });

  it("keeps high-priority badges and folds idle ones when both fit", () => {
    const mixed = [
      { key: "toolflow", val: "running", rendered: "toolflow", isHighPriority: true },
      { key: "alpha", val: "ready", rendered: "alpha", isHighPriority: false },
      { key: "beta", val: "ready", rendered: "beta", isHighPriority: false },
    ];
    // toolflow(8) + 2 + alpha(5) + 2 + beta(4) = 21 > 20, so folding kicks in.
    const out = formatFoldedBadges(mixed, 20, null);
    expect(out).toContain("toolflow");
    expect(out).toContain("(+2 idle)");
  });

  it("returns an empty string for no badges", () => {
    expect(formatFoldedBadges([], 80, null)).toBe("");
  });
});
