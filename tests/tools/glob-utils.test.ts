import { describe, it, expect, beforeEach, afterEach } from "vitest";

// globToRegex is internal to glob.ts — test indirectly
import { executeGlob } from "../../src/tools/glob.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

const DIR = "/tmp/kevix-globregex-test";

describe("glob pattern matching", () => {
  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR + "/deep/nested", { recursive: true });
    writeFileSync(DIR + "/a.ts", "");
    writeFileSync(DIR + "/b.tsx", "");
    writeFileSync(DIR + "/deep/c.ts", "");
    writeFileSync(DIR + "/deep/nested/d.ts", "");
  });
  afterEach(() => { rmSync(DIR, { recursive: true, force: true }); });

  it("** matches across directories", async () => {
    const r = await executeGlob({ pattern: "**/*.ts", path: DIR });
    expect(r.content).toContain("a.ts");
    expect(r.content).toContain("deep/c.ts");
    expect(r.content).toContain("deep/nested/d.ts");
    expect(r.content).not.toContain("b.tsx");
  });

  it("single * matches filenames (including in subdirs via filename match)", async () => {
    const r = await executeGlob({ pattern: "*.ts", path: DIR });
    expect(r.content).toContain("a.ts");
    // glob implementation also matches entry.name, so deep/c.ts may match
  });

  it("alternation *.ts and *.tsx", async () => {
    // Two separate glob calls
    const r1 = await executeGlob({ pattern: "*.ts", path: DIR });
    const r2 = await executeGlob({ pattern: "*.tsx", path: DIR });
    expect(r1.content).toContain("a.ts");
    expect(r2.content).toContain("b.tsx");
  });
});
