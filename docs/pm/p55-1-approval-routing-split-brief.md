# P55.1 — Approval Routing Split Brief

## PM Intent

Fix the Kevix TUI approval-card default selection.

P55 validator is accepted: entity confidence now works. The remaining UX bug is that normal protective red flags still make the approval card default to **Regenerate**, even when the directive is safe and evidence-grounded.

Approval routing must distinguish **why** the card is shown:

1. Low confidence because of invented entities → default **Regenerate**.
2. Normal protective red flags / scope review → default **Approve**.
3. High-risk red flags / secrets / destructive operations → default **Reject**.

This task is TUI approval-routing only. Do not modify the active engine benchmark workflow.

## Scope Lock

Allowed:

- `src/cli/ink/evidence-validator.ts`
- `src/cli/ink/app.tsx`
- `tests/evidence-validator.test.ts` or a new `tests/approval-routing.test.ts`
- `docs/monitoring/evidence-log.md`

Do not modify:

- DeepSeek provider
- agent loop
- gates
- PEAN prompts
- tool timeline
- result card
- latency fast path
- benchmark scripts
- `.pean/directive.md` if active benchmark is using it

## Product Invariant

Do not collapse all review reasons into one `confidence` flag.

The approval card should be able to say:

- "This directive is untrusted because it invents entities" → Regenerate
- "This directive is safe but needs scope review" → Approve
- "This directive contains high-risk material" → Reject

## Required Routing

| Condition | Card? | Default |
|---|---:|---|
| `dirConf=low` from invented entities | yes | Regenerate |
| confident + no red flags + no wire risk + evidence-based | no | auto-approve |
| confident + normal protective red flags | yes | Approve |
| confident + wire risk | yes | Approve |
| confident + protective red flags + wire risk | yes | Approve |
| high-risk red flags / secrets / destructive ops | yes | Reject |
| low confidence + any red flags | yes | Regenerate |

## Risk Classification

Add a pure function to `src/cli/ink/evidence-validator.ts`:

```ts
export type DirectiveRiskLevel = "normal" | "protective" | "high";

export interface DirectiveRiskAssessment {
  level: DirectiveRiskLevel;
  reasons: string[];
}

export function classifyDirectiveRisk(
  redFlags: string | undefined,
  directiveText: string,
): DirectiveRiskAssessment;
```

### Protective Risk

Examples:

- "do not modify tests"
- "do not touch public API"
- "keep backward compatibility"
- "only modify src/foo.ts"
- file paths that are not security-critical

These require manual review but default to **Approve**.

### High Risk

If red flags or directive text mention any of these, default to **Reject**:

- secrets
- credentials
- API keys
- tokens
- passwords
- auth bypass
- permission bypass
- `.env`
- SSH keys
- destructive shell ops: `rm -rf`, `chmod -R 777`
- database destructive ops: `DROP TABLE`, `TRUNCATE`, destructive migration
- system config paths: `/etc/`, `/usr/bin`, `/System`, home ssh config

High-risk classification must look at both:

- `red_flags`
- full directive text

Do not depend on `bash-risk-gate.ts`; this operates on directive text, not executed commands.

## Implementation Direction

In `app.tsx`, replace the current binary collapse:

```ts
const confidence = dirConf === "low"
  ? "low"
  : redFlags ? "low" : "confident";
```

with separate values:

```ts
const entityConfidence = dirConf;
const risk = classifyDirectiveRisk(d.red_flags, d.raw);
```

Then choose default selected index:

```ts
let defaultSelection = 0; // Approve

if (entityConfidence === "low") {
  defaultSelection = 1; // Regenerate
} else if (risk.level === "high") {
  defaultSelection = 2; // Reject
} else {
  defaultSelection = 0; // Approve
}
```

Auto-approve only when:

- `entityConfidence === "confident"`
- `risk.level === "normal"`
- no wire risk
- evidence-based
- intent complete

If risk is `protective`, show the card with Approve selected.

## Required Tests

Add tests for `classifyDirectiveRisk()` and approval-default selection logic.

Minimum cases:

1. Invented entity:
   - `dirConf=low`
   - default = Regenerate
2. Protective red flag:
   - `red_flags="Do not modify test/summarizeOrder.test.js"`
   - default = Approve
3. Public API protective flag:
   - `red_flags="Do not change public API"`
   - default = Approve
4. High-risk secret:
   - `red_flags="Do not touch .env or credentials"`
   - default = Reject
5. High-risk destructive:
   - directive mentions `rm -rf` or `DROP TABLE`
   - default = Reject
6. Confident + no red flags + evidence-based:
   - auto-approve path preserved
7. Low confidence + protective red flags:
   - default = Regenerate, because entity confidence wins

## Interactive Fixture Check

After tests pass, run the fixture:

```bash
cd /private/tmp/kevix-usability-fixture
kevix
```

Task:

```txt
fix bug in src/summarizeOrder.js so npm test passes
```

Expected approval card:

- No unknown entity Low confidence warning.
- Red Flags may include "do not modify test file".
- Default selection should be **Approve**, not Regenerate.

## Done Definition

P55.1 is done only when:

- `classifyDirectiveRisk()` exists and is tested.
- App routing separates entity confidence from risk level.
- Protective red flags default to Approve.
- High-risk red flags default to Reject.
- Low-confidence entity cases still default to Regenerate.
- `npx tsc --noEmit && npx vitest run` passes.
- Interactive fixture confirms default Approve for ordinary test-file red flag.

