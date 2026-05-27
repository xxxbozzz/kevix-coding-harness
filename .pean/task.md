# P57.1 Memory Sandbox Polish

## Product Intent

修正 P57 的两个产品语义缺口：
1. Memory 模块必须从 package root 导出；
2. SandboxStore.saveRecord 必须保证 expiresAt 默认等于 createdAt + 3 days。

## Acceptance Tests

1. `src/index.ts` 导出：
   - RawMemoryRecord
   - WikiSkill
   - SANDBOX_TTL_MS
   - computeExpiresAt
   - SandboxStore
   - createStubDistiller
   - Distiller / DistillInput / DistillOutput

2. saveRecord 默认 TTL：
   - 给 record 传入 createdAt 但不传 expiresAt，store 自动设置 expiresAt = createdAt + 3 days
   - 给 record 显式传入 expiresAt，store 保留显式值

3. purgeExpired 仍然只清理 raw records，不清理 wiki skills。

4. `npx tsc --noEmit && npx vitest run` 全绿。

## Implementation Constraints

- 不碰 agent-loop
- 不碰 auto mode
- 不碰 TUI
- 不接真实 LLM
- 不改 WikiSkill 核心 schema
- 只改：
  - src/memory/types.ts
  - src/memory/store.ts
  - src/index.ts
  - tests/memory-store.test.ts