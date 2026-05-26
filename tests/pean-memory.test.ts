// PEAN integration test — memory + auto mode happy path.
// probe mode not tested here (mock provider doesn't support 4-phase differentiation).

import { describe, it, expect } from "vitest";
import { runAgentLoop } from "../src/loop/agent-loop.js";
import type { LLMProvider, ToolExecutor } from "../src/loop/agent-loop.js";
import type { ChatMessage, ToolDefinition, LLMResponse, TokenUsage } from "../src/types.js";

const emptyUsage: TokenUsage = {
  prompt_tokens: 100, completion_tokens: 50,
  prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100,
  total_tokens: 150, cache_hit_ratio: 0,
};

function makeDirective(): string {
  return `## Product Intent
Fix the login form validation bug where empty input causes a crash.

## Hidden Semantics
Edge case: empty input handled. Null values return early.

## Acceptance Tests
1. Normal input works. 2. Empty input no crash.

## Implementation Constraints
Do not change function signatures.

## Red Flags
- src/auth/secrets.ts

## Coding Worker Directive
1. Read the file. 2. Edit the fix. 3. Output patch.`;
}

function makePatch(): string {
  return "```diff\n--- a/src/login.ts\n+++ b/src/login.ts\n@@ -1 +1 @@\n-old\n+new\n```";
}

function createMockProvider(): LLMProvider {
  let callCount = 0;

  return {
    async call(params: {
      messages: ChatMessage[];
      tools?: ToolDefinition[];
      temperature?: number;
      max_tokens?: number;
      response_format?: { type: "json_object" } | { type: "text" };
    }): Promise<LLMResponse> {
      callCount++;
      const lastMsg = params.messages[params.messages.length - 1]?.content ?? "";

      // Assess call: return JSON
      if (params.response_format?.type === "json_object") {
        return {
          message: { role: "assistant", content: '{"need_probe":false,"reason":"no wire risk"}' },
          finish_reason: "stop",
          usage: { ...emptyUsage, completion_tokens: 20 },
        };
      }

      // Worker call: return patch (no tool_calls — worker exits immediately)
      if (lastMsg.includes("Directive") || lastMsg.includes("directive")) {
        return {
          message: { role: "assistant", content: makePatch() },
          finish_reason: "stop",
          usage: { ...emptyUsage, completion_tokens: 50 },
        };
      }

      // Controller call: return directive
      return {
        message: { role: "assistant", content: makeDirective() },
        finish_reason: "stop",
        usage: { ...emptyUsage, completion_tokens: 100 },
      };
    },
  };
}

function createMockTools(): ToolExecutor {
  return {
    definitions: [],
    async execute(call) {
      return { tool_call_id: call.id, content: `mock result for ${call.function.name}` };
    },
  };
}

// ============================================================
describe("PEAN Memory Mode — Integration", () => {
  it("runs Controller → Worker and produces a patch", async () => {
    const summary = await runAgentLoop({
      provider: createMockProvider(),
      tools: createMockTools(),
      mode: "memory",
      problem: "Fix the login form validation bug",
      taskId: "test-001",
    });
    expect(summary.phases_completed).toEqual(["controller", "worker", "worker"]); // worker + review
  });

  it("captures structured directive", async () => {
    let directive: Record<string, string> | null = null;
    await runAgentLoop({
      provider: createMockProvider(),
      tools: createMockTools(),
      mode: "memory",
      problem: "Fix bug",
      taskId: "test-002",
      onEvent: (e) => {
        if (e.type === "directive") directive = e.directive as Record<string, string>;
      },
    });
    expect(directive).not.toBeNull();
    expect(directive!.product_intent).toBeTruthy();
    expect(directive!.worker_directive).toBeTruthy();
  });
});

describe("PEAN Auto Mode", () => {
  it("produces controller + worker + review with escalate on mock", async () => {
    const phases: string[] = [];
    const summary = await runAgentLoop({
      provider: createMockProvider(),
      tools: createMockTools(),
      mode: "auto",
      problem: "Fix bug",
      taskId: "test-auto",
      onEvent: (e) => {
        if (e.type === "step_complete") phases.push(e.phase);
      },
    });
    // Review fires after worker — mock returns non-verdict text → BLOCKED → escalate
    expect(phases).toContain("controller");
    expect(phases).toContain("worker"); // worker ran + review event
    expect(summary.escalated).toBe(true); // mock can't review → BLOCKED → escalate
  });
});
