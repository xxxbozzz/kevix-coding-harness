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

/** Check if a token appears in a domain/entity structure (not plain prose).
 *  Structural patterns only — object shapes, param declarations, field assignments. */
function isInSemanticZone(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    // 1. Object shape: { ... token ... }
    new RegExp(`\\{[^}]*\\b${escaped}\\b[^}]*\\}`, "i"),
    // 2. Parameter/entity declarations: accepts/input/entity/type + token
    new RegExp(`\\b(?:accepts?|input|entity|type)\\s+(?:a|an|the\\s+)?\\w*\\b${escaped}\\b`, "i"),
    // 3. Field/value assignment: label: token  or  token: value  or  token = value
    new RegExp(`\\b(?:field|status|type)\\s*[:=]\\s*\\b${escaped}\\b`, "i"),
    new RegExp(`\\b${escaped}\\s*[:=]`, "i"),
  ].some((p) => p.test(text));
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

// ── P55.1 Directive Risk Classification ──

export type DirectiveRiskLevel = "normal" | "protective" | "high";

export interface DirectiveRiskAssessment {
  level: DirectiveRiskLevel;
  reasons: string[];
}

const HIGH_RISK_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /secret|credential|api[_-]?key|token|password/i, label: "mentions secrets/credentials" },
  { pattern: /\.env/, label: "references .env files" },
  { pattern: /\.aws\//, label: "references AWS config" },
  { pattern: /\.ssh\//, label: "references SSH keys" },
  { pattern: /auth\s*bypass|permission\s*bypass|access\s*control\s*bypass/i, label: "mentions auth/permission bypass" },
  { pattern: /rm\s+-rf/, label: "mentions destructive shell op" },
  { pattern: /chmod\s+-[rR]\s+777/, label: "mentions destructive chmod" },
  { pattern: /DROP\s+(TABLE|DATABASE)/i, label: "mentions destructive DB op" },
  { pattern: /TRUNCATE\s+(TABLE\s+)?\w/i, label: "mentions destructive DB op" },
  { pattern: /destructive\s+migration/i, label: "mentions destructive migration" },
  { pattern: /\/etc\//, label: "references system config path" },
  { pattern: /\/usr\/bin/, label: "references system binary path" },
  { pattern: /\/[sS]ystem\//, label: "references system path" },
  { pattern: /sudo\b|root\b/, label: "mentions elevated privileges" },
];

/** Classify directive risk from red flags and directive text. Pure function. */
export function classifyDirectiveRisk(
  redFlags: string | undefined,
  directiveText: string,
): DirectiveRiskAssessment {
  const reasons: string[] = [];
  const combined = ((redFlags ?? "") + " " + directiveText).toLowerCase();

  for (const { pattern, label } of HIGH_RISK_PATTERNS) {
    if (pattern.test(combined)) {
      reasons.push(label);
    }
  }

  if (reasons.length > 0) {
    return { level: "high", reasons };
  }

  const hasRedFlags = redFlags && redFlags !== "None" && redFlags !== "None." && redFlags.trim().length > 0;
  if (hasRedFlags) {
    return { level: "protective", reasons: ["directive has red flags requiring scope review"] };
  }

  return { level: "normal", reasons: [] };
}

/** Compute approval card default selection from entity confidence + risk level.
 *  0 = Approve, 1 = Regenerate, 2 = Reject */
export function getApprovalDefaultSelection(params: {
  entityConfidence: "confident" | "low";
  riskLevel: DirectiveRiskLevel;
}): 0 | 1 | 2 {
  if (params.entityConfidence === "low") return 1;
  if (params.riskLevel === "high") return 2;
  return 0;
}
