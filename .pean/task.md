# P57 Rolling Memory Sandbox + Autonomous Skill Distillation

## Product Intent

建立 Kevix 的短期研究记忆系统：
engine 将最近 3 天的 coding task 经验写入 Memory Sandbox；
sandbox 只保留短期强相关 raw memory；
定期由 LLM 自主研究、关联、组合、发散；
若能抽象出结构化 skill，则写入 LLM Wiki；
三天后无论是否产出 skill，raw memory 都清理。

## Hidden Semantics

1. Sandbox 不是永久记忆，而是 3 天滚动研究窗口。
2. Sandbox 内数据默认强相关，因为它来自近期同一用户/项目的 coding 工作。
3. 不需要人工审批 skill candidate。
4. 没有 candidate queue 作为长期状态。
5. LLM research job 要么产出 WikiSkill，要么什么都不产出。
6. WikiSkill 是唯一长期保存的产物。
7. Raw memory 到期必须清理，防止噪声污染。
8. 初版不接真实 LLM，只做 schema/store/lifecycle/TTL/promotion 接口。

## Data Flow

Raw task memory
  → sandbox (TTL 3 days)
  → periodic distill()
  → WikiSkill[]
  → save to wiki
  → purgeExpired()

## Acceptance Tests

1. MemoryRecord 写入 sandbox 后可查询。
2. MemoryRecord 默认 expiresAt = createdAt + 3 days。
3. purgeExpired(now) 删除超过 3 天的 raw memories。
4. purgeExpired 不删除 WikiSkill。
5. distillSandboxToWiki 接口接受最近 3 天 records，返回 WikiSkill[]。
6. distill 返回空数组时，records 到期仍会被清理。
7. distill 返回 skill 时，skill 持久写入 wiki。
8. save/load 后 sandbox records 和 wiki skills 一致。
9. 不改 agent-loop，不改 auto mode，不碰 TUI。

## Implementation Constraints

- 只新增 engine memory 模块
- 不接真实 LLM
- 不引入外部依赖
- 不做人工 approval
- 不做 permanent raw memory
- TTL 默认 3 days，可配置

## Suggested Files

- src/memory/types.ts
- src/memory/store.ts
- src/memory/distiller.ts
- tests/memory-sandbox.test.ts
- src/index.ts export

## Core Types

RawMemoryRecord:
- id
- taskId
- projectId
- createdAt
- expiresAt
- problem
- mode
- scopeContract
- phases
- toolTimeline
- gateEvents
- reviewFindings
- outcome
- patchSummary
- tags

WikiSkill:
- id
- title
- problemClass
- triggers
- recommendedMode
- requiredEvidence
- editableScopeHints
- readOnlyEvidenceHints
- successCheckHints
- playbook
- commonFailureModes
- verificationChecklist
- sourceMemoryIds
- createdAt
- updatedAt