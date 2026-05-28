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

  it("rejects old_string same as new_string", async () => {
    writeFileSync(DIR + "/same.txt", "hello world");
    const result = await executeEdit({ file_path: DIR + "/same.txt", old_string: "hello", new_string: "hello" });
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("identical");
  });

  it("matches with trimmed whitespace strategy", async () => {
    writeFileSync(DIR + "/trim.txt", "hello world");
    const result = await executeEdit({ file_path: DIR + "/trim.txt", old_string: "  hello world  ", new_string: "hi world" });
    expect(result.is_error).toBe(false);
    expect(readFileSync(DIR + "/trim.txt", "utf-8")).toBe("hi world");
  });

  it("returns file context when old_string not found", async () => {
    writeFileSync(DIR + "/ctx.txt", "line1\nline2\nfunction foo() {}\nline4\nline5");
    const result = await executeEdit({ file_path: DIR + "/ctx.txt", old_string: "function bar() {}", new_string: "function baz() {}" });
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("line 3");
  });
