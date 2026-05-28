# Kevix Engine

[English](README.md) | [中文](README_CN.md)

> 也可用：[TUI（终端应用）](https://github.com/xxxbozzz/kevix-coding-harness/tree/tui) · [Claude Code 插件](https://github.com/xxxbozzz/kevix-coding-harness/tree/plugin)

**以人为本的编程驾驭引擎。不是黑盒 AI 编码器。**

引擎强制要求人在 AI 动手之前确认**改什么**——通过 Scope Contract、Gate 链和可审计记忆。

```ts
import { runAgentLoop, DeepSeekProvider, SandboxStore } from "@kevix/engine";
```

---

## 分支

| 分支 | 内容 | 状态 |
|------|------|------|
| `main` | 引擎核心（当前） | 242 测试 ✅ |
| [`tui`](https://github.com/xxxbozzz/kevix-coding-harness/tree/tui) | Ink 终端界面 | 交互式 |
| [`plugin`](https://github.com/xxxbozzz/kevix-coding-harness/tree/plugin) | Claude Code 插件 | Scope-first |

---

## 核心理念

大多数编程 Agent 是连续推理循环。Kevix 插入结构化的人类检查点：

```
任务 → Scope 提案 → 人确认 → 六点摘要 → Worker 在边界内执行 → 证据记录
```

引擎不猜测。Gate 是代码级约束，不是 prompt 建议。

## 架构（5 层）

| 层 | 职责 | 模块 |
|----|------|------|
| L0 意图 | 用户想干什么？ | `scope-inference.ts` |
| L1 边界合约 | editableScope / readOnlyEvidence / successChecks | `types.ts` → gate 链 |
| L2 PEAN 指令 | 完整六段计划（LLM 缓存优化） | `prompts.ts`, `agent-loop.ts` |
| L3 运行时 Gate | 每次工具调用经 6 层 Gate 链 | `gates/` |
| L4 记忆 + Wiki | 经验累积 → 蒸馏 → 路由 | `memory/` |

### L3 — Gate 链

```
directive → red-flag → scope → bash-risk → verifier → probe-required
```

Gate 是确定性的——相同输入总是相同输出。LLM 无法绕过。

### L4 — 记忆沙箱 + Wiki

```
任务 → RawMemoryRecord（3 天 TTL）→ Working Drafts（7 天 TTL）→ WikiSkill（永久）→ Router
```

不是 RAG——蒸馏出的结构化经验，不是原始上下文片段。

## 编程 API

```ts
import { runAgentLoop, DeepSeekProvider, SandboxStore } from "@kevix/engine";

const summary = await runAgentLoop({
  provider: new DeepSeekProvider(apiKey, { model: "deepseek-chat" }),
  tools: { definitions: [...], execute: async (call) => { ... } },
  mode: "memory",
  problem: "修复 src/foo.ts 的空引用",
  scopeContract: {
    editableScope: ["src/foo.ts"],
    readOnlyEvidence: ["test/foo.test.ts"],
    successChecks: ["npm test"],
  },
  onApprovalRequired: async (d) => { /* 返回 "approve" | "reject" */ },
  memoryStore: new SandboxStore(".kevix/memory.json"),
});
```

## 安装

```bash
git clone https://github.com/xxxbozzz/kevix-coding-harness.git
cd kevix-coding-harness
npm install && npm run build && npm test  # 242 个测试
export DEEPSEEK_API_KEY="sk-your-key-here"
```

## 许可证

MIT
