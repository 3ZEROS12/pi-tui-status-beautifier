import { describe, it, expect } from "vitest";
import {
  beautifyStatus,
  getStringWidth,
  sliceToVisualWidth,
  padToVisualWidth,
  renderBeautifiedFooter,
  formatFoldedBadges,
  type Badge,
} from "./tui-status-beautifier";

describe("TUI Status Beautifier Tests", () => {
  const mockTheme = {
    fg: (color: string, text: string) => `[${color}]${text}[/color]`,
    inverse: (text: string) => `[inv]${text}[/inv]`,
  };

  describe("ANSI Escape Sequence Stripping & Metric Extraction", () => {
    it("should correctly clean parameterized 256-color sequences without parameters leaking", () => {
      const input = "\x1B[38;5;108mactive\x1B[0m (12)";
      const output = beautifyStatus("test-extension", input, mockTheme, "minimal");

      expect(output).toContain("(12)");
      expect(output).not.toContain("38");
      expect(output).not.toContain("5");
    });

    it("should correctly clean truecolor RGB sequences", () => {
      const input = "\x1B[38;2;255;0;255mactive\x1B[0m (45)";
      const output = beautifyStatus("test-extension", input, mockTheme, "minimal");

      expect(output).toContain("(45)");
      expect(output).not.toContain("255");
      expect(output).not.toContain("0");
    });
  });

  describe("Fast-Path Optimization", () => {
    it("should process simple text correctly and extract fraction metrics", () => {
      const output = beautifyStatus("my-plugin", "running 5/5", mockTheme, "minimal");
      expect(output).toContain("my");
      expect(output).toContain("(5/5)");
    });
  });

  describe("Layout Preset Rendering", () => {
    it("should render stream (default) style with natural compact width", () => {
      const output = beautifyStatus("test", "active", mockTheme, "stream");
      expect(output).toContain("test");
      expect(output).toContain("❯");
      expect(output).toContain("●");
      // Natural width: no 6 trailing spaces
      expect(output).not.toContain("test      ");
    });

    it("should render powerline style with angled brackets and diamond glyph", () => {
      const output = beautifyStatus("chrome", "ready", mockTheme, "powerline");
      expect(output).toContain("chrome");
      expect(output).toContain("‹");
      expect(output).toContain("◆");
      expect(output).toContain("ready");
      expect(output).toContain("›");
    });

    it("should render matrix style with dot-matrix brackets and star glyph", () => {
      const output = beautifyStatus("chrome", "ready", mockTheme, "matrix");
      expect(output).toContain("chrome");
      expect(output).toContain("⦗");
      expect(output).toContain("✦");
      expect(output).toContain("ready");
      expect(output).toContain("⦘");
    });

    it("should render glow style", () => {
      const output = beautifyStatus("test", "active", mockTheme, "glow");
      expect(output).toContain("[inv]");
      expect(output).toContain("●");
    });

    it("should render claude style (Anthropic warm minimalist dot separator)", () => {
      const output = beautifyStatus("chrome", "ready", mockTheme, "claude");
      expect(output).toContain("chrome");
      expect(output).toContain("·");
      expect(output).toContain("●");
      expect(output).toContain("ready");
    });

    it("should render openai style (GPT slate emerald tokens)", () => {
      const output = beautifyStatus("chrome", "ready", mockTheme, "openai");
      expect(output).toContain("chrome");
      expect(output).toContain("⦋");
      expect(output).toContain("▪");
      expect(output).toContain("ready");
      expect(output).toContain("⦌");
    });

    it("should render gemini style (celestial sparkle gradients)", () => {
      const output = beautifyStatus("chrome", "ready", mockTheme, "gemini");
      expect(output).toContain("chrome");
      expect(output).toContain("✧");
      expect(output).toContain("✦");
      expect(output).toContain("ready");
    });

    it("should render linear style (high-density chevron)", () => {
      const output = beautifyStatus("chrome", "ready", mockTheme, "linear");
      expect(output).toContain("chrome");
      expect(output).toContain("❯");
      expect(output).toContain("●");
    });

    it("should render tokyo night and nord presets cleanly", () => {
      const tokyo = beautifyStatus("chrome", "ready", mockTheme, "tokyo");
      expect(tokyo).toContain("⦗");
      expect(tokyo).toContain("✦");
      expect(tokyo).toContain("⦘");

      const nord = beautifyStatus("chrome", "ready", mockTheme, "nord");
      expect(nord).toContain("‹");
      expect(nord).toContain("◆");
      expect(nord).toContain("›");
    });

    it("should render custom style using configuration object", () => {
      const customCfg = {
        separator: " │ ",
        brackets: ["‹", "›"] as [string, string],
        glyphs: { success: "◆", error: "▲" }
      };
      const output = beautifyStatus("test", "active (2/5)", mockTheme, "custom", customCfg);
      expect(output).toContain("test");
      expect(output).toContain("│");
      expect(output).toContain("‹");
      expect(output).toContain("◆");
      expect(output).toContain("2/5");
      expect(output).toContain("›");
    });

    it("should beautify chrome: ready with custom tokyo night style", () => {
      const tokyoNightCfg = {
        separator: " » ",
        brackets: ["«", "»"] as [string, string],
        glyphs: {
          success: "✦",
          warning: "◇",
          error: "✖",
          accent: "✧"
        },
        prefix: "✦ ",
        suffix: ""
      };
      const output = beautifyStatus("pi-control-chrome", "chrome: ready", mockTheme, "custom", tokyoNightCfg);
      expect(output).toContain("chrome");
      expect(output).toContain("✦");
      expect(output).toContain("«");
      expect(output).toContain("»");
    });

    it("should return raw output when style is off or default", () => {
      expect(beautifyStatus("test", "active (5)", mockTheme, "off")).toBe("active (5)");
      expect(beautifyStatus("test", "active (5)", mockTheme, "default")).toBe("active (5)");
      expect(beautifyStatus("test", "active (5)", mockTheme, "none")).toBe("active (5)");
      expect(beautifyStatus("test", "active (5)", mockTheme, "raw")).toBe("active (5)");
    });
  });

  describe("Visual Cell Width calculations", () => {
    it("correctly identifies character width of full-width CJK characters and emojis", () => {
      expect(getStringWidth("")).toBe(0);
      expect(getStringWidth("hello")).toBe(5);
      expect(getStringWidth("测试")).toBe(4);
      expect(getStringWidth("测试hello")).toBe(9);
      expect(getStringWidth("🚀")).toBe(2);
      expect(getStringWidth("こんにちは")).toBe(10);
      expect(getStringWidth("안녕하세요")).toBe(10);
    });

    it("slices strings to specified visual cell width without cutting characters in half", () => {
      expect(sliceToVisualWidth("hello", 3)).toBe("hel");
      expect(sliceToVisualWidth("测试", 3)).toBe("测");
      expect(sliceToVisualWidth("测试", 4)).toBe("测试");
      expect(sliceToVisualWidth("🚀💡📌", 4)).toBe("🚀💡");
      expect(sliceToVisualWidth("🚀a", 2)).toBe("🚀");
    });

    it("pads strings to target visual width", () => {
      expect(padToVisualWidth("测试", 10)).toBe("测试      ");
      expect(padToVisualWidth("hello", 10)).toBe("hello     ");
    });

    it("fully aligns CJK name layouts to exactly 10 columns visually", () => {
      const output1 = beautifyStatus("测试", "active", mockTheme, "minimal") || "";
      const output2 = beautifyStatus("hello", "active", mockTheme, "minimal") || "";

      const clean1 = output1.replace(/\[\/?\w+\]/g, "");
      const clean2 = output2.replace(/\[\/?\w+\]/g, "");

      const namePart1 = clean1.split(" ❯ ")[0];
      const namePart2 = clean2.split(" ❯ ")[0];

      expect(getStringWidth(namePart1)).toBe(10);
      expect(getStringWidth(namePart2)).toBe(10);
    });
  });

  describe("Full-Footer Beautification (renderBeautifiedFooter)", () => {
    it("renders both top status line and active extension badges", () => {
      const mockFooterData = {
        getGitBranch: () => "main",
        getExtensionStatuses: () => new Map([["pi-control-chrome", "chrome: ready"]])
      };
      const mockCtx = {
        cwd: "D:/Workspace/test",
        model: { id: "gemini-3.8-flash-high" },
        sessionManager: {
          getBranch: () => [
            {
              type: "message",
              message: { role: "assistant", usage: { input: 12000, output: 2200 } }
            }
          ]
        }
      };

      const lines = renderBeautifiedFooter(80, null, mockTheme, mockFooterData, mockCtx, "minimal");
      expect(lines.length).toBe(2);
      expect(lines[0]).toContain("test (main)");
      expect(lines[0]).toContain("gemini-3.8-flash-high");
      expect(lines[1]).toContain("chrome");
      expect(lines[1]).toContain("●");
    });

    it("renders custom Tokyo Night layout in full-footer mode", () => {
      const mockFooterData = {
        getGitBranch: () => "feature",
        getExtensionStatuses: () => new Map([["pi-control-chrome", "chrome: ready"]])
      };
      const mockCtx = {
        cwd: "D:/Workspace/test",
        model: { id: "claude-3.5" },
        sessionManager: { getBranch: () => [] }
      };
      const tokyoCfg = {
        separator: " » ",
        brackets: ["«", "»"] as [string, string],
        glyphs: { success: "✦" },
        prefix: "✦ "
      };

      const lines = renderBeautifiedFooter(80, null, mockTheme, mockFooterData, mockCtx, "custom", tokyoCfg);
      expect(lines[0]).toContain("test (feature)");
      expect(lines[0]).toContain("claude-3.5");
      const cleanLine2 = lines[1].replace(/\[\/?\w+\]/g, "");
      expect(cleanLine2).toContain("✦ chrome");
      expect(cleanLine2).toContain("«✦ ready»");
    });

    it("computes cumulative cache hit rate across multiple turns in footer", () => {
      const mockFooterData = {
        getGitBranch: () => "main",
        getExtensionStatuses: () => new Map()
      };
      // Turn 1: 100 input, 50 cacheRead, 50 cacheWrite -> prompt = 200, hitRate = 25%
      // Turn 2: 100 input, 150 cacheRead, 50 cacheWrite -> prompt = 300, hitRate = 50%
      // Cumulative: 200 input, 200 cacheRead, 100 cacheWrite -> prompt = 500, hitRate = 40.0%
      const mockCtx = {
        cwd: "D:/Workspace/test",
        model: { id: "claude-3.5-sonnet" },
        sessionManager: {
          getBranch: () => [
            {
              type: "message",
              message: { role: "assistant", usage: { input: 100, cacheRead: 50, cacheWrite: 50 } }
            },
            {
              type: "message",
              message: { role: "assistant", usage: { input: 100, cacheRead: 150, cacheWrite: 50 } }
            }
          ]
        }
      };

      const lines = renderBeautifiedFooter(120, null, mockTheme, mockFooterData, mockCtx, "minimal");
      expect(lines[0]).toContain("CH40.0%");
    });

    it("computes cumulative cache hit rate for type === 'usage' entries", () => {
      const mockFooterData = {
        getGitBranch: () => "main",
        getExtensionStatuses: () => new Map()
      };
      const mockCtx = {
        cwd: "D:/Workspace/test",
        model: { id: "claude-3.5-sonnet" },
        sessionManager: {
          getBranch: () => [
            {
              type: "usage",
              usage: { input: 200, cacheRead: 800, cacheWrite: 0 }
            }
          ]
        }
      };

      const lines = renderBeautifiedFooter(120, null, mockTheme, mockFooterData, mockCtx, "minimal");
      // 800 / (200 + 800) * 100 = 80.0%
      expect(lines[0]).toContain("CH80.0%");
    });

    it("clamps Line 1 within terminal width on narrow terminals (width = 40)", () => {
      const mockFooterData = {
        getGitBranch: () => "feature/long-branch-name-overflow",
        getExtensionStatuses: () => new Map()
      };
      const mockCtx = {
        cwd: "D:/Workspace/very-long-project-folder-name",
        model: { id: "claude-3-5-sonnet-20241022" },
        sessionManager: {
          getBranch: () => [
            {
              type: "message",
              message: { role: "assistant", usage: { input: 12000, output: 2200, cacheRead: 5000 } }
            }
          ]
        }
      };

      const lines = renderBeautifiedFooter(40, null, mockTheme, mockFooterData, mockCtx, "minimal");
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const plainLine1 = lines[0].replace(/\[\/?\w+\]/g, "");
      expect(getStringWidth(plainLine1)).toBeLessThanOrEqual(40);
    });

    it("clamps Line 1 within terminal width on extreme narrow terminals (width = 20)", () => {
      const mockFooterData = {
        getGitBranch: () => "master",
        getExtensionStatuses: () => new Map()
      };
      const mockCtx = {
        cwd: "D:/Workspace/test",
        model: { id: "gemini-3.8-flash" },
        sessionManager: { getBranch: () => [] }
      };

      const lines = renderBeautifiedFooter(20, null, mockTheme, mockFooterData, mockCtx, "minimal");
      const plainLine1 = lines[0].replace(/\[\/?\w+\]/g, "");
      expect(getStringWidth(plainLine1)).toBeLessThanOrEqual(20);
    });
  });

  describe("Ecosystem Status Badges Parsing & Metric Preservation", () => {
    it("preserves anchor metric 2 intact without bypassing beautifyStatus", () => {
      const output = beautifyStatus("anchor", "⌖ 2", mockTheme, "stream") || "";
      expect(output).toContain("anchor");
      expect(output).toContain("⌖");
      expect(output).toContain("(2)");
      expect(output).not.toBe("⌖ 2");
    });

    it("preserves toolflow compact delta -1.4k intact without corrupting into 1", () => {
      const output = beautifyStatus("toolflow", "⌬ -1.4k", mockTheme, "stream") || "";
      expect(output).toContain("toolflow");
      expect(output).toContain("⌬");
      expect(output).toContain("(-1.4k)");
      expect(output).not.toContain("(1)");
    });

    it("preserves toolflow signed delta -250 intact", () => {
      const output = beautifyStatus("toolflow", "⌬ -250", mockTheme, "stream") || "";
      expect(output).toContain("toolflow");
      expect(output).toContain("(-250)");
    });

    it("preserves toolflow compound fraction and delta metric", () => {
      const output = beautifyStatus("toolflow", "⌬ [1/3 · Setup] · ⌬ -1.4k", mockTheme, "stream") || "";
      expect(output).toContain("toolflow");
      expect(output).toContain("1/3");
      expect(output).toContain("-1.4k");
    });

    it("preserves lingual language pair intact without corruption", () => {
      const output = beautifyStatus("lingual", "zh ⇄ en · Companion", mockTheme, "stream") || "";
      expect(output).toContain("lingual");
      expect(output).toContain("⇄");
      expect(output).toContain("zh ⇄ en · Companion");
    });

    it("handles active lingual polishing status with micro-spinner", () => {
      const output = beautifyStatus("lingual", "⇄ [lingual] polishing...", mockTheme, "stream") || "";
      expect(output).toContain("lingual");
      const clean = output.replace(/\[\/?\w+\]/g, "");
      expect(/lingual ❯ [◐◓◑◒]/.test(clean)).toBe(true);
    });
  });

  describe("Adaptive Badge Folding & Symbology", () => {
    it("assigns ⌖ symbol to anchor and ⌬ symbol to toolflow across stream, powerline, and matrix presets", () => {
      for (const preset of ["stream", "powerline", "matrix", "glass"]) {
        const anchorOut = beautifyStatus("anchor", "ready", mockTheme, preset) || "";
        const toolflowOut = beautifyStatus("toolflow", "ready", mockTheme, preset) || "";
        const lingualOut = beautifyStatus("lingual", "ready", mockTheme, preset) || "";
        expect(anchorOut).toContain("⌖");
        expect(toolflowOut).toContain("⌬");
        expect(lingualOut).toContain("⇄");
      }
    });

    it("folds idle badges into (+N idle) on narrow terminal widths", () => {
      const rawBadges = [
        { key: "chrome", val: "ready", rendered: "chrome ❯ ● ready", isHighPriority: false },
        { key: "plan", val: "ready", rendered: "plan ❯ ● ready", isHighPriority: false },
        { key: "toolflow", val: "running", rendered: "toolflow ❯ ◐ 1/3", isHighPriority: true },
        { key: "subagent", val: "ready", rendered: "subagent ❯ ● ready", isHighPriority: false },
      ];

      // On wide terminal: renders all
      const wide = formatFoldedBadges(rawBadges, 200, mockTheme);
      expect(wide).toContain("chrome");
      expect(wide).toContain("plan");
      expect(wide).toContain("subagent");
      expect(wide).not.toContain("idle");

      // On narrow terminal (e.g. 50 chars max): keeps running toolflow and folds idle badges!
      const narrow = formatFoldedBadges(rawBadges, 50, mockTheme);
      expect(narrow).toContain("toolflow");
      expect(narrow).toContain("(+3 idle)");
    });
  });

  describe("3-Tier Badge Compaction (Tier 1 Full ➔ Tier 2 Compact Idle ➔ Tier 3 Folded)", () => {
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

    it("strips generic idle words in compact mode while preserving natural width and metrics", () => {
      // Skips 10-column padding in minimal preset when compact: true
      const minimalCompact =
        beautifyStatus("chrome", "ready", mockTheme, "minimal", undefined, { compact: true }) || "";
      const cleanMin = minimalCompact.replace(/\[\/?\w+\]/g, "");
      expect(cleanMin.startsWith("chrome ❯")).toBe(true);

      for (const word of ["ready", "idle", "ok", "online", "active", "connected", "listening"]) {
        const out = beautifyStatus("chrome", word, mockTheme, "stream", undefined, { compact: true }) || "";
        expect(out).toContain("chrome");
        expect(out).toContain("●");
        expect(out).not.toContain(word);
      }

      // Meaningful metrics are preserved
      expect(beautifyStatus("anchor", "⌖ 2", mockTheme, "stream", undefined, { compact: true })).toContain("(2)");
      expect(
        beautifyStatus("toolflow", "⌬ [1/3 · Setup] · ⌬ -1.4k", mockTheme, "stream", undefined, { compact: true })
      ).toContain("1/3");
      expect(
        beautifyStatus("lingual", "zh ⇄ en · Companion", mockTheme, "stream", undefined, { compact: true })
      ).toContain("zh ⇄ en · Companion");
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
        cwd: "D:/Workspace/test",
        model: { id: "gemini-3.8-flash" },
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
});
