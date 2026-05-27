// Approval gate tests — manual mode pause/resume/reject

import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "../src/loop/agent-loop.js";
import type { LLMProvider, ToolExecutor } from "../src/loop/agent-loop.js";
import type { LLMResponse, PEANDirective, TokenUsage } from "../src/types.js";

const emptyUsage: TokenUsage = {
  prompt_tokens: 100, completion_tokens: 50,
  prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100,
  total_tokens: 150, cache_hit_ratio: 0,
};

function makeDirective(): string {
  return [
    "## Product Intent",
    "Fix the bug where users cannot login with valid credentials.",
    "",
    "## Hidden Semantics",
    "Edge cases: empty password rejected. Null email shows specific error.",
    "",
    "## Acceptance Tests",
    "1. Valid credentials login succeeds. 2. Empty password returns 400.",
    "",
    "## Implementation Constraints",
    "Do not change User model. Preserve JWT token format.",
    "",
    "## Red Flags",
    "- src/auth/secrets.ts",
    "",
    "## Coding Worker Directive",
    "1. Read src/auth/login.ts. 2. Add validation. 3. Run npm test.",
  ].join("\n");
}

const mockProvider: LLMProvider = {
  async call(): Promise<LLMResponse> {
    const lastMsg = arguments[0]?.messages?.[arguments[0].messages.length - 1]?.content ?? "";
    if (lastMsg.includes("Directive") || lastMsg.includes("directive")) {
      return { message: { role: "assistant", content: "```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
    }
    return { message: { role: "assistant", content: makeDirective() }, finish_reason: "stop", usage: { ...emptyUsage } };
  },
};

const mockTools: ToolExecutor = {
  definitions: [],
  async execute(call) { return { tool_call_id: call.id, content: "ok" }; },
};

describe("Approval Gate", () => {
  it("emits approval_required event in manual mode", async () => {
    const events: string[] = [];
    let directive: PEANDirective | null = null;
    let resolver!: (action: "approve" | "reject") => void;
    const promise = new Promise<"approve" | "reject">((resolve) => { resolver = resolve; });

    const loopPromise = runAgentLoop({
      provider: mockProvider, tools: mockTools,
      mode: "memory", problem: "Fix login bug", taskId: "approval-test-1",
      approvalMode: "manual",
      onApprovalRequired: async (d) => {
        directive = d;
        return promise; // return the Promise, not the resolver function
      },
      onEvent: (e) => { if (e.type === "approval_required") events.push(e.type); },
    });

    // Wait for controller to pause
    await new Promise((r) => setTimeout(r, 100));
    expect(events).toContain("approval_required");
    expect(directive).not.toBeNull();
    expect(directive!.product_intent).toBeTruthy();

    // Approve
    resolver("approve");
    const summary = await loopPromise;
    expect(summary.phases_completed).toContain("worker");
  });

  it("reject stops after controller, worker not executed", async () => {
    let resolver!: (action: "approve" | "reject") => void;
    const promise = new Promise<"approve" | "reject">((resolve) => { resolver = resolve; });

    const loopPromise = runAgentLoop({
      provider: mockProvider, tools: mockTools,
      mode: "memory", problem: "Fix bug", taskId: "approval-test-2",
      approvalMode: "manual",
      onApprovalRequired: async () => promise, // return Promise, not function
    });

    await new Promise((r) => setTimeout(r, 100));
    resolver("reject");
    const summary = await loopPromise;

    expect(summary.phases_completed).toEqual(["controller"]);
    expect(summary.phases_completed).not.toContain("worker");
  });

  it("auto mode runs without pause (default)", async () => {
    let approvalCalled = false;

    const summary = await runAgentLoop({
      provider: mockProvider, tools: mockTools,
      mode: "memory", problem: "Fix bug", taskId: "approval-test-3",
      // no approvalMode → default "auto"
      onApprovalRequired: async () => { approvalCalled = true; return "approve"; },
    });

    expect(approvalCalled).toBe(false);
    expect(summary.phases_completed).toContain("controller");
    expect(summary.phases_completed).toContain("worker");
  });

  it("emits state_snapshot events after each phase", async () => {
    const snapshots: any[] = [];

    let resolver!: (action: "approve" | "reject") => void;
    const promise = new Promise<"approve" | "reject">((resolve) => { resolver = resolve; });
    const loopPromise = runAgentLoop({
      provider: mockProvider, tools: mockTools,
      mode: "memory", problem: "Fix bug", taskId: "snapshot-test",
      approvalMode: "manual",
      onApprovalRequired: async () => promise,
      onEvent: (e) => { if (e.type === "state_snapshot") snapshots.push(e.snapshot); },
    });

    await new Promise((r) => setTimeout(r, 100));

    // Controller done → at least 1 snapshot
    expect(snapshots.length).toBeGreaterThanOrEqual(1);

    const s0 = snapshots[0];
    expect(s0.taskId).toBe("snapshot-test");
    expect(s0.mode).toBe("memory");
    expect(s0.phasesCompleted).toContain("controller");
    expect(s0.directive).toBeTruthy();

    // Approve and wait for worker snapshot
    resolver("approve");
    await loopPromise;

    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    const lastSnapshot = snapshots[snapshots.length - 1];
    expect(lastSnapshot.phasesCompleted).toContain("worker");
    expect(lastSnapshot.patch).toBeTruthy();
  });
});
