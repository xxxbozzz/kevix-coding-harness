# P58.1 Tool Timeline Capture

## Product Intent

P58 已能把任务结束后的 RawMemoryRecord 写入 sandbox，但 toolTimeline 为空。
这会让 LLM research sandbox 失去最重要的过程材料。

修复目标：
runToolLoop 必须记录真实工具轨迹，并写入 RawMemoryRecord.toolTimeline。

## Hidden Semantics

1. toolTimeline 是给 LLM 后续研究用的，不是 UI 日志。
2. 必须记录成功工具和被 gate 阻断的工具。
3. 不需要保存完整 tool output，避免 memory 膨胀。
4. 只保存结构化摘要：
   - name
   - filePath 或 command
   - blocked
   - optional durationMs
   - optional addedLines / removedLines
5. capture 失败不能影响任务执行。

## Acceptance Tests

1. Worker 成功执行 edit src/foo.ts：
   - RawMemoryRecord.toolTimeline.length >= 1
   - toolTimeline[0].name === "edit"
   - toolTimeline[0].filePath === "src/foo.ts"
   - toolTimeline[0].blocked === false

2. Worker 被 gate 阻断 edit src/bar.ts：
   - toolTimeline 包含 name="edit"
   - filePath="src/bar.ts"
   - blocked=true

3. Bash 工具记录 command：
   - name="bash"
   - command="npm test"
   - blocked=false

4. 不保存完整 output，只保存摘要字段。

5. npx tsc --noEmit && npx vitest run 全绿。

## Implementation Constraints

- 不改 TUI
- 不改 provider
- 不改 gate 决策
- 不接 distiller
- 不改 auto mode
- 只改：
  - src/memory/types.ts
  - src/loop/agent-loop.ts
  - tests/scope-contract.test.ts 或新增 tests/memory-capture.test.ts

## Worker Directive

1. 在 runAgentLoop 顶层创建 toolTimeline 数组。
2. 把 toolTimeline 引用传入 ToolLoopGateData。
3. 在 runToolLoop 中：
   - tool_call parsed 后提取 filePath / command
   - gateCheck deny 时 push blocked=true
   - execute 成功后 push blocked=false
4. RawMemoryRecord 使用真实 toolTimeline。
5. 补测试覆盖 success / blocked / bash。