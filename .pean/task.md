P56.3b Scope Summary Correctness

只做 engine，不碰 TUI。

Fix 1:
scopeExpansionRequests 必须是可变 ref，不要用 number 包一层临时对象。

Current bug:
let scopeExpansionRequests = 0
gateData receives { value: scopeExpansionRequests }
tool loop increments value
summary returns original number

Fix:
const scopeExpansionRequests = { value: 0 }
pass same ref to gateData
summary returns scopeExpansionRequests.value

Fix 2:
Add real runAgentLoop integration test.

Test scenario:
- provider returns directive
- worker first tries edit/write src/bar.ts outside editableScope ["src/foo.ts"]
- onEvent receives scope_expansion_required
- onScopeExpansionRequired returns "approve"
- provider then returns second tool call edit/write src/bar.ts again
- tools.execute should be called for second attempt
- summary.scopeExpansionRequests === 1
- summary.expandedScope includes src/bar.ts
- summary.filesChanged includes src/bar.ts
- summary.scopeRespected === true

Also add reject test:
- callback returns reject
- tools.execute not called for out-of-scope write
- summary.scopeExpansionRequests === 1
- summary.expandedScope does not include file
- summary.filesChanged does not include file

Acceptance:
npx tsc --noEmit
npx vitest run tests/scope-contract.test.ts
npx vitest run