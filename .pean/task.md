P57: Kevix Memory Sandbox + Capability Wiki Schema

不要实现 graph routing。
不要让 auto 直接查 outcome。
先定义 memory sandbox 和 capability wiki 的结构化底座。

目标：
把 engine 运行过程中的原始证据保存为 MemoryRecord。
后续由 LLM Distiller 定期把多条 MemoryRecord 抽象成 CapabilityCard。

只做：
- MemoryRecord schema
- CapabilityCard schema
- MemoryStore save/load/query
- Distiller interface stub
- tests

不做：
- 不接真实 LLM
- 不改 auto mode 路由
- 不碰 TUI
- 不改 graph