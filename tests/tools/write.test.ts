import { describe, it, expect } from "vitest";
import { executeWrite } from "../../src/tools/write.js";
import { readFileSync, rmSync } from "node:fs";

const DIR = "/tmp/kevix-write-test";

describe("write tool", () => {
  it("creates file with content", async () => {
    rmSync(DIR, { recursive: true, force: true });
    const result = await executeWrite({ file_path: DIR + "/new.txt", content: "hello world" });
    expect(result.is_error).toBeFalsy();
    expect(readFileSync(DIR + "/new.txt", "utf-8")).toBe("hello world");
    rmSync(DIR, { recursive: true, force: true });
  });

  it("creates parent directories", async () => {
    rmSync(DIR, { recursive: true, force: true });
    await executeWrite({ file_path: DIR + "/a/b/c/deep.txt", content: "deep" });
    expect(readFileSync(DIR + "/a/b/c/deep.txt", "utf-8")).toBe("deep");
    rmSync(DIR, { recursive: true, force: true });
  });

  it("overwrites existing file", async () => {
    rmSync(DIR, { recursive: true, force: true });
    await executeWrite({ file_path: DIR + "/overwrite.txt", content: "v1" });
    await executeWrite({ file_path: DIR + "/overwrite.txt", content: "v2" });
    expect(readFileSync(DIR + "/overwrite.txt", "utf-8")).toBe("v2");
    rmSync(DIR, { recursive: true, force: true });
  });
});
