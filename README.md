# Kevix Coding Harness

> L0 technical note: 99.84%+ cache hit rate in a long-running coding-agent workflow.

This repository publishes:

1. the L0 cache-hit technical note for Kevix Coding Harness
2. the first installable Kevix Hook plugin for Claude Code
3. the Kevix engine — a DeepSeek-native coding agent with structured harness methodology

The private engine implementation, prompts, task logs, API keys, provider configuration, and unreleased harness internals are not published.

## Published Documents

- [L0 Cache Hit Technical Note](docs/l0-cache-hit-technical-note.md)
- [When Kevix Hook Helps](docs/when-kevix-hook-helps.md)

---

## Quick Links

- [Kevix Hook (CC Plugin)](#kevix-hook-for-claude-code)
- [Kevix Engine (Standalone CLI)](#kevix-engine)
- [中文文档](#kevix-engine-中文)

---

## Kevix Hook for Claude Code

Install the Kevix Hook plugin to add the Kevix harness structured workflow to Claude Code.

```bash
claude plugin marketplace add . --scope user
```

Then inside Claude Code:

```text
/plugin install kevix-hook@kevix-lab
```

For local development:

```bash
claude --plugin-dir ./plugins/kevix-hook
```

The plugin registers two hooks:

| Hook | Event | Purpose |
|---|---|---|
| Controller Hook | `UserPromptSubmit` | Detects coding tasks and injects a directive-first workflow. |
| Review Hook | `Stop` | Blocks stopping until the current git diff has a passing Kevix review log. |

### Plugin Files

- [plugins/kevix-hook](plugins/kevix-hook)
- [hooks/hooks.json](plugins/kevix-hook/hooks/hooks.json)
- [kevix_controller_hook.py](plugins/kevix-hook/scripts/kevix_controller_hook.py)
- [kevix_review_hook.py](plugins/kevix-hook/scripts/kevix_review_hook.py)

---

## L0 Claim

In a production-like coding-agent workflow using DeepSeek API, Kevix observed a cache hit rate above **99.84%**.

The clearest captured run shows **99.88% input cache hit rate**:

```text
Date:                 2026-05-22
Total tokens:          134,617,888
Cached input tokens:   134,321,792
Uncached input tokens:     165,018
Output tokens:             131,078

Input cache hit rate:
134,321,792 / (134,321,792 + 165,018) = 99.8773%
```

The L0 result is not a claim that Kevix is already a complete coding harness. It is a narrow technical result:

> A long-running coding-agent workflow can be structured so that provider-side prefix caching remains highly effective under real usage.

### Why L0 Matters

Long coding tasks are expensive because agents repeatedly send large context, tool definitions, instructions, and working memory back to the model.

If a harness destroys prefix stability, every call becomes expensive. If the workflow preserves stable prefixes, large parts of the prompt can be cached by the provider.

### Scope

Current public scope: concept, data point, comparison table, workflow diagram, interpretation and limitations, installable Claude Code hook plugin.

Out of scope: private engine source code, private engine internals, full benchmark claims, private methodology details, provider keys or private logs.

---

## Kevix Engine

**DeepSeek-native coding agent harness. Proven 95%+ cache hit rate on structured coding tasks.**

[English](#kevix-engine) | [中文](#kevix-engine-中文)

### What is Kevix Engine?

Kevix Engine is a standalone DeepSeek-native coding agent CLI. Unlike generic coding agents that use a single "think → act" loop, it uses a **three-role methodology**: Controller writes a directive → Worker implements → Review verifies. This structure keeps LLM prompts stable, enabling DeepSeek's prefix-cache to achieve high cache hit rates.

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

| Metric | Without kevix | With kevix |
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

**Three execution modes:** `memory` (2 calls, max cache) | `probe` (4-5 calls, full verification) | `auto` (smart routing)

**Six code-level gates** (fail-closed): Directive Gate, Red Flag Gate, Scope Gate, Bash Risk Gate, Verifier Gate, Probe Required Gate.

### Quick Start

```bash
# Download the latest release
curl -LO https://github.com/xxxbozzz/kevix-coding-harness/releases/download/v0.1.0/kevix-engine-0.1.0.tgz

# Install globally
npm install -g ./kevix-engine-0.1.0.tgz

# Install tsx (required dependency)
npm install -g tsx

# Set your DeepSeek API key
export DEEPSEEK_API_KEY=sk-xxx

# Run a task
kevix "fix null check in src/login.ts"

# Or launch interactive mode
kevix
```

### Commands: `/code /chat /memory /probe /auto /status /graph /history /again /help`

### Architecture

```
kevix/engine/
├── src/
│   ├── loop/agent-loop.ts    # Controller→Worker→Review state machine
│   ├── gates/                # 6 code-level gates
│   ├── pean/                 # Prompt templates (kevix harness methodology)
│   ├── provider/             # DeepSeek-native API (zero Anthropic deps)
│   ├── graph/                # Persistent review graph
│   ├── cli/ink/              # Ink-based TUI
│   └── tools/                # Bash, Read, Write, Edit, Grep, Glob
└── tests/                    # 79 unit tests
```

---

## Kevix Engine 中文

### 是什么

Kevix Engine 是一个 DeepSeek 原生的独立编码 agent CLI。使用**三角色方法论**：Controller 撰写指令 → Worker 执行实现 → Review 验证审查。

### 关键数据

**实测（12 SWE-bench 实例 × 3 模式，36 次运行）：**

| 指标 | 数据 |
|---|---|
| 任务完成率 | **36/36** |
| Worker 阶段缓存命中率 | **90-99%** |
| memory 模式平均调用 | **2.0** |
| probe 模式平均调用 | **3.6** |

**生产环境（CC + kevix hook，长会话）：**

| | 无 kevix | kevix |
|---|---|---|
| 缓存命中率 | 5-15% | **99.8%（实测）** |
| 3B Token 成本 | ~$840 | **~$121** |
| 节省 | — | **~85%** |

### 快速开始

```bash
# 下载最新版本
curl -LO https://github.com/xxxbozzz/kevix-coding-harness/releases/download/v0.1.0/kevix-engine-0.1.0.tgz

# 全局安装
npm install -g ./kevix-engine-0.1.0.tgz

# 安装 tsx（必需依赖）
npm install -g tsx

# 设置 DeepSeek API Key
export DEEPSEEK_API_KEY=sk-xxx

# 运行任务
kevix "修复 src/login.ts 的空值检查"

# 或启动交互模式
kevix
```

---

## License

MIT
