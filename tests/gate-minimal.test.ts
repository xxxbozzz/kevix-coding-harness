// Gate integration tests — minimal, no infinite loops

import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "../src/loop/agent-loop.js";
import type { LLMProvider, ToolExecutor } from "../src/loop/agent-loop.js";
import type { LLMResponse, ChatMessage, ToolCall, ToolResult, TokenUsage } from "../src/types.js";

const emptyUsage: TokenUsage = {
  prompt_tokens: 100, completion_tokens: 50,
  prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100,
  total_tokens: 150, cache_hit_ratio: 0,
};

function directive(redFlags: string): string {
  return `## Product Intent\nFix the bug where users cannot login with valid credentials after password reset.\n\n## Hidden Semantics\nEdge cases: empty password must be rejected before API call. Null email should show specific validation error.\n\n## Acceptance Tests\n1. Valid credentials login succeeds.\n2. Empty password returns 400.\n3. Null email returns 400.\n\n## Implementation Constraints\nDo not change User model schema. Preserve JWT token format.\n\n## Red Flags\n${redFlags}\n\n## Coding Worker Directive\n1. Read src/auth/login.ts.\n2. Add input validation before auth call.\n3. Run npm test to verify.`;
}

// ============================================================
// A: BeforeToolUse — red-flag gate blocks write tool
// ============================================================
describe("BeforeToolUse gate", () => {
  it("blocks write to red-flagged file, execute not called", async () => {
    const executeSpy = vi.fn(async (c: ToolCall): Promise<ToolResult> => {
      return { tool_call_id: c.id, content: "executed" };
    });
    const tools: ToolExecutor = { definitions: [], execute: executeSpy };

    let phase = 0;
    const provider: LLMProvider = {
      async call(_params): Promise<LLMResponse> {
        phase++;
        if (phase === 1) {
          return { message: { role: "assistant", content: directive("- src/auth/secrets.ts") }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (phase === 2) {
          return { message: { role: "assistant", content: "editing", tool_calls: [{ id: "c1", type: "function", function: { name: "write", arguments: `{"file_path":"src/auth/secrets.ts","content":"x"}` } }] }, finish_reason: "tool_calls", usage: { ...emptyUsage } };
        }
        return { message: { role: "assistant", content: "```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
      },
    };

    await runAgentLoop({ provider, tools, mode: "memory", problem: "Fix", taskId: "t1" });
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("allows write to non-red-flagged file", async () => {
    const executeSpy = vi.fn(async (c: ToolCall): Promise<ToolResult> => {
      return { tool_call_id: c.id, content: "executed" };
    });
    const tools: ToolExecutor = { definitions: [], execute: executeSpy };

    let phase = 0;
    const provider: LLMProvider = {
      async call(_params): Promise<LLMResponse> {
        phase++;
        if (phase === 1) {
          return { message: { role: "assistant", content: directive("- src/secrets.ts") }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (phase === 2) {
          return { message: { role: "assistant", content: "editing", tool_calls: [{ id: "c1", type: "function", function: { name: "write", arguments: `{"file_path":"src/login.ts","content":"x"}` } }] }, finish_reason: "tool_calls", usage: { ...emptyUsage } };
        }
        return { message: { role: "assistant", content: "```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
      },
    };

    await runAgentLoop({ provider, tools, mode: "memory", problem: "Fix", taskId: "t2" });
    expect(executeSpy).toHaveBeenCalled();
  });
});

// ============================================================
// B: BeforeComplete — probe mode blocks without verification
// ============================================================
describe("BeforeComplete gate", () => {
  it("blocks completion when probe mode has needs_revision verdict", async () => {
    const tools: ToolExecutor = { definitions: [], execute: async (c) => ({ tool_call_id: c.id, content: "ok" }) };

    let phase = 0;
    const provider: LLMProvider = {
      async call(_params): Promise<LLMResponse> {
        phase++;
        const lastMsg = (_params.messages[_params.messages.length - 1]?.content ?? "") as string;

        if (lastMsg.includes("Enumerate all wire-level risks")) {
          return { message: { role: "assistant", content: "[]" }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Directive")) {
          return { message: { role: "assistant", content: "```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n```" }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        if (lastMsg.includes("Verify each risk")) {
          return { message: { role: "assistant", content: '{"verdict":"needs_revision"}' }, finish_reason: "stop", usage: { ...emptyUsage } };
        }
        return { message: { role: "assistant", content: directive("- none") }, finish_reason: "stop", usage: { ...emptyUsage } };
      },
    };

    const errors: string[] = [];
    await runAgentLoop({
      provider, tools, mode: "probe",
      problem: "Fix API serialization bug in endpoint handler",
      taskId: "t3",
      onEvent: (e) => {
        if (e.type === "error") errors.push(e.message);
        if (e.type === "log" && e.level === "error") errors.push(e.text);
      },
    });

    expect(errors.length).toBeGreaterThan(0);
  });
});
