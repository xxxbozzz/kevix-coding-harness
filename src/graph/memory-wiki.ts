// Kevix Memory Wiki — historical routing signals for auto mode.
//
// This is not a chat memory. It is a small, queryable decision layer:
// if similar work has failed in memory mode but passed in probe mode,
// auto mode should start with probe instead of rediscovering the same failure.

import type { PEANMode } from "../types.js";
import type { OutcomeNode, ReviewGraph, TaskNode } from "./types.js";

export type WikiRoutingConfidence = "none" | "low" | "medium" | "high";

export interface WikiRoutingEvidence {
  taskId: string;
  mode: string;
  verdict: OutcomeNode["verdict"];
  matchedFiles: string[];
  matchedTerms: string[];
  score: number;
}

export interface WikiRoutingDecision {
  recommendedMode: PEANMode;
  confidence: WikiRoutingConfidence;
  reason: string;
  evidence: WikiRoutingEvidence[];
}

const STOP_WORDS = new Set([
  "this", "that", "with", "from", "into", "when", "then", "than",
  "fix", "bug", "issue", "error", "code", "test", "tests", "file",
  "should", "must", "need", "needs", "make", "update", "change",
]);

export function recommendModeFromWiki(
  graph: ReviewGraph,
  problem: string,
  fallback: PEANMode = "auto",
): WikiRoutingDecision {
  const target = extractSignals(problem);
  const evidence = collectEvidence(graph, target);

  if (evidence.length === 0) {
    return {
      recommendedMode: fallback,
      confidence: "none",
      reason: "No similar memory wiki entries found.",
      evidence: [],
    };
  }

  const memoryFailed = evidence.filter((e) => e.mode === "memory" && e.verdict !== "PASS");
  const probePassed = evidence.filter((e) => e.mode === "probe" && e.verdict === "PASS");
  const memoryPassed = evidence.filter((e) => e.mode === "memory" && e.verdict === "PASS");

  if (memoryFailed.length > 0 && probePassed.length > 0) {
    return {
      recommendedMode: "probe",
      confidence: "high",
      reason: "Similar history shows memory failed and probe passed.",
      evidence: [...probePassed, ...memoryFailed].slice(0, 5),
    };
  }

  if (probePassed.length > 0 && hasBoundarySignal(problem)) {
    return {
      recommendedMode: "probe",
      confidence: "medium",
      reason: "Similar probe success plus boundary-risk language.",
      evidence: probePassed.slice(0, 5),
    };
  }

  if (memoryPassed.length > 0 && memoryFailed.length === 0) {
    return {
      recommendedMode: "memory",
      confidence: memoryPassed.length >= 2 ? "medium" : "low",
      reason: "Similar memory runs passed without probe evidence.",
      evidence: memoryPassed.slice(0, 5),
    };
  }

  return {
    recommendedMode: fallback,
    confidence: "low",
    reason: "History exists but does not justify changing the requested mode.",
    evidence: evidence.slice(0, 5),
  };
}

function collectEvidence(
  graph: ReviewGraph,
  target: { files: Set<string>; terms: Set<string> },
): WikiRoutingEvidence[] {
  const tasks = Object.values(graph.nodes).filter((n): n is TaskNode => n.type === "task");
  const outcomes = Object.values(graph.nodes).filter((n): n is OutcomeNode => n.type === "outcome");
  const outcomeByTask = new Map(outcomes.map((o) => [o.taskId, o]));

  return tasks
    .map((task) => {
      const outcome = outcomeByTask.get(task.taskId);
      if (!outcome) return null;

      const signals = extractSignals(task.problem);
      const matchedFiles = intersection(target.files, signals.files);
      const matchedTerms = intersection(target.terms, signals.terms);
      const score = matchedFiles.length * 5 + matchedTerms.length;
      if (score <= 0) return null;

      return {
        taskId: task.taskId,
        mode: task.mode,
        verdict: outcome.verdict,
        matchedFiles,
        matchedTerms: matchedTerms.slice(0, 8),
        score,
      };
    })
    .filter((e): e is WikiRoutingEvidence => e !== null)
    .sort((a, b) => b.score - a.score);
}

function extractSignals(text: string): { files: Set<string>; terms: Set<string> } {
  const files = new Set<string>();
  const terms = new Set<string>();

  for (const m of text.matchAll(/(?:src|lib|app|tests?|packages)\/[\w./-]+\.\w{1,6}/gi)) {
    files.add(normalize(m[0]));
  }

  for (const m of text.matchAll(/\b[a-zA-Z][a-zA-Z0-9_]{3,}\b/g)) {
    const term = normalize(m[0]);
    if (!STOP_WORDS.has(term)) terms.add(term);
  }

  return { files, terms };
}

function hasBoundarySignal(text: string): boolean {
  return /\b(api|wire|serialize|serialization|encoding|decode|decode|coercion|schema|protocol|webhook|header|json|sdk)\b/i.test(text);
}

function normalize(value: string): string {
  return value.replaceAll("\\", "/").toLowerCase();
}

function intersection(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const v of a) {
    if (b.has(v)) out.push(v);
  }
  return out;
}
