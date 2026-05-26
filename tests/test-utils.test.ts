import { describe, it, expect, vi, beforeEach } from "vitest";
import { runQuickCheck } from "../src/pean/test-utils.js";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "child_process";

const ok = Buffer.from("");

describe("runQuickCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("both commands succeed -> { build_ok: true, test_ok: true }", () => {
    vi.mocked(execSync).mockImplementation(() => ok); // no throw
    expect(runQuickCheck()).toEqual({ build_ok: true, test_ok: true });
  });

  it("TypeScript fails -> { build_ok: false, test_ok: true }", () => {
    const tscError = Object.assign(new Error("Command failed"), { status: 1 });
    vi.mocked(execSync)
      .mockImplementationOnce(() => { throw tscError; })
      .mockImplementationOnce(() => ok);
    expect(runQuickCheck()).toEqual({ build_ok: false, test_ok: true });
  });

  it("Vitest fails -> { build_ok: true, test_ok: false }", () => {
    const vitestError = Object.assign(new Error("Command failed"), { status: 1 });
    vi.mocked(execSync)
      .mockImplementationOnce(() => ok)
      .mockImplementationOnce(() => { throw vitestError; });
    expect(runQuickCheck()).toEqual({ build_ok: true, test_ok: false });
  });

  it("spawn error (no status) -> false for that boolean", () => {
    const spawnError = new Error("spawn ENOENT"); // no status property
    vi.mocked(execSync)
      .mockImplementationOnce(() => { throw spawnError; })
      .mockImplementationOnce(() => ok);
    expect(runQuickCheck()).toEqual({ build_ok: false, test_ok: true });
  });

  it("correct command strings are passed to execSync", () => {
    vi.mocked(execSync).mockImplementation(() => ok);
    runQuickCheck();
    expect(vi.mocked(execSync)).toHaveBeenNthCalledWith(1, "npx tsc --noEmit", { stdio: "pipe" });
    expect(vi.mocked(execSync)).toHaveBeenNthCalledWith(2, "npx vitest run", { stdio: "pipe" });
  });
});
