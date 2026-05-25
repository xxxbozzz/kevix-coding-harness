# kevix-coding-harness

**DeepSeek-native coding agent with structured harness methodology. Proven 95%+ cache hit rate and 3-5x cost reduction on long coding tasks.**

[English](#english) | [中文](#中文)

---

## English

### What is kevix?

kevix is a DeepSeek-native coding agent harness. Unlike generic coding agents that use a single "think → act" loop, kevix uses a **structured three-role methodology**: Controller writes a directive → Worker implements → Review verifies. This structure keeps LLM prompts stable across long sessions, enabling DeepSeek's prefix-cache to achieve 95-99% cache hit rates.

### Key Numbers

**Measured on 12 SWE-bench instances × 3 modes (36 runs, DeepSeek V4):**

| Metric | Value |
|---|---|
| Tasks completed | **36/36** |
| Stable-prompt cache hit (worker phase) | **90-99%** |
| Avg calls per task (memory mode) | **2.0** |
| Avg calls per task (probe mode) | **3.6** |
| Gate events triggered | **real gate enforcement on every run** |
| Build pass rate | **100%** |

**Production (CC + kevix hook, long session, DeepSeek V4):**

| Metric | Without kevix structure | With kevix harness |
|---|---|---|
| Cache hit (long session) | 5-15% | **99.8% (measured)** |
| Token cost (3B tokens) | ~$840 | **~$121** |
| Savings | — | **~85%** |

### How It Works

```
User task
  → Controller: analyzes task, writes structured directive
  → Worker: implements fix following directive (with tool calling)
  → Review: verifies patch against directive
  → Result card with diff, cache metrics, test status
```

**Three execution modes:**

| Mode | Calls | Use case |
|---|---|---|
| `memory` | 2 | Pure logic changes, max cache |
| `probe` | 4-5 | Wire-level verification (API, serialization, encoding) |
| `auto` | 2-5 | Smart routing — auto-detects risk level |

**Six code-level gates** (fail-closed, not prompt-based):

| Gate | What it blocks |
|---|---|
| Directive | No directive → no writes |
| Red Flag | Writing to forbidden files |
| Scope | Writing outside project |
| Bash Risk | `rm -rf`, `curl | bash`, secret access |
| Verifier | Probe incomplete |
| Probe Required | Wire risk → must verify |

### Quick Start

```bash
# Install
npm install -g kevix-engine-0.1.0.tgz

# Set API key
export DEEPSEEK_API_KEY=sk-xxx

# Run a task
kevix "fix null check in src/login.ts"

# Interactive mode
kevix
```

### Commands

```
/code       PEAN coding pipeline
/chat       Quick Q&A
/memory     Fast mode (2 calls, max cache)
/probe      Safe mode (4-5 calls, full verification)
/auto       Smart mode (default)
/status     Show state
/graph      Review graph
/history    Task history
/again      Re-run last task
/help       All commands
```

### Architecture

```
kevix/engine/
├── src/
│   ├── loop/agent-loop.ts    # PEAN state machine (Controller→Worker→Review)
│   ├── gates/                # 6 code-level gates
│   ├── pean/                 # Prompt templates (from swe_runner.py)
│   ├── provider/             # DeepSeek-native API (zero Anthropic deps)
│   ├── graph/                # Persistent review graph
│   ├── cli/ink/              # Ink-based TUI
│   └── tools/                # Bash, Read, Write, Edit, Grep, Glob
└── tests/                    # 79 unit tests
```

---

## 中文

### kevix 是什么

kevix 是一个 DeepSeek 原生的编码 agent harness。与使用单一 "思考 → 行动" 循环的通用 agent 不同，kevix 使用**结构化三角色方法论**：Controller 撰写指令 → Worker 执行实现 → Review 验证审查。这种结构使 LLM 提示词在长会话中保持稳定，让 DeepSeek 的前缀缓存（prefix-cache）达到 95-99% 的命中率。

### 关键数据

**实测数据（12 个 SWE-bench 实例 × 3 种模式，36 次运行，DeepSeek V4）：**

| 指标 | 数据 |
|---|---|
| 任务完成率 | **36/36** |
| 稳定提示词缓存命中率（Worker 阶段） | **90-99%** |
| 每任务平均调用（memory 模式） | **2.0** |
| 每任务平均调用（probe 模式） | **3.6** |
| Gate 事件触发 | **每次运行均有真实 Gate 约束** |
| 构建通过率 | **100%** |

**生产环境（CC + kevix hook，长会话，DeepSeek V4）：**

| | 无 kevix 结构 | 有 kevix harness |
|---|---|---|
| 缓存命中率（长会话） | 5-15% | **99.8%（实测）** |
| Token 成本（3B Token） | ~$840 | **~$121** |
| 节省 | — | **~85%** |

### 工作原理

```
用户任务
  → Controller: 分析任务，撰写结构化 directive
  → Worker: 按 directive 实现修复（使用工具调用）
  → Review: 对照 directive 审查 patch
  → Result 卡片：diff、缓存指标、测试状态
```

**三种执行模式：**

| 模式 | API 调用次数 | 适用场景 |
|---|---|---|
| `memory` | 2 | 纯逻辑修改，最大化缓存 |
| `probe` | 4-5 | 线级验证（API、序列化、编码） |
| `auto` | 2-5 | 智能路由——自动检测风险级别 |

**六个代码级 Gate**（fail-closed，非 prompt 约束）：

| Gate | 阻止的操作 |
|---|---|
| Directive | 无 directive → 禁止写入 |
| Red Flag | 写入禁止修改的文件 |
| Scope | 写入项目范围外的路径 |
| Bash Risk | `rm -rf`、`curl \| bash`、密钥访问 |
| Verifier | 探针验证未完成 |
| Probe Required | 线级风险 → 必须验证 |

### 快速开始

```bash
# 安装
npm install -g kevix-engine-0.1.0.tgz

# 设置 API Key
export DEEPSEEK_API_KEY=sk-xxx

# 运行任务
kevix "修复 src/login.ts 的空值检查"

# 交互模式
kevix
```

### 命令

```
/code       PEAN 编码流水线
/chat       快速问答
/memory     快速模式（2 次调用，缓存最优）
/probe      安全模式（4-5 次调用，全量验证）
/auto       智能模式（默认）
/status     查看状态
/graph      审查图谱
/history    任务历史
/again      重新执行上次任务
/help       所有命令
```

### 架构

```
kevix/engine/
├── src/
│   ├── loop/agent-loop.ts    # PEAN 状态机（Controller→Worker→Review）
│   ├── gates/                # 6 个代码级 Gate
│   ├── pean/                 # Prompt 模板（来自 swe_runner.py）
│   ├── provider/             # DeepSeek 原生 API（零 Anthropic 依赖）
│   ├── graph/                # 持久化审查图谱
│   ├── cli/ink/              # 基于 Ink 的终端界面
│   └── tools/                # Bash、Read、Write、Edit、Grep、Glob
└── tests/                    # 79 个单元测试
```

---

## License

MIT
