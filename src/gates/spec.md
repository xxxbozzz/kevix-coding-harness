# PEAN Gate Layer Spec

## 设计原则

- **代码级 gate，不是 prompt** — 每个 gate 是纯 TypeScript 函数，输入结构化数据，输出 `allow | deny | ask`
- **fail-closed** — 默认 deny，必须显式 allow
- **与 PEAN phase 绑定** — BeforeToolUse（Worker 阶段）、BeforeComplete（Stop 阶段）
- **独立可测试** — 每个 gate 独立，无副作用

## Gate Decision Schema

```typescript
type GateDecision = "allow" | "deny" | "ask";

interface GateResult {
  decision: GateDecision;
  gate: string;        // gate name, e.g. "red-flag"
  reason: string;      // human-readable reason
}
```

## Gate 1: Directive Gate

**触发点**: BeforeToolUse (Worker phase)
**规则**: 如果没有合法的 PEAN directive（6 段完整、非空），deny 所有 Write/Edit/Bash 工具调用。Read/Glob/Grep 仍 allow。

```
Input:  directive: PEANDirective | null, toolName: string
Output: allow | deny

Logic:
  if toolName in [Read, Grep, Glob] → allow
  if directive == null → deny ("No directive exists")
  if !validateDirective(directive).length > 0 → deny ("Directive missing sections: ...")
  → allow
```

允许 Read/Grep/Glob 是为了让 Worker 在没有 directive 时也能先探索代码（但不可能改代码）。

## Gate 2: Red Flag Gate

**触发点**: BeforeToolUse (Worker phase)
**规则**: directive 的 Red Flags 段列出的文件路径，deny Write/Edit。

```
Input:  redFlags: string, toolName: string, toolArgs: { file_path?: string }
Output: allow | deny

Logic:
  parse redFlags text for file paths / glob patterns
  if toolName not in [Write, Edit] → allow
  if toolArgs.file_path matches any red flag pattern → deny ("File is in Red Flags: {path}")
  → allow
```

Red Flags 解析：从 directive 文本中提取路径（如 `src/auth/login.ts`、`!src/auth/**`、`config/*.json`）。支持简单 glob。

## Gate 3: Scope Gate

**触发点**: BeforeToolUse (Worker phase)
**规则**: 工具调用修改的文件必须在 project root 范围内，且不能是敏感系统路径。

```
Input:  toolName: string, toolArgs: { file_path?: string }, projectRoot: string
Output: allow | deny | ask

Logic:
  if toolName not in [Write, Edit] → allow
  resolved = resolve(projectRoot, toolArgs.file_path)
  if resolved outside projectRoot → deny ("File outside project scope")
  if resolved in [~/.ssh, ~/.aws, /etc, .env, **/.git/config] → deny ("Sensitive path")
  if resolved in node_modules / venv / .venv / __pycache__ → ask ("Modifying dependency")
  → allow
```

## Gate 4: Bash Risk Gate

**触发点**: BeforeToolUse (Worker phase)
**规则**: 危险 bash 命令默认 deny 或 ask。

```
Input:  command: string
Output: deny | ask | allow

Risk levels:
  CRITICAL (→ deny):
    - rm -rf / (任何 rm -rf 涉及 /)
    - git push --force (任何 force push)
    - curl ... | bash / sh
    - eval 任何内容
    - chmod 777 /
    - > /dev/sda

  HIGH (→ deny without ask):
    - rm -rf (任何路径)
    - git reset --hard
    - git clean -fd
    - docker rm -f
    - DROP TABLE / DROP DATABASE
    - mkfs
    - dd if=

  MEDIUM (→ ask):
    - git push
    - git commit (allow, but log)
    - npm publish
    - docker push
    - ssh
    - scp
    - curl anything to pipe
    - 读取 *secret* / *token* / *password* / .env / API_KEY
    - 读取 ~/.ssh / ~/.aws / ~/.config

  LOW (→ allow):
    - ls, cat, echo, cd, pwd
    - git status, git diff, git log, git branch
    - npm test, npm run build, npm install
    - python, node, grep, find, wc
    - docker ps, docker logs
    - Everything else
```

## Gate 5: Verifier Verdict Gate

**触发点**: BeforeComplete (Stop 前)
**规则**: 如果 mode=probe 且 verifier verdict 为 "needs_revision" 且 revision_count < max，不允许 complete。

```
Input:  mode: PEANMode, verdict: "clean" | "needs_revision" | null,
        revisionCount: number, maxRevisions: number
Output: allow | deny

Logic:
  if mode != "probe" → allow
  if verdict == null → deny ("Probe verification not completed")
  if verdict == "needs_revision" && revisionCount < maxRevisions → deny ("Verification failed, revision required")
  if verdict == "clean" → allow
```

## Gate 6: Probe Required Gate

**触发点**: BeforeComplete (Stop 前)
**规则**: 涉及 wire-level 风险的任务，如果 mode=probe 或 auto 判定 need_probe=true，未执行 probe 不允许 complete。

```
Input:  mode: PEANMode, needProbe: boolean | null,
        probeCompleted: boolean, problemText: string
Output: allow | deny

Logic:
  // Check if problem involves wire-level concerns
  wireKeywords = [API, endpoint, route, request, response, HTTP, REST, RPC,
                  database, DB, SQL, query, schema, migration, serialize,
                  deserialize, encode, decode, bytes, string, charset, UTF,
                  webhook, callback, event, message, queue, concurrency,
                  race, lock, mutex, thread, async, promise, timeout]
  hasWireRisk = problemText contains any wireKeywords

  if mode == "probe" && hasWireRisk && !probeCompleted → deny ("Probe mode requires verification for wire-level changes")
  if mode == "auto" && needProbe == true && !probeCompleted → deny ("Auto-assess triggered probe but probe not completed")
  → allow
```

## 接入点

### BeforeToolUse

在 agent-loop.ts 的 Worker 工具执行前：

```typescript
async function executeToolWithGates(toolCall, context): Promise<ToolResult> {
  for (const gate of beforeToolUseGates) {
    const result = gate.check(toolCall, context);
    if (result.decision === "deny") return errorResult(result.reason);
    if (result.decision === "ask") {
      // In non-interactive mode, deny. In interactive, prompt user.
      return errorResult(`Blocked by ${result.gate}: ${result.reason}`);
    }
  }
  return tool.execute(toolCall);
}
```

### BeforeComplete

在 agent-loop.ts 的最终完成前：

```typescript
function checkBeforeComplete(context): GateResult[] {
  return beforeCompleteGates.map(g => g.check(context)).filter(r => r.decision !== "allow");
}
```

## 文件结构

```
src/gates/
├── spec.md              # This file
├── types.ts             # GateDecision, GateResult, GateFn
├── directive-gate.ts    # Gate 1
├── red-flag-gate.ts     # Gate 2
├── scope-gate.ts        # Gate 3
├── bash-risk-gate.ts    # Gate 4
├── verifier-gate.ts     # Gate 5
├── probe-required-gate.ts # Gate 6
├── registry.ts          # Register all gates, export checkAll
└── __tests__/
    ├── directive-gate.test.ts
    ├── red-flag-gate.test.ts
    ├── scope-gate.test.ts
    ├── bash-risk-gate.test.ts
    ├── verifier-gate.test.ts
    └── probe-required-gate.test.ts
```
