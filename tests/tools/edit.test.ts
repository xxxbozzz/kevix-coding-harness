import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeEdit } from "../../src/tools/edit.js";
import { writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";

const DIR = "/tmp/kevix-edit-test";

describe("edit tool", () => {
  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
  });
  afterEach(() => { rmSync(DIR, { recursive: true, force: true }); });

  it("replaces exact string", async () => {
    writeFileSync(DIR + "/f.txt", "hello world");
    const result = await executeEdit({ file_path: DIR + "/f.txt", old_string: "hello", new_string: "hi" });
    expect(result.is_error).toBeFalsy();
    expect(readFileSync(DIR + "/f.txt", "utf-8")).toBe("hi world");
  });

  it("fails when old_string not unique", async () => {
    writeFileSync(DIR + "/f.txt", "hello hello");
    const result = await executeEdit({ file_path: DIR + "/f.txt", old_string: "hello", new_string: "hi" });
    expect(result.is_error).toBe(true);
  });

  it("fails when old_string not found", async () => {
    writeFileSync(DIR + "/f.txt", "hello world");
    const result = await executeEdit({ file_path: DIR + "/f.txt", old_string: "xyz", new_string: "abc" });
    expect(result.is_error).toBe(true);
  });

  it("fails on missing file", async () => {
    const result = await executeEdit({ file_path: DIR + "/nope.txt", old_string: "x", new_string: "y" });
    expect(result.is_error).toBe(true);
  });
});
