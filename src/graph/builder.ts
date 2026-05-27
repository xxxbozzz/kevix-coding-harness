// Graph builder — constructs review graph from engine events.

import {
  type ReviewGraph, type GraphNode, type GraphEdge, type EdgeType,
  type TaskNode, type DirectiveNode, type PatternNode,
  type GateEventNode, type ReviewFindingNode, type RevisionNode, type OutcomeNode,
  emptyGraph, nodeId, hashDirective,
} from "./types.js";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { EngineEvent, PEANDirective } from "../types.js";

// ============================================================
// In-memory state (one graph per builder instance)
// ============================================================

export class GraphBuilder {
  graph: ReviewGraph;
  private taskNode: TaskNode | null = null;
  private directiveNode: DirectiveNode | null = null;
  private revisionCount = 0;
  private gateEvents: GateEventNode[] = [];
  private reviewFindings: ReviewFindingNode[] = [];

  constructor(existing?: ReviewGraph) {
    this.graph = existing ? structuredClone(existing) : emptyGraph();
  }

  /** Process an engine event and update the graph. */
  handleEvent(event: EngineEvent, taskId: string, problem: string, mode: string): void {
    switch (event.type) {
      case "state_snapshot":
        this.handleSnapshot(event.snapshot as any, taskId, problem, mode);
        break;
      case "log":
        if (event.text.includes("Gate blocked")) this.handleGateLog(event.text, taskId);
        if (event.text.includes("Review BLOCKED")) this.handleReviewLog(event.text, taskId);
        break;
      case "escalate":
        this.handleEscalate(taskId);
        break;
    }
  }

  private handleSnapshot(snapshot: any, taskId: string, problem: string, mode: string): void {
    const phases = snapshot.phasesCompleted as string[];

    // Task node — one per unique taskId
    const tid = nodeId("task", taskId);
    if (!this.graph.nodes[tid]) {
      this.taskNode = {
        id: tid,
        type: "task",
        timestamp: Date.now(),
        problem,
        mode,
        taskId,
      };
      this.addNode(this.taskNode);
      this.graph.meta.taskCount++;
    } else {
      this.taskNode = this.graph.nodes[tid] as TaskNode;
    }

    // Directive node
    if (snapshot.directive && !this.graph.nodes[nodeId("directive", taskId)]) {
      const dirHash = hashDirective(snapshot.directive);
      this.directiveNode = {
        id: nodeId("directive", `${taskId}`),
        type: "directive",
        timestamp: Date.now(),
        taskId,
        directiveHash: dirHash,
        redFlags: this.extractRedFlags(snapshot.directive),
        constraints: this.extractConstraints(snapshot.directive),
      };
      this.addNode(this.directiveNode);
      this.addEdge(this.directiveNode.id, this.taskNode!.id, "produced_by");

      // Extract patterns
      this.extractPatterns(this.directiveNode, taskId);
    }

    // Outcome on completion (worker phase includes review for memory/auto)
    if (phases.includes("worker") && (phases.filter((p: string) => p === "worker").length >= 2 || snapshot.escalated)) {
      this.ensureOutcome(taskId, snapshot);
    }

    this.graph.meta.updatedAt = Date.now();
  }

  private handleGateLog(text: string, taskId: string): void {
    const m = text.match(/\[(\S+)\]\s+(\S+):\s+(.+)/);
    if (!m) return;
    const gateName = m[1]!;
    const toolName = m[2]!;
    const reason = m[3]!;

    const node: GateEventNode = {
      id: nodeId("gate_event", `${taskId}-${this.gateEvents.length}`),
      type: "gate_event",
      timestamp: Date.now(),
      taskId,
      gateName,
      toolName,
      reason,
    };
    this.gateEvents.push(node);
    this.addNode(node);

    // Link to task
    if (this.taskNode) this.addEdge(node.id, this.taskNode.id, "triggered");
  }

