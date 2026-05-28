## Product Intent

P56 Scope-First Proposal — Kevix TUI first interaction generates a Scope Proposal centered on "what IS editable", not "what NOT to touch".

Three anchor concepts replace the vague proposal:
1. Editable Scope — which files can be modified
2. Read-only Evidence — which files inform the fix but must stay unchanged
3. Success Check — what command proves the fix works

This shifts Kevix from defensive red-flag enumeration to positive task boundary definition. Worker operates inside the scope. Crossing the boundary requires scope expansion (user re-confirms).

## Hidden Semantics

- Scope Proposal card replaces the previous vague "Goal/Plan/Boundaries" format
- "Editable Scope" is the primary framing, "Read-only Evidence" complements it
- Proposal generation prompt must be updated to extract scope from evidence
- If evidence scan finds test files, they become Read-only Evidence by default
- If evidence scan finds source files, they become Editable Scope by default
- Success Check defaults to "npm test" when test files are present, otherwise inferred
- Scope is passed to Controller as hints, anchoring the directive
- Worker gate concept: Edit/Write outside Editable Scope = pause and ask

## Acceptance Tests

1. Fixture task "fix bug in src/summarizeOrder.js so npm test passes"
   - Editable Scope: src/summarizeOrder.js
   - Read-only Evidence: test/summarizeOrder.test.js
   - Success Check: npm test
2. No invented entity false positives on the fixture task
3. Confirmed scope passed to Controller hints
4. Full pipeline: Input → Scope Proposal → [Approve] → Controller → DirectiveCard → [Execute] → Worker → Result
5. npx tsc --noEmit && npx vitest run passes

## Implementation Constraints

Only touch: src/cli/ink/intent-router.ts, src/cli/ink/ProposalCard.tsx, src/cli/ink/DirectiveCard.tsx, src/cli/ink/app.tsx, tests/*
Do NOT touch: agent-loop, provider, gates, types.ts, benchmark scripts

## Red Flags

- src/loop/agent-loop.ts — do NOT modify
- src/gates/* — do NOT modify
- src/provider/* — do NOT modify
- src/types.ts — do NOT modify

## Coding Worker Directive

1. Fix broken string literal in app.tsx (proposalHints concatenation)
2. Rewrite intent-router.ts: Proposal type → ScopeProposal with {goal, editableScope, readOnlyEvidence, successCheck, plan}
3. Update PROPOSAL_SYSTEM prompt to generate scope-first output
4. Update ProposalCard.tsx to render Scope Proposal format
5. Verify: npx tsc --noEmit && npx vitest run
