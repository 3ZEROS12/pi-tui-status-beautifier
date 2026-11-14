import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";

const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
const mode = { failTargetWrites: false };

// The settings writer must survive a Windows-style locked target. Both replacement
// strategies are forced to fail so the test can assert the old file is still intact.
vi.mock("node:fs", () => ({
  ...realFs,
  renameSync: (from: Parameters<typeof realFs.renameSync>[0], to: Parameters<typeof realFs.renameSync>[1]) => {
    if (mode.failTargetWrites && String(to).endsWith("settings.json")) {
      throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    }
    return realFs.renameSync(from, to);
  },
  copyFileSync: (from: Parameters<typeof realFs.copyFileSync>[0], to: Parameters<typeof realFs.copyFileSync>[1]) => {
    if (mode.failTargetWrites && String(to).endsWith("settings.json")) {
      throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
    }
    return realFs.copyFileSync(from, to);
  },
}));

const { writeBeautifierSettings } = await import("./tui-status-beautifier");

let home: string;
let previousHome: string | undefined;
let previousUserProfile: string | undefined;
let previousAgentDir: string | undefined;
let previousConfigDir: string | undefined;

const settingsPath = () => path.join(home, ".pi", "agent", "settings.json");

beforeAll(() => {
  previousHome = process.env.HOME;
  previousUserProfile = process.env.USERPROFILE;
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  previousConfigDir = process.env.PI_CONFIG_DIR;
  home = realFs.mkdtempSync(path.join(os.tmpdir(), "beautifier-write-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.PI_CODING_AGENT_DIR;
  delete process.env.PI_CONFIG_DIR;
});

afterAll(() => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  if (previousUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = previousUserProfile;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousConfigDir === undefined) delete process.env.PI_CONFIG_DIR;
  else process.env.PI_CONFIG_DIR = previousConfigDir;
  realFs.rmSync(home, { recursive: true, force: true });
});

function seedSettings(): void {
  realFs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  realFs.writeFileSync(
    settingsPath(),
    JSON.stringify({ beautifier: { style: "nord" }, unrelated: { keep: true } }, null, 2),
    "utf-8"
  );
}

describe("atomic settings write", () => {
  it("leaves the previous settings intact when every replacement strategy fails", () => {
    seedSettings();
    mode.failTargetWrites = true;
    try {
      expect(() => writeBeautifierSettings(settingsPath(), "claude", true)).toThrow();
    } finally {
      mode.failTargetWrites = false;
    }

    expect(JSON.parse(realFs.readFileSync(settingsPath(), "utf-8"))).toEqual({
      beautifier: { style: "nord" },
      unrelated: { keep: true },
    });
    const leftovers = realFs.readdirSync(path.dirname(settingsPath())).filter((f) => f.includes(".tmp."));
    expect(leftovers).toEqual([]);
  });
});
