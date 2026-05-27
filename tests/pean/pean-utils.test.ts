import { describe, it, expect } from "vitest";
import { extractPatch, extractJson, extractJsonArray } from "../../src/pean/prompts.js";

describe("extractPatch", () => {
  it("extracts diff from markdown code block", () => {
    const text = "Here is the fix:\n```diff\n- old\n+ new\n```\nDone.";
    expect(extractPatch(text)).toBe("- old\n+ new");
  });

  it("extracts from generic code block when no diff", () => {
    const text = "```\n--- a.txt\n+++ b.txt\n@@ -1 +1 @@\n-old\n+new\n```";
    const result = extractPatch(text);
    expect(result).toContain("--- a.txt");
    expect(result).toContain("+++ b.txt");
  });

  it("returns null for no code block", () => {
    expect(extractPatch("just text")).toBeNull();
  });
});

describe("extractJson", () => {
  it("parses JSON from markdown code block", () => {
    const text = '```json\n{"key": "value"}\n```';
    expect(extractJson(text)).toEqual({ key: "value" });
  });

  it("parses bare JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns null for invalid JSON", () => {
    expect(extractJson("not json")).toBeNull();
  });
});

describe("extractJsonArray", () => {
  it("parses JSON array", () => {
    const text = '[{"name":"a"},{"name":"b"}]';
    expect(extractJsonArray(text)).toEqual([{ name: "a" }, { name: "b" }]);
  });

  it("returns null for non-array JSON", () => {
    expect(extractJsonArray('{"key":"val"}')).toBeNull();
  });
});
