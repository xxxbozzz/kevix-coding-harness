// Review Quality Benchmark
// Tests REVIEW_SYSTEM against 15 seeded patches (10 bad, 5 clean).
// Usage: DEEPSEEK_API_KEY=sk-xxx npx tsx scripts/review-bench.ts

import { writeFileSync, mkdirSync } from "node:fs";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) { console.error("DEEPSEEK_API_KEY not set"); process.exit(1); }

const BASE_URL = "https://api.deepseek.com/v1";
const MODEL = "deepseek-chat";

// Strengthened review prompt
import { REVIEW_SYSTEM } from "../src/provider/pean-system.js";

// ============================================================
// Common directive — login form validation fix
// ============================================================
const DIRECTIVE = `## Product Intent
Fix the login form validation to handle empty and null inputs without crashing.
The function processLogin(username, password) must return { valid: boolean, error?: string }.

## Hidden Semantics
- username can be null, undefined, empty string, or whitespace-only
- password can be null, undefined, or empty string
- Both fields must be validated before any API call
- Return type must be { valid: boolean, error?: string } consistently

## Acceptance Tests
1. null username → { valid: false, error: "Username required" }
2. empty password → { valid: false, error: "Password required" }
3. valid inputs → { valid: true }
4. whitespace username → { valid: false, error: "Username required" }

## Implementation Constraints
- Do not change the function signature: processLogin(username: string | null, password: string | null)
- Do not add new dependencies
- The function must NOT throw — always return the result object

## Red Flags
- Do NOT modify src/auth/api.ts
- Do NOT modify database queries

## Coding Worker Directive
1. Add null/undefined guard at the top
2. Add whitespace check (trim + empty)
3. Return consistent error format
4. Last line should be: return { valid: true }`;

// ============================================================
// Test cases: (label, patch, ground_truth)
// ============================================================
interface TestCase {
  label: string;
  category: string;
  patch: string;
  ground_truth: "BLOCKED" | "PASS";
  expected_issue?: string;
}

