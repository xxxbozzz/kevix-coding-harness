# P58.1b Bash Timeline Test

## Product Intent

补齐 P58.1 的 bash command timeline 验收。toolTimeline 是 LLM sandbox 的过程记忆，必须能看到任务用了什么验证命令。

## Acceptance Tests

1. Worker 调用 bash:
   command = "npm test"
2. RawMemoryRecord.toolTimeline 包含：
   - name === "bash"
   - command === "npm test"
   - blocked === false
3. 不保存完整 bash output。
4. npx tsc --noEmit && npx vitest run 全绿。

## Constraints

- 只加测试，除非发现实现 bug
- 不碰 TUI
- 不改 memory schema
- 不改 gate 逻辑