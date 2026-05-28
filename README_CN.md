# Kevix Harness

[English](README.md) | [中文](README_CN.md)

**以人为本的编程驾驭工具。不是黑盒 AI 编码器。**

Kevix 在 AI 执行之前把控制权交给人——确认任务边界、审核六点摘要、然后在人批准的范围内让引擎工作。

---

## 核心理念

> 人应该在 AI 动手之前，先确认**改什么**。

```
输入简短任务
  → Scope Proposal：改哪些文件、不碰哪些、怎么验证
  → 人确认（或修改）
  → 六点执行计划（摘要视图）
  → Worker 在人确认的边界内执行
  → Diff + 测试结果 + Scope 合规证据
```

---

## 架构（5 层）

| 层 | 职责 |
|----|------|
| L0 意图 | 用户想干什么？聊天？写代码？查数据？ |
| L1 边界合约 | `editableScope` / `readOnlyEvidence` / `successChecks` |
| L2 PEAN 指令 | 完整六段计划（LLM 缓存优化结构） |
| L3 运行时 Gate | 每次工具调用经过 6 层 Gate 链 |
| L4 记忆 + Wiki | 经验累积 → 蒸馏 → 路由 |

### L3 Gate 链

每次工具调用串行通过 6 个 Gate：`directive → red-flag → scope → bash-risk → verifier → probe-required`

Gate 是**代码级强制约束**，不是 prompt 建议。LLM 无法绕过。

### L4 记忆沙箱

```
任务完成 → RawMemoryRecord（3 天 TTL）→ Working Drafts（7 天 TTL）→ WikiSkill（永久）→ Auto Router
```

不是 RAG——蒸馏出的结构化经验（执行策略、常见失败模式、验证清单），不是原始上下文片段。

---

## 环境配置

**前置条件**: Node.js >= 20, npm >= 9, DeepSeek API key

```bash
git clone https://github.com/xxxbozzz/kevix-coding-harness.git
cd kevix-coding-harness
npm install && npm run build && npm test  # 242 个测试
```

**API Key**（绝对不能提交）:
```bash
export DEEPSEEK_API_KEY="sk-your-key-here"
```

---

## 快速开始

```bash
# CLI — 非交互模式
kevix --mode memory "修复 src/foo.ts 的 bug"
kevix --mode probe "重构认证模块"

# TUI — 交互式终端
node dist/cli/ink/entry.js
```

### TUI 交互流程

```
1. 输入 coding task → Enter
2. Scope Proposal 卡片：
   ┌ Scope Proposal ──────────────────────────┐
   │ 可修改范围:  src/summarizeOrder.js        │
   │ 只读证据:    test/summarizeOrder.test.js  │
   │ 验证命令:    npm test                      │
   │ [Enter] 确认  [E] 编辑  [Esc] 取消       │
   └───────────────────────────────────────────┘
3. 确认 → Controller 生成执行指令
4. 六点摘要卡片（①-⑥ 要点），[V] 展开全文
5. 执行 → Worker 运行，终端渲染 Diff + 测试结果
6. 结果卡片展示 Scope 合规证据
```

---

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
  onApprovalRequired: async (d) => { /* 展示给用户，返回 approve/reject */ },
  memoryStore: new SandboxStore(".kevix/memory.json"),
});

console.log(summary.scopeRespected, summary.filesChanged);
```

---

## 对比

| | Kevix | CC | Aider | Cline |
|---|---|---|---|---|
| Scope 强制 | Gate 级 | Prompt 级 | 无 | 无 |
| 人审批节点 | Scope+Directive | 实时询问 | 无 | 实时询问 |
| 经验记忆 | Wiki 蒸馏 | 无 | 无 | 无 |
| Gate 链 | 6 层 | 无 | 无 | 无 |

Kevix 不拼"更自主"，拼"更可审计"。

---

## 当前状态 (v0.1.0)

| 功能 | 状态 |
|------|------|
| PEAN 流程（Controller/Worker/Review） | ✅ |
| 6 层 Gate 链 | ✅ |
| Scope Contract + 扩展回调 | ✅ |
| 记忆沙箱（raw→working→wiki，TTL，purge） | ✅ |
| WikiSkill 蒸馏（LLM 驱动，DeepSeek 验证） | ✅ |
| Auto 模式 Wiki 路由 | ✅ |
| 会话压缩 | ✅ |
| 多策略编辑匹配（Aider 风格） | ✅ |
| 结构化错误层次（16 错误码） | ✅ |
| 原子写入 + 自动备份 | ✅ |
| 6 工具 + 全覆盖测试 | ✅ |
| TUI（Scope Proposal → DirectiveCard → diff） | ✅ |
| **242 个测试** | ✅ |

---

## 路线图

- [ ] 进程沙箱（Docker 级隔离）
- [ ] GUI（Electron/Tauri）
- [ ] VS Code 插件
- [ ] 按语言/框架调优 prompt
- [ ] 更深度的 Aider 风格编辑策略

## 参与贡献

欢迎在以下方向贡献：

- **进程沙箱**: Worker bash 命令的 Docker 级隔离
- **GUI / VS Code**: 基于 engine API 的桌面或 IDE 集成
- **Prompt 调优**: 针对特定语言改进 PEAN 提示词
- **Diff 成熟度**: 移植更多 Aider 风格编辑策略

完整架构文档见 `docs/architecture/kevix-harness-principles.md`。

## 许可证

MIT
