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
    const r = await executeEdit({ file_path: DIR + "/f.txt", old_string: "hello", new_string: "hi" });
    expect(r.is_error).toBe(false);
    expect(readFileSync(DIR + "/f.txt", "utf-8")).toBe("hi world");
  });

  it("fails when old_string not unique", async () => {
    writeFileSync(DIR + "/f.txt", "hello hello");
    const r = await executeEdit({ file_path: DIR + "/f.txt", old_string: "hello", new_string: "hi" });
    expect(r.is_error).toBe(true);
  });

  it("fails when old_string not found", async () => {
    writeFileSync(DIR + "/f.txt", "hello world");
    const r = await executeEdit({ file_path: DIR + "/f.txt", old_string: "xyz", new_string: "abc" });
    expect(r.is_error).toBe(true);
  });

  it("fails on missing file", async () => {
    const r = await executeEdit({ file_path: DIR + "/nope.txt", old_string: "x", new_string: "y" });
    expect(r.is_error).toBe(true);
  });

  it("rejects old_string same as new_string", async () => {
    writeFileSync(DIR + "/same.txt", "hello world");
    const r = await executeEdit({ file_path: DIR + "/same.txt", old_string: "hello", new_string: "hello" });
    expect(r.is_error).toBe(true);
    expect(r.content).toContain("identical");
  });

  it("matches trimmed whitespace", async () => {
    writeFileSync(DIR + "/trim.txt", "hello world");
    const r = await executeEdit({ file_path: DIR + "/trim.txt", old_string: "  hello world  ", new_string: "hi world" });
    expect(r.is_error).toBe(false);
    expect(readFileSync(DIR + "/trim.txt", "utf-8")).toBe("hi world");
  });

  it("returns line context in error", async () => {
    writeFileSync(DIR + "/ctx.txt", "line1\nline2\nfunction foo() {}\nline4\nline5");
    const r = await executeEdit({ file_path: DIR + "/ctx.txt", old_string: "function bar() {}", new_string: "function baz() {}" });
    expect(r.is_error).toBe(true);
    expect(r.content).toContain("line 3");
  });
});
