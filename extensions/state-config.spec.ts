import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  beautifyStatus,
  getStringWidth,
  formatFoldedBadges,
  renderBeautifiedFooter,
  type Badge,
  loadConfig,
  writeBeautifierSettings,
  removeBeautifierSettings,
  resolveStyleKey,
  applyConfig,
  resetRuntime,
  runtime,
  runBeautify,
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

describe("One-shot /beautify command arguments", () => {
  it("applies /beautify claude status directly without prompting scope", async () => {
    const selectMock = vi.fn();
    const setStatusMock = vi.fn();
    const setFooterMock = vi.fn();
    const notifyMock = vi.fn();
    const mockCtx = {
      hasUI: true,
      cwd: project,
      ui: {
        select: selectMock,
        setStatus: setStatusMock,
        setFooter: setFooterMock,
        notify: notifyMock,
      },
    };

    await runBeautify(null, "claude status", mockCtx);

    expect(selectMock).not.toHaveBeenCalled();
    expect(runtime.style).toBe("claude");
    expect(runtime.fullFooter).toBe(false);
    expect(setFooterMock).toHaveBeenCalledWith(undefined);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.stringContaining("claude (Status Only)"),
      "info"
    );

    // Persisted to project settings
    const cfg = loadConfig(project);
    expect(cfg.style).toBe("claude");
    expect(cfg.fullFooter).toBe(false);
  });

  it("applies /beautify nord full directly without prompting scope", async () => {
    const selectMock = vi.fn();
    const setStatusMock = vi.fn();
    const setFooterMock = vi.fn();
    const notifyMock = vi.fn();
    const mockCtx = {
      hasUI: true,
      cwd: project,
      ui: {
        select: selectMock,
        setStatus: setStatusMock,
        setFooter: setFooterMock,
        notify: notifyMock,
      },
    };

    await runBeautify(null, "nord full", mockCtx);

    expect(selectMock).not.toHaveBeenCalled();
    expect(runtime.style).toBe("nord");
    expect(runtime.fullFooter).toBe(true);
    expect(setFooterMock).toHaveBeenCalledWith(expect.any(Function));
    expect(notifyMock).toHaveBeenCalledWith(
      expect.stringContaining("nord (Full-Footer)"),
      "info"
    );

    const cfg = loadConfig(project);
    expect(cfg.style).toBe("nord");
    expect(cfg.fullFooter).toBe(true);
  });

  it("prompts for scope when only style is provided", async () => {
    const selectMock = vi.fn().mockResolvedValue("status-only - Plugin status badges only");
    const mockCtx = {
      hasUI: true,
      cwd: project,
      ui: {
        select: selectMock,
        setStatus: vi.fn(),
        setFooter: vi.fn(),
        notify: vi.fn(),
      },
    };

    await runBeautify(null, "tokyo", mockCtx);

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(selectMock).toHaveBeenCalledWith("Choose beautification scope:", expect.any(Array));
    expect(runtime.style).toBe("tokyo");
    expect(runtime.fullFooter).toBe(false);
  });

  it("supports aliases status-only and full-footer", async () => {
    const selectMock = vi.fn();
    const mockCtx = {
      hasUI: true,
      cwd: project,
      ui: {
        select: selectMock,
        setStatus: vi.fn(),
        setFooter: vi.fn(),
        notify: vi.fn(),
      },
    };

    await runBeautify(null, "stream status-only", mockCtx);
    expect(selectMock).not.toHaveBeenCalled();
    expect(runtime.style).toBe("stream");
    expect(runtime.fullFooter).toBe(false);

    await runBeautify(null, "linear full-footer", mockCtx);
    expect(selectMock).not.toHaveBeenCalled();
    expect(runtime.style).toBe("linear");
    expect(runtime.fullFooter).toBe(true);
  });
});

