// Persistent Expert Review Graph — schema types
// Core node and edge types for building reusable review knowledge.

// ============================================================
// Node types
// ============================================================

export interface GraphNode {
  id: string; // unique, e.g. "task:l2-001" or "pattern:redflag-auth"
  type: NodeType;
  timestamp: number;
}

export type NodeType =
  | "task"
  | "directive"
  | "pattern"
  | "gate_event"
  | "review_finding"
  | "revision"
  | "outcome";

export interface TaskNode extends GraphNode {
  type: "task";
  problem: string;
  mode: string;
  taskId: string;
}

export interface DirectiveNode extends GraphNode {
  type: "directive";
  taskId: string;
  directiveHash: string; // hash of raw directive text
  redFlags: string[];
  constraints: string[];
}

export interface PatternNode extends GraphNode {
  type: "pattern";
  category: "red_flag" | "constraint" | "boundary" | "type_safety" | "scope";
  value: string; // e.g. "src/auth/secrets.ts" or "do not change User model"
  sourceTaskId: string;
  occurrenceCount: number;
}

export interface GateEventNode extends GraphNode {
  type: "gate_event";
  taskId: string;
  gateName: string;
  toolName: string;
  filePath?: string;
  reason: string;
}

export interface ReviewFindingNode extends GraphNode {
  type: "review_finding";
  taskId: string;
  category: string;
  severity: string;
  description: string;
  filePath?: string;
  evidence: string;
  fixed: boolean;
}

export interface RevisionNode extends GraphNode {
  type: "revision";
  taskId: string;
  round: number;
  patchHash: string;
}

export interface OutcomeNode extends GraphNode {
  type: "outcome";
  taskId: string;
  verdict: "PASS" | "ESCALATED" | "REJECTED";
  buildPassed: boolean;
  testPassed: boolean;
  apiCalls: number;
  cacheHitFinal: number;
  gateEventCount: number;
  reviewIssueCount: number;
}

// ============================================================
// Edge types
// ============================================================

export interface GraphEdge {
  from: string; // node id
  to: string; // node id
  type: EdgeType;
}

export type EdgeType =
  | "produced_by"     // Directive → Task
  | "extracts"        // Pattern → Directive
  | "triggered"       // GateEvent → Pattern
  | "similar_to"      // Pattern → Pattern (cross-task reuse)
  | "fixed_by"        // Revision → ReviewFinding
  | "resolved_as"     // Outcome → Task
  | "has_finding"     // ReviewFinding → Task
  | "has_revision";   // Revision → Task

// ============================================================
// Graph
// ============================================================

export interface ReviewGraph {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  meta: {
    createdAt: number;
    updatedAt: number;
    taskCount: number;
    patternCount: number;
  };
}

export function emptyGraph(): ReviewGraph {
  return {
    nodes: {},
    edges: [],
    meta: { createdAt: Date.now(), updatedAt: Date.now(), taskCount: 0, patternCount: 0 },
  };
}

// ============================================================
// Helper: generate stable node IDs
// ============================================================

export function nodeId(type: NodeType, key: string): string {
  return `${type}:${key}`;
}

// Simple hash for directive text
export function hashDirective(text: string): string {
  // djb2 hash — deterministic across runs
  let hash = 5381;
  for (let i = 0; i < Math.min(text.length, 2000); i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