const CASES: TestCase[] = [
  // ---- BAD patches (should be BLOCKED) ----
  {
    label: "bad-01-boundary-missing-null",
    category: "boundary",
    ground_truth: "BLOCKED",
    expected_issue: "does not handle null username",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,8 @@
 function processLogin(username: string | null, password: string | null) {
+  if (!username) return { valid: false, error: "Username required" };
+  if (!password) return { valid: false, error: "Password required" };
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "bad-02-boundary-whitespace",
    category: "boundary",
    ground_truth: "BLOCKED",
    expected_issue: "whitespace-only username not rejected",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,8 @@
 function processLogin(username: string | null, password: string | null) {
+  if (username == null) return { valid: false, error: "Username required" };
+  if (password == null || password === "") return { valid: false, error: "Password required" };
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "bad-03-type-unsafe-cast",
    category: "type-safety",
    ground_truth: "BLOCKED",
    expected_issue: "unsafe type assertion",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,8 @@
 function processLogin(username: string | null, password: string | null) {
+  const u = username as string;
+  const p = password as string;
+  if (!u.trim() || !p.trim()) return { valid: false };
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "bad-04-error-swallowed",
    category: "error-loss",
    ground_truth: "BLOCKED",
    expected_issue: "original error information lost",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,12 @@
 function processLogin(username: string | null, password: string | null) {
+  try {
+    if (!username || !password) return { valid: false };
+    // ... validation logic
+  } catch (e) {
+    return { valid: false, error: "Validation failed" };
+  }
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "bad-05-wrong-return-type",
    category: "interface-drift",
    ground_truth: "BLOCKED",
    expected_issue: "return type inconsistent",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,8 @@
 function processLogin(username: string | null, password: string | null) {
+  if (!username) return false;
+  if (!password) return false;
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "bad-06-out-of-scope",
    category: "scope",
    ground_truth: "BLOCKED",
    expected_issue: "modifies red-flagged file",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,8 @@
 function processLogin(username: string | null, password: string | null) {
+  if (!username || !password) return { valid: false };
   return { valid: true };
 }
--- a/src/auth/api.ts
+++ b/src/auth/api.ts
@@ -10,3 +10,5 @@
+// Also validate here
+export function validateApi() {}
\`\`\``,
  },
  {
    label: "bad-07-missing-guard-undefined",
    category: "boundary",
    ground_truth: "BLOCKED",
    expected_issue: "undefined not handled separately from null",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,7 @@
 function processLogin(username: string | null, password: string | null) {
+  if (username === null) return { valid: false, error: "Username required" };
+  if (password === null) return { valid: false, error: "Password required" };
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "bad-08-throw-instead-of-return",
    category: "regression",
    ground_truth: "BLOCKED",
    expected_issue: "throws instead of returning error object",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,7 @@
 function processLogin(username: string | null, password: string | null) {
+  if (!username) throw new Error("Username required");
+  if (!password) throw new Error("Password required");
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "bad-09-duplicate-logic",
    category: "quality",
    ground_truth: "BLOCKED",
    expected_issue: "duplicated validation should use helper",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,15 @@
 function processLogin(username: string | null, password: string | null) {
+  if (!username || username.trim() === "") return { valid: false, error: "Username required" };
+  if (!password || password.trim() === "") return { valid: false, error: "Password required" };
   return { valid: true };
 }
+
+function processSignup(username: string | null, password: string | null) {
+  if (!username || username.trim() === "") return { valid: false, error: "Username required" };
+  if (!password || password.trim() === "") return { valid: false, error: "Password required" };
+  return { valid: true };
+}
\`\`\``,
  },
  {
    label: "bad-10-empty-catch",
    category: "error-loss",
    ground_truth: "BLOCKED",
    expected_issue: "empty catch block silently ignores errors",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,11 @@
 function processLogin(username: string | null, password: string | null) {
+  try {
+    validateInput(username, password);
+  } catch (e) {
+    // ignore
+  }
   return { valid: true };
 }
\`\`\``,
  },

  // ---- CLEAN patches (should PASS) ----
  {
    label: "clean-01-proper-guard",
    category: "boundary",
    ground_truth: "PASS",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,10 @@
 function processLogin(username: string | null, password: string | null) {
+  if (username == null || username.trim() === "") {
+    return { valid: false, error: "Username required" };
+  }
+  if (password == null || password === "") {
+    return { valid: false, error: "Password required" };
+  }
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "clean-02-minimal-fix",
    category: "boundary",
    ground_truth: "PASS",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,6 @@
 function processLogin(username: string | null, password: string | null) {
+  if (username == null || username.trim().length === 0) return { valid: false, error: "Username required" };
+  if (password == null || password.length === 0) return { valid: false, error: "Password required" };
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "clean-03-type-safe",
    category: "type-safety",
    ground_truth: "PASS",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,7 @@
 function processLogin(username: string | null, password: string | null) {
+  const u: string | null = username;
+  const p: string | null = password;
+  if (!u?.trim() || !p?.trim()) return { valid: false, error: "Required" };
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "clean-04-error-preserved",
    category: "error-loss",
    ground_truth: "PASS",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,12 @@
 function processLogin(username: string | null, password: string | null) {
+  try {
+    if (!username?.trim() || !password?.trim()) return { valid: false, error: "Required" };
+  } catch (e) {
+    const msg = e instanceof Error ? e.message : String(e);
+    return { valid: false, error: msg };
+  }
   return { valid: true };
 }
\`\`\``,
  },
  {
    label: "clean-05-no-change",
    category: "scope",
    ground_truth: "PASS",
    patch: `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,7 @@
 function processLogin(username: string | null, password: string | null) {
+  if (username == null || username.toString().trim() === "") {
+    return { valid: false, error: "Username required" };
+  }
   return { valid: true };
 }
\`\`\``,
  },
];

// ============================================================
// Review API call
// ============================================================
async function callReview(directive: string, patch: string): Promise<{
  verdict: string;
  issues: Array<{ category?: string; severity?: string; description?: string }>;
  raw: string;
  tokens: number;
  duration_ms: number;
}> {
  const messages = [
    { role: "system", content: REVIEW_SYSTEM },
    { role: "user", content: `## Directive\n\n${directive}\n\n## Patch to Review\n\n${patch}` },
  ];

  const t0 = Date.now();
  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.1, max_tokens: 1024 }),
  });
  const data = await resp.json() as any;
  const raw = data.choices?.[0]?.message?.content ?? "";
  const tokens = data.usage?.total_tokens ?? 0;

  // Parse JSON from response (handle markdown fences and bare JSON)
  let verdict = "BLOCKED";
  let issues: Array<{ category?: string; severity?: string; description?: string }> = [];
  const clean = raw
    .replace(/```(?:json)?\s*\n?/g, "")  // strip markdown fences
    .replace(/```/g, "")                    // trailing fences
    .trim();

  try {
    const parsed = JSON.parse(clean);
    verdict = parsed.verdict === "PASS" ? "PASS" : "BLOCKED";
    issues = parsed.issues ?? [];
  } catch {
    // Try regex extraction
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        verdict = parsed.verdict === "PASS" ? "PASS" : "BLOCKED";
        issues = parsed.issues ?? [];
      } catch { /* fall through */ }
    }
    // Fallback: markdown parse
    if (verdict === "BLOCKED" && raw.match(/Verdict:\s*PASS/i)) verdict = "PASS";
    if (verdict === "PASS" && raw.match(/Verdict:\s*BLOCKED/i)) verdict = "BLOCKED";
  }

  return { verdict, issues, raw, tokens, duration_ms: Date.now() - t0 };
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log("=".repeat(70));
  console.log("  Review Quality Benchmark");
  console.log(`  ${CASES.length} test cases (${CASES.filter((c) => c.ground_truth === "BLOCKED").length} bad, ${CASES.filter((c) => c.ground_truth === "PASS").length} clean)`);
  console.log("=".repeat(70));
  console.log();

  const results: Array<{
    label: string;
    category: string;
    ground_truth: string;
    verdict: string;
    issues_count: number;
    correct: boolean;
    tokens: number;
    duration_ms: number;
  }> = [];

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i]!;
    process.stdout.write(`[${String(i + 1).padStart(2)}/${CASES.length}] ${c.label}... `);
    const r = await callReview(DIRECTIVE, c.patch);
    const correct = r.verdict === c.ground_truth;
    results.push({
      label: c.label, category: c.category, ground_truth: c.ground_truth,
      verdict: r.verdict, issues_count: r.issues.length, correct,
      tokens: r.tokens, duration_ms: r.duration_ms,
    });
    const mark = correct ? "✓" : "✗";
    console.log(`${mark} (${r.verdict}, ${r.issues.length} issues, ${r.duration_ms}ms)`);
    await new Promise((r) => setTimeout(r, 500)); // rate limit
  }

  // Stats
  const badCases = results.filter((r) => r.ground_truth === "BLOCKED");
  const cleanCases = results.filter((r) => r.ground_truth === "PASS");
  const badCaught = badCases.filter((r) => r.correct).length;
  const cleanOk = cleanCases.filter((r) => r.correct).length;
  const recall = (badCaught / badCases.length * 100).toFixed(0);
  const fpRate = ((cleanCases.length - cleanOk) / cleanCases.length * 100).toFixed(0);

  console.log();
  console.log("=".repeat(70));
  console.log(`  Bad patch recall: ${badCaught}/${badCases.length} (${recall}%)`);
  console.log(`  Clean patch FP rate: ${cleanCases.length - cleanOk}/${cleanCases.length} (${fpRate}%)`);
  console.log(`  Overall accuracy: ${results.filter((r) => r.correct).length}/${results.length}`);
  console.log("=".repeat(70));

  // Per-category
  console.log();
  for (const cat of [...new Set(results.map((r) => r.category))]) {
    const cr = results.filter((r) => r.category === cat);
    const ok = cr.filter((r) => r.correct).length;
    console.log(`  ${cat}: ${ok}/${cr.length}`);
  }

  // Save
  const outDir = process.cwd() + "/results";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/review-bench.json`, JSON.stringify({ results, recall_pct: recall, fp_rate_pct: fpRate }, null, 2));
  console.log(`\nResults: ${outDir}/review-bench.json`);

  const pass = badCaught >= 8 && cleanOk >= 3;
  console.log(pass ? "\nPASS: Review quality meets threshold" : "\nFAIL: Review quality below threshold");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
