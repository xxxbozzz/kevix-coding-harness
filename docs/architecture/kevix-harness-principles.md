# Kevix Harness Architecture Freeze

## Kevix 是什么

Kevix 是 human-first coding harness。不是自动黑盒 coding agent。

**目标**：让人用更低认知负担，控制 AI 在明确任务边界内完成最小正确修改。

**方法**：先确定任务边界，再生成执行计划，再运行代码级约束，再用历史经验决定是否升级验证。

## Kevix 不是什么

- 不是自动黑盒 auto-coder
- 不是 TUI 产品（TUI 是壳，引擎是核）
- 不是 per-task 优化器（找平均稳定方案，不找极端解）
- 不是 Codex/CC 的替代品（架构哲学不同：显式断点 vs 连续推理流）

## 五层架构

### L0 — 用户意图层

用户输入通常很短。Kevix 判断：
- 用户想问问题，还是要改代码？
- 如果要改代码，目标是什么？
- 只允许修改什么？
- 需要读取哪些证据？
- 用什么验证？

输出：**Scope Proposal**（不是 directive）

### L1 — 任务边界层

核心不是"不要碰什么"，而是：

```
Editable Scope    — 只允许改哪些文件
Read-only Evidence — 哪些文件只读，用于验证
Success Check     — 什么命令证明修改正确
```

这层必须由用户确认或修改。

### L2 — PEAN 执行计划层

用户确认边界后，Controller 生成完整 PEAN directive（六段格式）。这是内部执行文档。

**用户的审批面不是六段全文，而是六个点的摘要：**

| 段落 | 用户看到 | 全文用途 |
|---|---|---|
| Product Intent | 一句话目标 | LLM cache 前缀 |
| Hidden Semantics | 关键边界条件 | Worker 上下文 |
| Acceptance Tests | 验证方式 | Review 基准 |
| Implementation Constraints | 技术约束 | Worker 护栏 |
| Red Flags | 不可触碰项 | Gate 匹配 |
| Worker Directive | 执行步骤 | Worker 指令 |

六段全文是给 LLM 的前缀稳定结构 → 驱动 cache hit。六个点的摘要是给人的决策参考 → 减少认知负担。

### L3 — Runtime Harness 层

Worker 执行时的代码级约束，不靠 prompt 自觉：

- **scope gate** — Edit/Write 只能作用于 Editable Scope
- **bash gate** — 命令安全检查（critical/high/medium/secret）
- **red flag gate** — 路径匹配拦截
- **review gate** — 执行后审计
- **tool timeline** — 工具调用可追溯
- **state snapshot** — 阶段完成后拍快照

如果 Worker 要越过 Editable Scope → 暂停，让用户扩大边界。

### L4 — Auto / Wiki / Probe 层

Auto 模式不是 LLM 临场感觉。是 Wiki 驱动的路由：

```
任务进来 → 查 pattern wiki
  → wiki 中有相似 pattern 且 memory 能解决 → A: memory（便宜快速）
  → wiki 中无匹配，或 memory 不足以解决 → B: probe（更稳更全面）
  → probe 也不确定，或历史高风险 → C: 暂停交用户
```

Wiki 积累维度：
- 哪些 file/error pattern 在 memory 就能修
- 哪些需要 probe 多阶段验证
- 哪些历史上必须人工介入
- gate 触发频率、review 失败模式

## 用户交互主路径

```
用户输入简短 task
  → L0: 判断意图（chat / coding / command / data）
  → L1: Scope Proposal（Editable Scope / Evidence / Success Check）
  → 用户确认
  → L2: Controller 生成 PEAN directive（六段全文 → LLM；六点摘要 → 用户）
  → 用户确认执行
  → L3: Worker 在 Harness 约束下执行
  → L4: 结果写入 Wiki，更新 pattern
```

## 不允许再做的方向

1. **不再靠 validator 猜 prose** — 实体验证应该是结构性判断，不是词表补洞
2. **不再把六段 directive 全文当第一审批面** — 用户看六点摘要，全文是给 LLM 的
3. **不再把 benchmark engine 和 TUI 需求混在一起** — engine 在 `/kevix/engine`，TUI sandbox 在 `/kevix-tui-p55-worktree`
4. **不再为了修一个体验 bug 随便改 engine core** — TUI 层和引擎层分离
5. **不再做 per-case 的 validator 调优** — 找 pattern，不补 case

## 模块边界

| 层 | 代码位置 | 修改权限 |
|---|---|---|
| L0/L1 (Scope Proposal) | `src/cli/ink/intent-router.ts` | TUI sandbox |
| L1 (ProposalCard) | `src/cli/ink/ProposalCard.tsx` | TUI sandbox |
| L2 (PEAN prompts) | `src/pean/prompts.ts` | engine |
| L2 (Controller) | `src/loop/agent-loop.ts` | engine |
| L3 (Gates) | `src/gates/*` | engine |
| L3 (Tools) | `src/tools/*` | engine |
| L4 (Graph/Wiki) | `src/graph/*` | engine |
| L4 (Auto router) | `src/pean/mode-router.ts` | engine |
| TUI shell | `src/cli/ink/*` | TUI sandbox |
| Benchmark | `scripts/*`, `results/*` | engine |

## 修订记录

- 2026-05-27: P0 Architecture Freeze — 五层架构，六点摘要原则，模块边界锁定
