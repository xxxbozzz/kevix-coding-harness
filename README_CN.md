# Kevix TUI

[English](README.md) | [中文](README_CN.md)

> 也可用：[引擎](https://github.com/xxxbozzz/kevix-coding-harness) · [插件](https://github.com/xxxbozzz/kevix-coding-harness/tree/plugin)

基于 Ink 的 Kevix Harness 交互式终端界面。Scope Proposal → 六点摘要 → 实时 diff。

---

## 交互流程

```
1. 输入 coding task
2. Scope Proposal 卡片（可修改范围 / 只读证据 / 验证命令）
3. 确认 → Controller 生成执行指令
4. 六点摘要（①-⑥），[V] 展开全文
5. 执行 → Worker 运行，终端渲染 diff
6. 结果卡片展示 Scope 合规证据
```

## 运行

```bash
cd kevix-coding-harness
npm install && npm run build
DEEPSEEK_API_KEY=sk-... node dist/cli/ink/entry.js
```

## 许可证

MIT
