## Product Intent

P57.2: Add the `working/` layer to Memory Sandbox — the LLM's draft space between raw traces and stable wiki.

Current P57 has raw records and wiki skills but no workspace for LLM to process, compare, rewrite, and refine. The "working" layer is where distillation happens — drafts can be dirty, wiki must be clean.

Three-layer model:
- raw/ — task traces, immutable, TTL 3 days
- working/ — LLM drafts, clusters, candidates, rewritable, longer TTL
- wiki/ — verified skills, persistent, no TTL

## WorkingDraft types

```ts
type DraftKind = "summary" | "cluster" | "candidate" | "failed_abstraction";

interface WorkingDraft {
  id: string;
  sessionId: string;      // groups drafts from one distillation run
  kind: DraftKind;
  title: string;
  content: string;         // free-form LLM output
  sourceRecordIds: string[];
  createdAt: string;
  expiresAt: string;       // working/ TTL: 7 days (longer than raw/)
}
```

## Acceptance Tests

1. saveDraft → queryable by sessionId
2. Multiple drafts per session
3. promoteToWiki: candidate draft → WikiSkill (draft removed from working/)  
4. discardDraft: removes draft from working/
5. purgeExpired: cleans raw records AND expired working drafts, keeps wiki
6. working/ and wiki/ are independently queryable
7. Existing 166 tests still pass
8. tsc clean

## Implementation Constraints

- Only touch: src/memory/**, tests/memory-store.test.ts, src/index.ts
- Do NOT touch: agent-loop, auto mode, TUI, provider, gates

## Coding Worker Directive

1. Add WorkingDraft + DraftKind to src/memory/types.ts
2. Add working/ CRUD to SandboxStore: saveDraft, queryDrafts, promoteToWiki, discardDraft
3. Update purgeExpired to clean raw + expired working drafts
4. Add tests
5. npx tsc --noEmit && npx vitest run
