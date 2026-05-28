## Product Intent

P62: Three engine enhancements in priority order.

P62.1 Session compression — call estimateTokens before each LLM call, compact oldest messages when near context limit. Prevents Worker losing context on long tasks.

P62.2 Wiki RAG injection — query wiki skills before Controller, inject structured experience into hints. Controller gets playbook + common failures + evidence hints.

P62.3 Tool streaming — expose tool_start/tool_result events more frequently during Worker execution. Already in engine, verify wiring.

## P62.1 Hidden Semantics

- Check token count in runToolLoop before each provider.call
- If estimated tokens > 80% of model limit, compact: keep system + last 4 messages + trim middle
- model token limits: deepseek-chat=65536, deepseek-v4-pro=131072
- Use simple char/4 estimator (pessimistic, safe)
- Compact happens transparently — Worker doesn't notice

## P62.2 Hidden Semantics

- Query wiki in runController, before building controller prompt
- Match skills by file paths and keywords in problem
- Build structured hints: playbook + required evidence + common failures
- Append to existing hints (don't replace)

## Acceptance Tests

P62.1:
- Messages under limit → no compaction
- Messages over 80% limit → oldest compacted
- Compact preserves system message

P62.2:
- Wiki has matching skill → hints contain playbook
- No matching skill → hints unchanged
- Hints still contain original evidence info

All: 234 existing tests pass. tsc clean.

## Coding Worker Directive

1. Add compactSession() to session/context.ts
2. Call compactSession in runToolLoop before LLM calls
3. Add buildWikiHints() to memory/router.ts
4. Call in runController to inject wiki experience
5. Add tests
6. npx tsc --noEmit && npx vitest run
