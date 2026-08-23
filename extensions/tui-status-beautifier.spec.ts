import { describe, it, expect, vi } from "vitest";
import { beautifyStatus, googleColorize } from "./tui-status-beautifier";

describe("TUI Status Beautifier Code Optimization Tests", () => {
  const mockTheme = {
    fg: (color: string, text: string) => `[${color}]${text}[/color]`,
  };

  describe("ANSI Escape Sequence Stripping & Metric Extraction (Finding 1)", () => {
    it("should correctly clean parameterized 256-color sequences without leaves/parameters leaking", () => {
      const input = "\x1B[38;5;108mactive\x1B[0m (12)";
      const output = beautifyStatus("test-extension", input, mockTheme, "minimal");

      // Expected metric: 12. If parameters like 38 or 5 leaked, they might be matched as metric instead.
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

  describe("Fast-Path Optimization (Finding 2)", () => {
    it("should process simple text correctly and avoid unnecessary matches", () => {
      const output = beautifyStatus("my-plugin", "running 5/5", mockTheme, "minimal");
      expect(output).toContain("my");
      expect(output).toContain("(5/5)");
    });
  });

  describe("Google Colorize Memoization/Cache (Finding 5)", () => {
    it("should cache subsequent calls for the same text to avoid redundant mapping and theme calls", () => {
      const text = "plug";
      const fgSpy = vi.fn((color: string, text: string) => `[${color}]${text}[/color]`);
      const customTheme = { fg: fgSpy };

      const firstCall = googleColorize(text, customTheme);
      const secondCall = googleColorize(text, customTheme);

      // Verify they return the same colorized string
      expect(firstCall).toBe(secondCall);

      // Due to cache/memoization, fgSpy should only be called search length times once
      expect(fgSpy).toHaveBeenCalledTimes(text.length);
    });
  });

  describe("Layout Preset Rendering", () => {
    it("should render apple style", () => {
      const output = beautifyStatus("test", "active", mockTheme, "apple");
      expect(output).toContain("│");
      expect(output).toContain("●");
    });

    it("should render openai style", () => {
      const output = beautifyStatus("test", "active", mockTheme, "openai");
      expect(output).toContain("❂");
    });

    it("should render anthropic style", () => {
      const output = beautifyStatus("test", "active", mockTheme, "anthropic");
      expect(output).toContain("✦");
    });

    it("should return raw output when style is off", () => {
      const output = beautifyStatus("test", "active (5)", mockTheme, "off");
      expect(output).toBe("active (5)");
    });
  });
});