  private handleReviewLog(text: string, taskId: string): void {
    const node: ReviewFindingNode = {
      id: nodeId("review_finding", `${taskId}-r${this.revisionCount}`),
      type: "review_finding",
      timestamp: Date.now(),
      taskId,
      category: "unknown",
      severity: "medium",
      description: text,
      evidence: "",
      fixed: false,
    };
    this.reviewFindings.push(node);
    this.addNode(node);
    if (this.taskNode) this.addEdge(node.id, this.taskNode.id, "has_finding");
  }

  private handleEscalate(taskId: string): void {
    this.ensureOutcome(taskId, { buildPassed: false, apiCalls: 0, cacheHitFinal: 0, gateEventCount: this.gateEvents.length, reviewIssueCount: this.reviewFindings.length, escalated: true });
  }

  // ============================================================
  // Pattern extraction
  // ============================================================

  private extractRedFlags(directive: string): string[] {
    const m = directive.match(/## Red Flags\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (!m?.[1]) return [];
    return m[1].split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter((l) => l.length > 3);
  }

  private extractConstraints(directive: string): string[] {
    const m = directive.match(/## Implementation Constraints\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (!m?.[1]) return [];
    return m[1].split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter((l) => l.length > 3);
  }

  private extractPatterns(dir: DirectiveNode, taskId: string): void {
    for (const flag of dir.redFlags) {
      const pattern: PatternNode = {
        id: nodeId("pattern", `redflag:${hashDirective(flag)}`),
        type: "pattern",
        timestamp: Date.now(),
        category: "red_flag",
        value: flag,
        sourceTaskId: taskId,
        occurrenceCount: 1,
      };
      this.upsertPattern(pattern);
      this.addEdge(pattern.id, dir.id, "extracts");
    }
    for (const c of dir.constraints) {
      const pattern: PatternNode = {
        id: nodeId("pattern", `constraint:${hashDirective(c)}`),
        type: "pattern",
        timestamp: Date.now(),
        category: "constraint",
        value: c,
        sourceTaskId: taskId,
        occurrenceCount: 1,
      };
      this.upsertPattern(pattern);
      this.addEdge(pattern.id, dir.id, "extracts");
    }
  }

  private upsertPattern(pattern: PatternNode): void {
    const existing = this.graph.nodes[pattern.id] as PatternNode | undefined;
    if (existing) {
      existing.occurrenceCount++;
    } else {
      this.addNode(pattern);
      this.graph.meta.patternCount++;
    }
  }

  // ============================================================
  // Outcome
  // ============================================================

  private ensureOutcome(taskId: string, snapshot: any): void {
    const id = nodeId("outcome", taskId);
    if (this.graph.nodes[id]) return;

    const node: OutcomeNode = {
      id,
      type: "outcome",
      timestamp: Date.now(),
      taskId,
      verdict: snapshot.escalated ? "ESCALATED" : "PASS",
      buildPassed: snapshot.buildPassed !== false,
      testPassed: true,
      apiCalls: snapshot.apiCalls ?? 0,
      cacheHitFinal: snapshot.cacheHitFinal ?? 0,
      gateEventCount: this.gateEvents.length,
      reviewIssueCount: this.reviewFindings.length,
    };
    this.addNode(node);
    if (this.taskNode) this.addEdge(node.id, this.taskNode.id, "resolved_as");
  }

  // ============================================================
  // Graph mutations
  // ============================================================

  private addNode(node: GraphNode): void {
    this.graph.nodes[node.id] = node;
  }

  private addEdge(from: string, to: string, type: EdgeType): void {
    // Dedup: don't add same edge twice
    if (this.graph.edges.some((e) => e.from === from && e.to === to && e.type === type)) return;
    this.graph.edges.push({ from, to, type });
  }

  /** Get the final graph. */
  toGraph(): ReviewGraph {
    return this.graph;
  }

  /** Save graph to disk. */
  save(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.graph, null, 2), "utf-8");
  }

  /** Load graph from disk, or return empty. */
  static load(path: string): ReviewGraph {
    try {
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw) as ReviewGraph;
    } catch {
      return emptyGraph();
    }
  }
}
