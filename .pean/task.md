# P58 Engine Memory Capture

## Product Intent

让 Kevix engine 在每次 runAgentLoop 完成后，自动把本次任务的真实执行过程写入 Memory Sandbox，形成 RawMemoryRecord。

这是 LLM Wiki 的原料入口。没有自动 capture，sandbox 只是空容器。

## Hidden Semantics

1. Memory capture 发生在任务结束后，不影响任务执行路径。
2. Capture 是 best-effort，失败不能导致 coding task 失败。
3. Capture 只写 raw memory，不做 distill，不生成 wiki skill。
4. Raw memory 必须包含足够材料，让未来 LLM research job 能研究：
   - task problem
   - mode
   - phases
   - scopeContract
   - tool timeline
   - gate events
   - review findings
   - files changed
   - scope expansion
   - outcome
   - patch summary
5. 不接 TUI。
6. 不改变 auto/memory/probe 行为。

## Acceptance Tests

1. runAgentLoop 提供 memoryStore 时，任务完成后写入一条 RawMemoryRecord。
2. record.expiresAt 自动为 createdAt + 3 days。
3. record 包含 taskId/problem/mode/phases。
4. record 包含 scopeContract、filesChanged、scopeExpansionRequests、expandedScope、scopeRespected。
5. record 包含 toolTimeline：Read/Edit/Bash 等工具事件。
6. record 包含 gateEvents。
7. record outcome.escalated 正确记录。
8. memoryStore 写入失败时，runAgentLoop 仍返回正常 summary，只 emit warn log。
9. 没传 memory