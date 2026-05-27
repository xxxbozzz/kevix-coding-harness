import { describe, it, expect } from "vitest";
import { executeRead } from "../../src/tools/read.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

const DIR = "/tmp/kevix-read-test";

describe("read tool", () => {
  it("reads file with line numbers", async () => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(DIR + "/test.txt", "line1\nline2\nline3");
    const result = await executeRead({ file_path: DIR + "/test.txt" });
    expect(result.content).toContain("1\tline1");
    expect(result.content).toContain("2\tline2");
    expect(result.content).toContain("3\tline3");
    rmSync(DIR, { recursive: true, force: true });
  });

  it("errors on missing file", async () => {
    const result = await executeRead({ file_path: "/tmp/kevix-nonexistent-xyz.txt" });
    expect(result.is_error).toBe(true);
  });

  it("respects offset and limit", async () => {
    mkdirSync(DIR, { recursive: true });
    const content = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n");
    writeFileSync(DIR + "/lines.txt", content);
    const result = await executeRead({ file_path: DIR + "/lines.txt", offset: 5, limit: 3 });
    expect(result.content).toContain("6\tline6");
    expect(result.content).toContain("6\tline6");
    expect(result.content).not.toContain("9\tline9");
    rmSync(DIR, { recursive: true, force: true });
  });
});
