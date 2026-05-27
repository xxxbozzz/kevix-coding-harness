// Graph integration tests — build graph from engine events, verify queries.

import { describe, it, expect } from "vitest";
import { GraphBuilder } from "../src/graph/builder.js";
import { findByFile, getTaskHistory, getStats } from "../src/graph/query.js";
import type { EngineEvent } from "../src/types.js";

function makeSnapshot(overrides: Record<string, unknown> = {}): EngineEvent {
  return {
    type: "state_snapshot",
    snapshot: {
      taskId: "test-task",
      mode: "memory",
      directive: null,
      phasesCompleted: [],
      tokenUsage: { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0, total_tokens: 0, cache_hit_ratio: 0 },
      gateEvents: [],
      patch: null,
      timestamp: Date.now(),
      ...overrides,
    },
  };
}

function makeGateLog(gate: string, tool: string, reason: string): EngineEvent {
  return { type: "log", level: "warn", text: `Gate blocked ${tool}: [${gate}] ${tool}: ${reason}` };
}

function makeEscalate(issues: string[] = ["issue 1"]): EngineEvent {
  return { type: "escalate", issues, cycles: 3 };
}

const DIRECTIVE = `## Product Intent\nFix login.\n\n## Hidden Semantics\nHandle nulls.\n\n## Acceptance Tests\n1. Works.\n\n## Implementation Constraints\n- Do not change User model\n\n## Red Flags\n- src/auth/secrets.ts\n- config/db.json\n\n## Coding Worker Directive\nFix it.`;

describe("Review Graph", () => {
  it("builds task and directive nodes from snapshot events", () => {
    const builder = new GraphBuilder();

    builder.handleEvent(
      makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller"] }),
      "test-task", "Fix login bug", "memory",
    );

    const graph = builder.toGraph();
    expect(graph.nodes["task:test-task"]).toBeTruthy();
    expect(graph.nodes["directive:test-task"]).toBeTruthy();

    const history = getTaskHistory(graph, "test-task");
    expect(history.task).toBeTruthy();
    expect(history.directive).toBeTruthy();
    expect(history.task?.type).toBe("task");
  });

  it("extracts patterns from directive red flags and constraints", () => {
    const builder = new GraphBuilder();
    builder.handleEvent(
      makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller"] }),
      "test-task", "Fix login bug", "memory",
    );

    const graph = builder.toGraph();
    const history = getTaskHistory(graph, "test-task");
    // Should have 2 red flag patterns + 1 constraint pattern
    expect(history.patterns.length).toBeGreaterThanOrEqual(3);
  });

  it("records gate events", () => {
    const builder = new GraphBuilder();
    builder.handleEvent(makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller"] }), "test-task", "Fix bug", "memory");
    builder.handleEvent(makeGateLog("scope", "bash", "path outside project: /etc/passwd"), "test-task", "Fix bug", "memory");

    const graph = builder.toGraph();
    const { gateEvents } = findByFile(graph, "/etc/passwd");
    expect(gateEvents.length).toBeGreaterThanOrEqual(1);
    expect(gateEvents[0]!.gateName).toBe("scope");
  });

  it("records outcome on worker completion", () => {
    const builder = new GraphBuilder();
    builder.handleEvent(makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller"] }), "test-task", "Fix bug", "memory");
    builder.handleEvent(makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller", "worker", "worker"] }), "test-task", "Fix bug", "memory");

    const graph = builder.toGraph();
    const history = getTaskHistory(graph, "test-task");
    expect(history.outcome).toBeTruthy();
    expect(history.outcome?.verdict).toBe("PASS");
  });

  it("records escalated outcome", () => {
    const builder = new GraphBuilder();
    builder.handleEvent(makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller"] }), "test-task", "Fix bug", "memory");
    builder.handleEvent(makeEscalate(), "test-task", "Fix bug", "memory");

    const graph = builder.toGraph();
    const history = getTaskHistory(graph, "test-task");
    expect(history.outcome?.verdict).toBe("ESCALATED");
  });

  it("builds path from task through directive, patterns, gates, to outcome", () => {
    const builder = new GraphBuilder();
    builder.handleEvent(makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller"] }), "test-task", "Fix bug", "memory");
    builder.handleEvent(makeGateLog("scope", "bash", "outside /tmp"), "test-task", "Fix bug", "memory");
    builder.handleEvent(makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller", "worker", "worker"] }), "test-task", "Fix bug", "memory");

    const graph = builder.toGraph();
    const { path } = getTaskHistory(graph, "test-task");
    expect(path.length).toBeGreaterThanOrEqual(4); // task + directive + patterns + gate + outcome
    expect(path[0]).toBe("task:test-task");
  });

  it("computes stats across multiple tasks", () => {
    const builder = new GraphBuilder();

    // Task 1: PASS
    builder.handleEvent(makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller"] }), "task-1", "Fix A", "memory");
    builder.handleEvent(makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller", "worker", "worker"] }), "task-1", "Fix A", "memory");

    // Task 2: ESCALATED
    builder.handleEvent(makeSnapshot({ directive: DIRECTIVE, phasesCompleted: ["controller"] }), "task-2", "Fix B", "memory");
    builder.handleEvent(makeEscalate(), "task-2", "Fix B", "memory");

    const stats = getStats(builder.toGraph());
    expect(stats.taskCount).toBe(2);
    expect(stats.passRate).toBe(0.5);
    expect(stats.escalateRate).toBe(0.5);
  });
});
