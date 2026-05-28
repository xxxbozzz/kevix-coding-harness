# Kevix Engine

[English](README.md) | [中文](README_CN.md)

> 也可用：[TUI（终端应用）](https://github.com/xxxbozzz/kevix-coding-harness/tree/tui) · [Claude Code 插件](https://github.com/xxxbozzz/kevix-coding-harness/tree/plugin)

**以人为本的编程驾驭引擎。不是黑盒 AI 编码器。**

---

## Kevix 是什么

Kevix 是一个编程驾驭工具（coding harness）——它把 LLM 包裹在一个结构化的工作流中，让人在 AI **执行之前**进入控制层。它不是自主 Agent，不替代 Claude Code 或 Aider。Kevix 竞争的是**可审计性和边界强制力**，不是自主性。

### 核心问题

大多数编程 Agent 的工作方式：

```
用户："修 bug"
Agent：读文件 → 改代码 → 跑测试 → 完成
用户："等等，为什么它也改了那个文件？"
```

Agent 自己决定碰什么。用户事后才知道。

### Kevix 的回答

```
用户："修 src/foo.ts 的 bug"
Kevix："我改 src/foo.ts，读 test/foo.test.js，用 npm test 验证。可以吗？"
用户："可以。"
Kevix：[生成计划，在确认的边界内执行，展示 diff + 结果]
```

人确认边界。引擎**强制**执行边界。这不是 prompt 建议——是代码级 Gate 链，阻止任何越界写入。

### 设计哲学

1. **"只修改什么"——正向边界，不是防御式排除。** 引擎问"我可以改哪些文件？"而不是"我应该避免哪些文件？"正向边界是紧的。防御式清单总有漏洞。

2. **找平均稳定方案，不找极端最优解。** 写代码不是训练模型。大多数任务需要最小正确修改和最少副作用。不要为证据里不存在的边界情况过度设计。

3. **大局观来自累积经验。** Memory Sandbox 记录每次任务结果。Wiki Distiller 把原始记录蒸馏成结构化技能。Auto Router 用这些技能决定 memory vs probe。每次任务都在前人基础上构建。

4. **人确认方向，AI 在边界内执行。** 两个检查点：Scope Proposal（确认边界）和 Directive Summary（确认计划）。之间引擎强制合约。

5. **经验变成工程能力。** 原始痕迹 → LLM 蒸馏模式 → WikiSkills → 未来任务获得经过验证的策略注入。这不是 RAG——是结构化的、可复利的知识。

---

## 架构（5 层）

```
L0  意图识别        →  用户想干什么？
L1  边界合约        →  editableScope / readOnlyEvidence / successChecks
L2  PEAN 指令       →  完整六段计划（LLM 缓存优化结构）
L3  运行时 Gate     →  每次工具调用经 6 层 Gate 链
L4  记忆沙箱 + Wiki →  原始痕迹 → 蒸馏技能 → 路由决策
```

### L3 — Gate 链（Kevix 独有）

每次 Worker 工具调用串行通过 6 个确定性 Gate：

```
directive → red-flag → scope → bash-risk → verifier → probe-required
```

| Gate | 拦截什么 |
|------|---------|
| `directive` | 无有效 PEAN 指令时的写/编辑/bash |
| `red-flag` | 明确标注为禁区的文件 |
| `scope` | 超出人确认的可修改范围的文件 |
| `bash-risk` | 危险命令（rm -rf、密钥、curl pipe） |
| `verifier` | 探针模式未完成验证时不允许结束 |
| `probe-required` | 线路级风险未被探测 |

Gate 是代码，不是 prompt。LLM 无法绕过 `scope-gate.ts`。

### L4 — 记忆沙箱 + Wiki

```
任务完成
  → RawMemoryRecord 记录（3 天 TTL，自动清理）
  → Working Drafts：LLM 分析模式、聚类、候选（7 天 TTL）
  → WikiSkill：验证过的可复用能力（永久，无 TTL）
  → Auto Router：新任务查询 Wiki 决定模式
```

沙箱可以脏。Wiki 必须干净。

---

## 当前进展 (v0.1.0)

**242 个测试。47 个源文件。29 个功能提交。**

| 功能 | 状态 |
|------|------|
| PEAN 流程（Controller → Worker → Review） | ✅ |
| 6 层确定性 Gate 链 | ✅ |
| Scope Contract + 扩展回调 | ✅ |
| 记忆沙箱（raw → working → wiki，TTL，purge） | ✅ |
| WikiSkill 蒸馏（LLM 驱动，DeepSeek 验证） | ✅ |
| Auto 模式 Wiki 路由 | ✅ |
| 会话压缩（防 context 溢出） | ✅ |
| 多策略编辑匹配（精确/去空白/缩进归一化） | ✅ |
| 结构化错误体系（16 错误码） | ✅ |
| 原子写入 + 自动备份 | ✅ |
| 6 工具全覆盖测试 | ✅ |
| 人 scope 推断 + 审批钩子 | ✅ |
| Wiki RAG 注入到 Controller hints | ✅ |

### 真实 API 验证

用 DeepSeek 在真实 bugfix 任务上端到端测试（summarizeOrder.js）：
- Scope Contract 强制（4/4 scope 合规）
- 多策略编辑正确应用
- 4/4 测试通过

---

## 对比

| | Kevix | Claude Code | Aider | Cline |
|---|---|---|---|---|
| Scope 强制 | Gate 级（代码） | Prompt 级 | 无 | 无 |
| 人审批节点 | Scope + Directive | 实时询问 | 无 | 实时询问 |
| 经验记忆 | Wiki 蒸馏 | 无 | 无 | 无 |
| Gate 链 | 6 层确定性的 | 无 | 无 | 无 |
| 多策略编辑 | 3 种策略 | LLM 驱动 | 模糊匹配 | LLM 驱动 |
| 会话压缩 | ✅ | ✅ | ❌ | 部分 |

Kevix 不拼自主性。拼**可审计性和边界强制力**。

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
  onApprovalRequired: async (d) => { /* 返回 "approve" | "reject" */ },
  onScopeProposed: async (s) => { /* 返回修改后的 scope 或 null */ },
  memoryStore: new SandboxStore(".kevix/memory.json"),
});

