import { describe, it, expect } from "vitest";
import { directiveGate } from "../directive-gate.js";
import { makeCtx, makeCall } from "./helpers.js";

describe("Directive Gate", () => {
  it("allows read-only tools without directive", () => {
    const ctx = makeCtx({ directive: null });
    expect(directiveGate.check(ctx, makeCall("read")).decision).toBe("allow");
    expect(directiveGate.check(ctx, makeCall("grep")).decision).toBe("allow");
    expect(directiveGate.check(ctx, makeCall("glob")).decision).toBe("allow");
  });

  it("denies write tools without directive", () => {
    const ctx = makeCtx({ directive: null });
    expect(directiveGate.check(ctx, makeCall("write")).decision).toBe("deny");
    expect(directiveGate.check(ctx, makeCall("edit")).decision).toBe("deny");
    expect(directiveGate.check(ctx, makeCall("bash")).decision).toBe("deny");
  });

  it("denies write tools with incomplete directive", () => {
    const ctx = makeCtx({
      directive: {
        product_intent: "Short",
        hidden_semantics: "",
        acceptance_tests: "Also too short",
        implementation_constraints: "",
        red_flags: "",
        worker_directive: "",
        raw: "",
      },
    });
    const r = directiveGate.check(ctx, makeCall("write"));
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain("missing");
  });

  it("allows write tools with valid directive", () => {
    const ctx = makeCtx({
      directive: makeValidDirective(),
    });
    expect(directiveGate.check(ctx, makeCall("write")).decision).toBe("allow");
    expect(directiveGate.check(ctx, makeCall("edit")).decision).toBe("allow");
    expect(directiveGate.check(ctx, makeCall("bash")).decision).toBe("allow");
  });
});

function makeValidDirective() {
  return {
    product_intent: "Fix the bug where users cannot login with valid credentials",
    hidden_semantics: "Edge case: empty password should be rejected before API call. Null email should show specific error.",
    acceptance_tests: "1. Valid credentials → login succeeds 2. Empty password → 400 error 3. Null email → 400 error",
    implementation_constraints: "Do not change the User model schema. Preserve existing JWT token format.",
    red_flags: "Do NOT modify src/auth/secrets.ts. Do NOT touch database migrations.",
    worker_directive: "1. Read src/auth/login.ts 2. Add validation before the auth call 3. Test with npm test",
    raw: "...",
  };
}
