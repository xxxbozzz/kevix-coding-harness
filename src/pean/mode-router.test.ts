import { describe, expect, it } from "vitest";
import { parseDirective, sanitizeDirectiveForProblem } from "./mode-router.js";

describe("sanitizeDirectiveForProblem", () => {
  it("removes explicitly declared target files from Red Flags", () => {
    const directive = parseDirective(`
## Product Intent
Fix order summary behavior.

## Hidden Semantics
Handle null and quantity defaults.

## Acceptance Tests
Run npm test.

## Implementation Constraints
Do not edit tests.

## Red Flags
- src/summarizeOrder.js
- test/summarizeOrder.test.js

## Coding Worker Directive
Edit src/summarizeOrder.js and run npm test.
`);

    const sanitized = sanitizeDirectiveForProblem(
      directive,
      "The file to change is src/summarizeOrder.js. Do not edit tests.",
    );

    expect(sanitized.red_flags).not.toContain("src/summarizeOrder.js");
    expect(sanitized.red_flags).toContain("test/summarizeOrder.test.js");
  });

  it("leaves Red Flags untouched without a declared target file", () => {
    const directive = parseDirective(`
## Product Intent
Fix order summary behavior.

## Hidden Semantics
Handle null and quantity defaults.

## Acceptance Tests
Run npm test.

## Implementation Constraints
Do not edit tests.

## Red Flags
- src/summarizeOrder.js

## Coding Worker Directive
Inspect code and make the smallest safe change.
`);

    const sanitized = sanitizeDirectiveForProblem(directive, "Fix the failing tests.");
    expect(sanitized.red_flags).toContain("src/summarizeOrder.js");
  });
});
