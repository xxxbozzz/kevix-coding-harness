因为它们封住 Scope Contract 的底层闭环：

用户确认只修改什么
→ engine enforce
→ 越界可恢复
→ 结果证明 scope 是否被遵守
给 worker 的下一条 directive 就应该是：

只做 engine，不碰 TUI。

P56.2a + P56.3:
1. 补 agent-loop scope expansion integration test
2. TaskSummary 增加 scope artifact 字段
3. 记录 scopeExpansionRequests / expandedScope / scopeRespected / filesChanged
4. 全量测试通过
这样底层才算真正进入 Kevix Harness 的稳定区。