import { describe, it, expect } from "vitest";
import {
  beautifyStatus,
  getStringWidth,
  sliceToVisualWidth,
  padToVisualWidth,
  renderBeautifiedFooter,
  loadConfig
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
  });
});
