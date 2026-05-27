// P56.4: Wiki-driven auto mode routing

import type { SandboxStore } from "./store.js";
import type { WikiSkill } from "./types.js";

export interface WikiRouteResult {
  mode: "memory" | "probe";
  matchedSkill?: WikiSkill;
  reason: string;
}

/** Minimum success rate to trust a wiki skill recommendation */
const MIN_SUCCESS_RATE = 0.7;
/** Minimum record count for a skill to be considered reliable */
const MIN_RECORD_COUNT = 3;

/** Extract candidate file paths and keywords from a problem text */
function extractSearchTerms(problem: string): { files: string[]; keywords: string[] } {
  const files: string[] = [];
  const keywords: string[] = [];
  const lower = problem.toLowerCase();

  // File paths
  for (const m of problem.matchAll(/(?:src|lib|tests?|app)\/[\w.\-/]+/g)) {
    files.push(m[0].toLowerCase());
  }
  // Bare filenames
  for (const m of problem.matchAll(/\b(\w+\.\w{1,4})\b/g)) {
    files.push(m[0].toLowerCase());
  }
  // Keywords
  if (/fix|bug|patch|repair|broken/i.test(lower)) keywords.push("bugfix");
  if (/implement|add|create|feature/i.test(lower)) keywords.push("feature");
  if (/refactor|rewrite|restructure/i.test(lower)) keywords.push("refactor");
  if (/test|spec|assert/i.test(lower)) keywords.push("test");
  if (/null|undefined|typeerror/i.test(lower)) keywords.push("null-check");
  if (/api|endpoint|http|fetch|request/i.test(lower)) keywords.push("api-boundary");
  if (/async|promise|await|callback/i.test(lower)) keywords.push("async");

  return { files: [...new Set(files)], keywords: [...new Set(keywords)] };
}

/** Query wiki for skills matching the problem, return best routing decision */
export function routeAutoMode(
  problem: string,
  store?: SandboxStore,
): WikiRouteResult | null {
  if (!store) return null;

  const { files, keywords } = extractSearchTerms(problem);
  if (files.length === 0 && keywords.length === 0) return null;

  // Collect all matching skills
  const candidates: WikiSkill[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    for (const skill of store.queryWikiSkills(file)) {
      if (!seen.has(skill.id)) {
        seen.add(skill.id);
        candidates.push(skill);
      }
    }
  }
  for (const kw of keywords) {
    for (const skill of store.queryWikiSkills(kw)) {
      if (!seen.has(skill.id)) {
        seen.add(skill.id);
        candidates.push(skill);
      }
    }
  }

  if (candidates.length === 0) return null;

  // Filter by confidence threshold
  const reliable = candidates.filter(
    (s) => s.successRate >= MIN_SUCCESS_RATE && s.recordCount >= MIN_RECORD_COUNT,
  );

  if (reliable.length === 0) return null;

  // Best match: highest successRate, then highest recordCount
  reliable.sort((a, b) => b.successRate - a.successRate || b.recordCount - a.recordCount);
  const best = reliable[0]!;

  return {
    mode: best.recommendedMode,
    matchedSkill: best,
    reason: `Wiki skill "${best.title}" (successRate=${best.successRate}, records=${best.recordCount}) recommends ${best.recommendedMode}`,
  };
}
