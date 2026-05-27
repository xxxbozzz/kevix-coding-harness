import { describe, expect, it } from "vitest";
import { detectTestStatus } from "../src/cli/ink/test-status.js";

describe("detectTestStatus", () => {
  it("detects Node TAP pass summaries", () => {
    expect(detectTestStatus(`# tests 4\n# pass 4\n# fail 0\n`)).toBe("pass");
  });

  it("detects Node TAP fail summaries", () => {
    expect(detectTestStatus(`# tests 4\n# pass 2\n# fail 2\n`)).toBe("fail");
  });

  it("detects Vitest pass summaries", () => {
    expect(detectTestStatus(`Tests  72 passed (72)\nTest Files  12 passed (12)`)).toBe("pass");
  });

  it("detects Vitest fail summaries", () => {
    expect(detectTestStatus(`Test Files  1 failed | 11 passed\nTests  2 failed | 70 passed`)).toBe("fail");
  });

  it("ignores unrelated bash output", () => {
    expect(detectTestStatus(`src/app.ts\nsrc/index.ts`)).toBeNull();
  });
});
