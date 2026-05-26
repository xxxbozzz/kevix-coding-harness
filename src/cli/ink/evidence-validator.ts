// Evidence Validator — standalone module for directive confidence assessment
// Extracted from app.tsx per P55-PM brief. Dedicated tests in tests/evidence-validator.test.ts

export interface ConfidenceAssessment {
  confidence: "confident" | "low";
  highRisk: string[];
  mediumRisk: string[];
  ignored: string[];
}

const BOILERPLATE = new Set([
  "the","and","for","that","this","with","from","have","will","must","not","but",
  "are","can","has","was","all","its","use","code","your","our",
  "product","intent","need","read","source","files","before","worker","directive",
  "constraints","red","flags","should","only","also","each","into","after",
  "cannot","then","make","keep","find","test","tests","testing","function",
  "return","returns","should","must","implementation","step","steps",
]);

const ACTION_VERBS = new Set([
  "fix","read","reads","write","writes","edit","edits","add","adds","create",
  "creates","multiply","multiplies","throw","throws","validate","validates",
  "invalid","compute","computes","handle","handles","change","changes",
  "modify","modifies","remove","removes","delete","deletes","run","runs",
  "call","calls","execute","executes","check","checks","verify","verifies",
  "accept","accepts","contain","contains","expect","expects",
]);

// Semantic zone markers — medium-risk terms only count near these
const SEMANTIC_MARKERS = ["return","returns","include","accept","field","entity","type","status","output","shape","expect","assert"];

/** Extract domain terms from evidence text (file contents, paths, task). */
export function extractEvidenceTerms(text: string): Set<string> {
  const terms = new Set<string>();
  const lower = text.toLowerCase();
  // File paths
  for (const m of text.matchAll(/(?:src|lib|tests?|app)\/[\w.\-/]+/g)) terms.add(m[0].toLowerCase());
  // camelCase/PascalCase
  for (const m of text.matchAll(/\b[a-z]+(?:[A-Z][a-z]*)+\b/g)) terms.add(m[0].toLowerCase());
  for (const m of text.matchAll(/\b[A-Z][a-z]+(?:[A-Z][a-z]*)+\b/g)) terms.add(m[0].toLowerCase());
  // snake_case
  for (const m of text.matchAll(/\b[a-z]+(?:_[a-z]+){1,}\b/g)) terms.add(m[0].toLowerCase());
  // Common field names
  for (const m of text.matchAll(/\b(?:id|total|status|name|type|count|size|items?|order|user|data|value|result|price|quantity)\b/gi)) terms.add(m[0].toLowerCase());
  return terms;
}

/** Check if a token is camelCase or PascalCase */
export function isHighRiskToken(token: string): boolean {
  return /^[a-z]+(?:[A-Z][a-z]*)+$/.test(token) || /^[A-Z][a-z]+(?:[A-Z][a-z]*)+$/.test(token);
}

/** Check if a token looks like a domain noun (not boilerplate, not action verb, not high-risk) */
function isMediumRiskCandidate(token: string): boolean {
  const lower = token.toLowerCase();
  if (BOILERPLATE.has(lower)) return false;
  if (ACTION_VERBS.has(lower)) return false;
  if (isHighRiskToken(token)) return false;
  // Must be a meaningful lowercase word
  return /^[a-z]{3,}$/.test(lower);
}

/** Check if a token appears near a semantic zone marker (not in the token itself) */
function isInSemanticZone(text: string, token: string): boolean {
  const idx = text.indexOf(token);
  if (idx < 0) return false;
  const before = text.slice(Math.max(0, idx - 50), idx).toLowerCase();
  const after = text.slice(idx + token.length, idx + token.length + 50).toLowerCase();
  // Check markers as whole words in surrounding context only
  const context = before + " " + after;
  return SEMANTIC_MARKERS.some((m) => {
    const pattern = new RegExp(`\\b${m}\\b`);
    return pattern.test(context);
  });
}

/**
 * Assess directive confidence against evidence terms.
 * CRITICAL: Do NOT lowercase directiveText before classification.
 *   - orderId → high-risk camelCase ✓
 *   - price → evidence lookup (lowercase) ✓
 */
export function assessDirectiveConfidence(
  evidenceTerms: Set<string>,
  directiveText: string,
): ConfidenceAssessment {
  const highRisk: string[] = [];
  const mediumRisk: string[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();

  // Extract raw tokens preserving casing
  const tokens = directiveText.match(/\b[a-zA-Z][a-zA-Z0-9_]*\b/g) ?? [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);

    // Evidence-backed → safe
    if (evidenceTerms.has(lower)) continue;

    // Boilerplate → ignore
    if (BOILERPLATE.has(lower)) { ignored.push(token); continue; }

    // Action verbs → ignore
    if (ACTION_VERBS.has(lower)) { ignored.push(token); continue; }

    // High-risk: camelCase/PascalCase not in evidence
    if (isHighRiskToken(token)) {
      highRisk.push(token);
      continue;
    }

    // Medium-risk: domain nouns in semantic zones
    if (isMediumRiskCandidate(token) && isInSemanticZone(directiveText, token)) {
      mediumRisk.push(token);
      continue;
    }

    // Unknown lowercase word not in semantic zone → ignore (likely action/implementation)
    if (/^[a-z]{3,}$/.test(lower)) {
      ignored.push(token);
      continue;
    }

    // Anything else (short words, unknown patterns) → ignore
    ignored.push(token);
  }

  const confidence = (highRisk.length > 0 || mediumRisk.length >= 2) ? "low" : "confident";
  return { confidence, highRisk, mediumRisk, ignored };
}