describe("3-Tier Badge Compaction & Configuration Lifecycle", () => {
  it("beautifyStatus strips ready while keeping chrome and ‹◆›, whereas toolflow preserves -1.4k in compact mode", () => {
    const chromeCompact =
      beautifyStatus("chrome", "ready", mockTheme, "nord", undefined, { compact: true }) || "";
    expect(chromeCompact).toContain("chrome");
    expect(chromeCompact).toContain("‹");
    expect(chromeCompact).toContain("◆");
    expect(chromeCompact).toContain("›");
    expect(chromeCompact).not.toContain("ready");

    const toolflowCompact =
      beautifyStatus("toolflow", "⌬ -1.4k", mockTheme, "nord", undefined, { compact: true }) || "";
    expect(toolflowCompact).toContain("toolflow");
    expect(toolflowCompact).toContain("-1.4k");
  });

  it("formatFoldedBadges Tier 2 keeps all badges visible in compact form at intermediate terminal widths before falling back to Tier 3 (+N idle)", () => {
    const badges: Badge[] = [
      {
        key: "chrome",
        val: "ready",
        rendered: "chrome ❯ ● ready",
        width: 16,
        compactRendered: "chrome ❯ ●",
        compactWidth: 10,
        isHighPriority: false,
      },
      {
        key: "plan",
        val: "ready",
        rendered: "plan ❯ ● ready",
        width: 14,
        compactRendered: "plan ❯ ●",
        compactWidth: 8,
        isHighPriority: false,
      },
      {
        key: "toolflow",
        val: "running",
        rendered: "toolflow ❯ ◐ 1/3",
        width: 16,
        compactRendered: "toolflow ❯ ◐ 1/3",
        compactWidth: 16,
        isHighPriority: true,
      },
    ];

    // Tier 1 (Full): width 55 >= 50 -> All 3 full badges visible
    const tier1 = formatFoldedBadges(badges, 55, mockTheme);
    expect(tier1).toContain("chrome ❯ ● ready");
    expect(tier1).toContain("plan ❯ ● ready");
    expect(tier1).toContain("toolflow ❯ ◐ 1/3");
    expect(tier1).not.toContain("idle");

    // Tier 2 (Compact): intermediate width 42 (compact joined = 38 <= 42 < 50 full)
    const tier2 = formatFoldedBadges(badges, 42, mockTheme);
    expect(tier2).toContain("chrome ❯ ●");
    expect(tier2).toContain("plan ❯ ●");
    expect(tier2).toContain("toolflow ❯ ◐ 1/3");
    expect(tier2).not.toContain("ready");
    expect(tier2).not.toContain("idle");

    // Tier 3 (Folded): width 30 < 38 -> falls back to priority folding
    const tier3 = formatFoldedBadges(badges, 30, mockTheme);
    expect(tier3).toContain("toolflow ❯ ◐ 1/3");
    expect(tier3).toContain("(+2 idle)");
    expect(tier3).not.toContain("chrome");
  });

  it("renderBeautifiedFooter uses Tier 2 compaction on medium-width terminals so idle plugins stay visible as compact glyph badges", () => {
    const mockFooterData = {
      getGitBranch: () => "main",
      getExtensionStatuses: () =>
        new Map([
          ["pi-control-chrome", "ready"],
          ["plan", "ready"],
          ["toolflow", "running 1/3"],
        ]),
    };
    const mockCtx = {
      cwd: project,
      model: { id: "claude-3.5" },
      sessionManager: { getBranch: () => [] },
    };

    // 1. Wide terminal (width = 80): Tier 1 Full (all visible, includes "ready")
    const wideLines = renderBeautifiedFooter(80, null, mockTheme, mockFooterData, mockCtx, "stream");
    const cleanWide = wideLines[1].replace(/\[\/?\w+\]/g, "");
    expect(cleanWide).toContain("chrome");
    expect(cleanWide).toContain("plan");
    expect(cleanWide).toContain("toolflow");
    expect(cleanWide).toContain("ready");
    expect(cleanWide).not.toContain("idle");

    // 2. Medium terminal (width = 50): Tier 2 Compact (all visible as compact glyph badges without folding into idle)
    const medLines = renderBeautifiedFooter(50, null, mockTheme, mockFooterData, mockCtx, "stream");
    const cleanMed = medLines[1].replace(/\[\/?\w+\]/g, "");
    expect(cleanMed).toContain("chrome");
    expect(cleanMed).toContain("plan");
    expect(cleanMed).toContain("toolflow");
    expect(cleanMed).not.toContain("ready");
    expect(cleanMed).not.toContain("idle");

    // 3. Narrow terminal (width = 33): Tier 3 Folded (compact badges exceed budget, folds idle into (+2 idle))
    const narrowLines = renderBeautifiedFooter(33, null, mockTheme, mockFooterData, mockCtx, "stream");
    const cleanNarrow = narrowLines[1].replace(/\[\/?\w+\]/g, "");
    expect(cleanNarrow).toContain("toolflow");
    expect(cleanNarrow).toContain("(+2 idle)");
  });
});
