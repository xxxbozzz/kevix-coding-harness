// Graph query — search and retrieve from review graph.

import type { ReviewGraph, GraphNode, GateEventNode, ReviewFindingNode, PatternNode, OutcomeNode } from "./types.js";

export function findByFile(graph: ReviewGraph, filePath: string): {
  gateEvents: GateEventNode[];
  findings: ReviewFindingNode[];
} {
  const gateEvents: GateEventNode[] = [];
  const findings: ReviewFindingNode[] = [];

  for (const node of Object.values(graph.nodes)) {
    if (node.type === "gate_event") {
      const g = node as GateEventNode;
      if (g.reason.includes(filePath) || g.filePath?.includes(filePath)) {
        gateEvents.push(g);
      }
    }
    if (node.type === "review_finding") {
      const f = node as ReviewFindingNode;
      if (f.filePath?.includes(filePath) || f.evidence.includes(filePath)) {
        findings.push(f);
      }
    }
  }

  return { gateEvents, findings };
}

export function findSimilarPatterns(
  graph: ReviewGraph,
  directiveHash: string,
  category?: string,
): PatternNode[] {
  const results: PatternNode[] = [];
  for (const node of Object.values(graph.nodes)) {
    if (node.type !== "pattern") continue;
    const p = node as PatternNode;
    if (category && p.category !== category) continue;

    // Find edges from this pattern to directives
    const directiveEdges = graph.edges.filter(
      (e) => e.from === p.id && e.type === "extracts",
    );
    if (directiveEdges.length > 0) {
      results.push(p);
    }
  }
  return results;
}

export function getTaskHistory(graph: ReviewGraph, taskId: string): {
  task: GraphNode | null;
  directive: GraphNode | null;
  patterns: PatternNode[];
  gateEvents: GateEventNode[];
  findings: ReviewFindingNode[];
  outcome: OutcomeNode | null;
  path: string[];
} {
  const nodes = Object.values(graph.nodes);
  const task = nodes.find((n) => n.id === `task:${taskId}`) ?? null;
  const directive = nodes.find((n) => n.id === `directive:${taskId}`) ?? null;
  const patterns = nodes.filter(
    (n) => n.type === "pattern" && (n as PatternNode).sourceTaskId === taskId,
  ) as PatternNode[];
  const gateEvents = nodes.filter((n) => n.type === "gate_event" && n.id.startsWith(`gate_event:${taskId}`)) as GateEventNode[];
  const findings = nodes.filter((n) => n.type === "review_finding" && n.id.startsWith(`review_finding:${taskId}`)) as ReviewFindingNode[];
  const outcome = nodes.find((n) => n.id === `outcome:${taskId}`) as OutcomeNode | null;

  // Build path
  const path: string[] = [];
  if (task) path.push(task.id);
  if (directive) {
    path.push(directive.id);
    for (const p of patterns) path.push(p.id);
  }
  for (const g of gateEvents) path.push(g.id);
  for (const f of findings) path.push(f.id);
  if (outcome) path.push(outcome.id);

  return { task, directive, patterns, gateEvents, findings, outcome, path };
}

export function getStats(graph: ReviewGraph): {
  taskCount: number;
  patternCount: number;
  gateEventCount: number;
  findingCount: number;
  passRate: number;
  escalateRate: number;
  avgCacheHit: number;
} {
  const nodes = Object.values(graph.nodes);
  const gateEventCount = nodes.filter((n) => n.type === "gate_event").length;
  const findingCount = nodes.filter((n) => n.type === "review_finding").length;
  const outcomes = nodes.filter((n) => n.type === "outcome") as OutcomeNode[];

  const passRate = outcomes.length > 0
    ? outcomes.filter((o) => o.verdict === "PASS").length / outcomes.length
    : 0;
  const escalateRate = outcomes.length > 0
    ? outcomes.filter((o) => o.verdict === "ESCALATED").length / outcomes.length
    : 0;
  const avgCacheHit = outcomes.length > 0
    ? outcomes.reduce((s, o) => s + o.cacheHitFinal, 0) / outcomes.length
    : 0;

  return {
    taskCount: graph.meta.taskCount,
    patternCount: graph.meta.patternCount,
    gateEventCount,
    findingCount,
    passRate,
    escalateRate,
    avgCacheHit,
  };
}
