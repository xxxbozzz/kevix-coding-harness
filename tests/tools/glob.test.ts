import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeGlob } from "../../src/tools/glob.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

const DIR = "/tmp/kevix-glob-test";

describe("glob tool", () => {
  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR + "/sub", { recursive: true });
    writeFileSync(DIR + "/a.ts", "");
    writeFileSync(DIR + "/b.ts", "");
    writeFileSync(DIR + "/sub/c.ts", "");
    writeFileSync(DIR + "/readme.md", "");
  });
  afterEach(() => { rmSync(DIR, { recursive: true, force: true }); });

  it("matches *.ts pattern", async () => {
    const result = await executeGlob({ pattern: "*.ts", path: DIR });
    expect(result.content).toContain("a.ts");
    expect(result.content).toContain("b.ts");
    expect(result.content).not.toContain("readme.md");
  });

  it("matches ** recursive pattern", async () => {
    const result = await executeGlob({ pattern: "**/*.ts", path: DIR });
    expect(result.content).toContain("sub/c.ts");
  });

  it("returns empty on no match", async () => {
    const result = await executeGlob({ pattern: "*.py", path: DIR });
    expect(result.content).toContain("No files found");
  });
});
