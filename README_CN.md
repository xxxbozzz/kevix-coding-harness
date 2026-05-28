# Kevix 插件 — Claude Code Hooks

[English](README.md) | [中文](README_CN.md)

> 也可用：[引擎](https://github.com/xxxbozzz/kevix-coding-harness) · [TUI](https://github.com/xxxbozzz/kevix-coding-harness/tree/tui)

Scope-first Claude Code 插件。在 CC 会话中注入 Kevix Harness 检查点。

---

## 功能

输入 coding task 时：

1. **Controller Hook**（提交前）— 提示 CC 先写 Scope Proposal
2. **Review Hook**（停止前）— 阻止 CC 停止，直到审查 diff 是否符合 scope

用户看到六点摘要。Worker 从 `.kevix/directive.md` 读取完整指令。

## 安装

```bash
claude plugin install kevix-hook@kevix-lab
```

或从此仓库安装：

```bash
claude plugin marketplace add kevix-lab https://github.com/xxxbozzz/kevix-coding-harness
claude plugin install kevix-hook@kevix-lab
```

## 许可证

MIT
