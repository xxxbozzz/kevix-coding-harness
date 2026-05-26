# P55 TUI Day 1 — Weighted Entity Validator Precision Brief

## PM Intent

Fix the Kevix **TUI** Directive Validity Control Plane without touching the active engine benchmark workflow.

The engine can continue benchmarking in parallel. This task is only about the Ink TUI validator used before the approval card.

Day 1 goal:

- catch real invented entities
- stop false-positive loops
- keep evidence-first approval usable
- add regression tests so this does not break again

## Scope Lock

Only modify TUI validator extraction/scoring and its tests.

Allowed:

- `src/cli/ink/*`
- `tests/*validator*.test.ts`
- monitoring evidence log

Do not modify:

- active benchmark runner
- SWE-bench scripts
- DeepSeek provider
- agent loop
- gates
- PEAN prompts
- tool timeline
- result card
- latency fast path
- `.pean/directive.md` if it is being used by benchmark

## Current Failure

The validator has been oscillating:

1. P52 caught hallucinated `cart/orderId/timestamp/pending`, but also flagged normal words like `product/intent/need/read/source`.
2. P54 read evidence file contents, but did not reliably catch `cart/timestamp/pending`.
3. P55 introduced weighted scoring, but lowercased directive text before classification:
   - `orderId` becomes `orderid`
   - high-risk camelCase logic does not actually fire
4. Correct directives can still be marked Low confidence because ordinary action words are counted:
   - `fix`
   - `reads`
   - `multiplies`
   - `throws`
   - `invalid`

This violates Kevix UX invariant:

> A control-plane gate must be precise. If it over-blocks, users learn to ignore it. If it under-blocks, it fails its purpose.

## Product Invariants

Preserve all of these:

| Invariant | Required Behavior |
|---|---|
| Evidence grounding | Controller directive may not invent domain entities absent from source/test/task evidence |
| Validator precision | Boilerplate and action words must not be treated as invented entities |
| Approval routing | Low confidence defaults to Regenerate; confident directives do not get stuck in regenerate loops |
| User control | Approve / Regenerate / Reject remain visible and truthful |
| Evidence source | Evidence terms come from small evidence file contents, not only file paths |
| Benchmark isolation | Do not interrupt active engine benchmark work |

## Required Behavior Matrix

Use the fixture domain:

- Source: `src/summarizeOrder.js`
- Test: `test/summarizeOrder.test.js`
- Valid terms: `summarizeOrder`, `order`, `items`, `quantity`, `price`, `id`, `total`, `status`
- Invented terms: `cart`, `orderId`, `itemCount`, `timestamp`, `pending`

| Case | Directive Mentions | Expected |
|---|---|---|
| Good fixture directive | `order.items`, `price`, `quantity`, `{ id, total, status }` | Confident / not Low due entity validator |
| Bad camelCase field | `orderId` | Low confidence, highRisk includes `orderId` |
| Bad Pascal/camel field | `itemCount` | Low confidence, highRisk includes `itemCount` |
| Bad output nouns | `cart`, `timestamp`, `pending` | Low confidence |
| Boilerplate only | `product`, `intent`, `need`, `read`, `source`, `files` | ignored |
| Action words only | `fix`, `reads`, `multiplies`, `throws`, `invalid` | ignored |

## Implementation Direction

### 1. Extract Validator Into a Dedicated Module

Move logic out of `src/cli/ink/app.tsx` into something like:

`src/cli/ink/evidence-validator.ts`

Suggested API:

```ts
export interface ConfidenceAssessment {
  confidence: "confident" | "low";
  highRisk: string[];
  mediumRisk: string[];
  ignored: string[];
}

export function extractEvidenceTerms(text: string): Set<string>;

export function assessDirectiveConfidence(
  evidenceTerms: Set<string>,
  directiveText: string,
): ConfidenceAssessment;
```

The TUI should call this module. It should not contain complex validator logic inline.

### 2. Preserve Original Casing For Risk Classification

Do not run classification on `directiveText.toLowerCase()`.

Correct flow:

1. extract raw tokens preserving casing
2. classify raw token shape:
   - `orderId` => high-risk camelCase
   - `ItemCount` => high-risk PascalCase
3. lower-case only for evidence lookup:
   - `orderId` lookup key = `orderid`

### 3. Improve Evidence Extraction

Evidence extraction should read small file contents already found by fast scan.

Extract:

- file paths
- exported/imported identifiers
- function names
- parameter names
- object keys: `id:`, `total:`, `status:`
- property access: `.items`, `.quantity`, `.price`
- destructuring keys
- string literals in tests
- assertion output shape keys

Keep size caps:

- skip files >200KB
- skip files >3000 lines

### 4. Restrict Medium-Risk Scoring To Semantic Zones

Do not treat every unknown lowercase word as medium risk.

Medium-risk terms should come from zones like:

- `return ...`
- `returns ...`
- `include ...`
- `accept ...`
- `field ...`
- `entity ...`
- `type ...`
- `status ...`
- object literal / output shape text

Ignore action/implementation verbs:

- fix
- read / reads
- multiply / multiplies
- throw / throws
- validate / invalid
- compute
- handle

### 5. Weighted Confidence Rule

Expected scoring:

- any high-risk unknown camelCase/PascalCase field => Low confidence
- two or more unknown medium-risk domain nouns in semantic zones => Low confidence
- boilerplate/action words => zero weight
- evidence-backed terms => zero risk

## Required Tests

Add dedicated tests. Do not rely only on broad existing tests.

Suggested file:

`tests/evidence-validator.test.ts`

Minimum cases:

1. `good fixture directive is confident`
2. `unknown orderId is high risk`
3. `unknown itemCount is high risk`
4. `unknown cart timestamp pending are medium risk and trigger low confidence`
5. `boilerplate words are ignored`
6. `action words are ignored`
7. `evidence-backed lowercase fields are safe`

Test with realistic evidence content:

```js
import { summarizeOrder } from "../src/summarizeOrder.js";

test("preserves output shape", () => {
  expect(summarizeOrder({
    id: "A1",
    status: "paid",
    items: [{ price: 5, quantity: 2 }]
  })).toEqual({ id: "A1", total: 10, status: "paid" });
});
```

## Validation Commands

Run:

```bash
npx tsc --noEmit
npx vitest run tests/evidence-validator.test.ts
npx vitest run
```

Then do one static/minimal reproduction:

- good directive => confident
- bad `orderId` directive => low
- bad `cart timestamp pending` directive => low

## Evidence Logging

Append result to:

`docs/monitoring/evidence-log.md`

The log must include:

- what changed
- which invariant it protects
- exact test results
- remaining risks

## Done Definition

P55 is done only when all are true:

- dedicated validator module exists
- dedicated validator tests exist
- high-risk casing bug fixed
- good fixture directive not misclassified
- `cart/orderId/timestamp/pending` absent from evidence triggers Low confidence
- full test suite passes
- evidence log updated

