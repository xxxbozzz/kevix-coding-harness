import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeGrep } from "../../src/tools/grep.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

const DIR = "/tmp/kevix-grep-test";

describe("grep tool", () => {
  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
    writeFileSync(DIR + "/a.ts", "const x = 1;\nfunction foo() {}\nreturn x;");
    writeFileSync(DIR + "/b.ts", "const y = 2;\nexport default y;");
  });
  afterEach(() => { rmSync(DIR, { recursive: true, force: true }); });

  it("finds pattern in files", async () => {
    const result = await executeGrep({ pattern: "function", path: DIR });
    expect(result.content).toContain("foo");
  });

  it("returns empty on no match", async () => {
    const result = await executeGrep({ pattern: "zzzNOTFOUND", path: DIR });
    expect(result.content).not.toContain("a.ts");
  });

  it("handles regex patterns", async () => {
    const result = await executeGrep({ pattern: "const\\s+\\w", path: DIR });
    expect(result.content).toContain("const x");
    expect(result.content).toContain("const y");
  });
});
