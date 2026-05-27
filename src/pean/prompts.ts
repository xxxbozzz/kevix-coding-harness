// PEAN Prompt templates — translated from swe_runner.py
// Each PEAN phase has its OWN system prompt (in pean-system.ts).
// These are the user messages that accompany each phase's system prompt.

import {
  controllerMessage,
  workerMessage,
  probePlanMessage,
  probeVerifyMessage,
  assessMessage,
} from "../provider/pean-system.js";
import type { PEANMode } from "../types.js";

// ============================================================
// Public API — returns user message strings
// ============================================================

export function buildControllerPrompt(problem: string, hints?: string): string {
  return controllerMessage(problem, hints);
}

export function buildWorkerPrompt(
  directive: string,
  problem: string,
  mode: PEANMode,
): string {
  return workerMessage(directive, problem, mode);
}

export function buildProbePlanPrompt(directive: string, problem: string): string {
  return probePlanMessage(directive, problem);
}

export function buildProbeVerifyPrompt(patch: string, risks: string): string {
  return probeVerifyMessage(patch, risks);
}

export function buildAssessPrompt(
  patch: string,
  problem: string,
  graphContext?: string,
): string {
  let msg = assessMessage(patch, problem);
  if (graphContext) {
    msg += `\n\n## Historical Risk Data (from review graph)\n\n${graphContext}`;
  }
  return msg;
}

// ============================================================
// Patch extraction helpers
// ============================================================

/**
 * Extract unified diff from LLM output.
 * Handles: ```diff fences, ``` fences, and raw diff.
 */
export function extractPatch(text: string | null): string | null {
  if (text == null || text === "") {
    return null;
  }

  // Treat whitespace-only strings as empty
  if (typeof text === 'string' && text.trim() === '') {
    return null;
  }

  // Try ```diff fence first
  const diffMatch = text.match(/```diff\s*\n([\s\S]*?)```/);
  if (diffMatch) return diffMatch[1]!.trim();

  // Try any ``` fence that looks like a diff
  const fenceMatch = text.match(/```\s*\n(.*?---[\s\S]*?\+\+\+[\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1]!.trim();

  // Try raw diff (starts with --- or diff --git)
  const rawMatch = text.match(/(?:^|\n)((?:---\s|[+\-]{3}\s|diff\s--git)[\s\S]*)/);
  if (rawMatch) return rawMatch[1]!.trim();

  return null;
}

/**
 * Extract JSON object from text (may be wrapped in markdown or code fences).
 */
export function extractJson<T = Record<string, unknown>>(text: string): T | null {
  // Try ```json fence
  const jsonMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const candidate = jsonMatch?.[1] ?? text;

  // Find first { and matching }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Extract JSON array from text.
 */
export function extractJsonArray<T = Record<string, unknown>>(text: string): T[] | null {
  const jsonMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const candidate = jsonMatch?.[1] ?? text;

  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T[];
  } catch {
    return null;
  }
}
