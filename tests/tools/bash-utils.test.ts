import { describe, it, expect } from "vitest";

// normalizeThrown is internal to bash.ts — test it indirectly via bash error cases
import { executeBash } from "../../src/tools/bash.js";

describe("bash error normalization", () => {
  it("handles command returning non-zero exit", async () => {
    const r = await executeBash({ command: "node -e 'process.exit(1)'" });
    expect(r.is_error).toBe(true);
    expect(r.content).toBeTruthy();
  });

  it("handles command throwing signal", async () => {
    const r = await executeBash({ command: "kill $$" });
    expect(r.is_error).toBe(true);
  });

  // timeout test skipped — bash tool doesn't support timeout param

});
