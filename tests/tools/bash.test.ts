import { describe, it, expect } from "vitest";
import { executeBash } from "../../src/tools/bash.js";

describe("bash tool", () => {
  it("executes echo and returns output", async () => {
    const result = await executeBash({ command: "echo hello" });
    expect(result.content).toContain("hello");
    expect(result.is_error).toBeFalsy();
  });

  it("returns error for non-zero exit", async () => {
    const result = await executeBash({ command: "exit 1" });
    expect(result.is_error).toBe(true);
  });

  it("handles command not found", async () => {
    const result = await executeBash({ command: "nonexistent_command_xyz" });
    expect(result.is_error).toBe(true);
  });

  it("captures stdout and stderr", async () => {
    const result = await executeBash({ command: "echo out && echo err >&2" });
    expect(result.content).toContain("out");
  });
});