console.log(summary.scopeRespected);          // Worker 是否在边界内？
console.log(summary.filesChanged);            // 改了哪些文件？
console.log(summary.scopeExpansionRequests);  // 边界被突破几次？
```

---

## 路线图

### 近期 (v0.2)
- [ ] 进程沙箱（Worker bash 的 Docker 级隔离）
- [ ] PR 级 diff 生成
- [ ] LLM 驱动的对话摘要（替换当前的 trim-only 压缩）
- [ ] TUI → Engine scopeContract 接线完成（`tui` 分支进行中）

### 中期 (v0.3)
- [ ] GUI 桌面应用（Electron/Tauri）
- [ ] VS Code 插件
- [ ] 多模型 provider 支持（OpenAI、Anthropic）
- [ ] 更深度的 Aider 风格编辑策略

### 研究
- [ ] Wiki 中的多文件重构模式
- [ ] 跨项目技能迁移
- [ ] 自主蒸馏调度

---

## 安装

```bash
git clone https://github.com/xxxbozzz/kevix-coding-harness.git
cd kevix-coding-harness
npm install && npm run build && npm test  # 242 个测试

export DEEPSEEK_API_KEY="sk-your-key-here"
```

## 分支

| 分支 | 内容 |
|------|------|
| `main` | 引擎核心（当前） |
| [`tui`](https://github.com/xxxbozzz/kevix-coding-harness/tree/tui) | Ink 终端界面 |
| [`plugin`](https://github.com/xxxbozzz/kevix-coding-harness/tree/plugin) | Claude Code 插件 |

## 许可证

MIT
