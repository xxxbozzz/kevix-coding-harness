## P56.2 Scope Expansion Runtime

只做 engine，不碰 TUI。

目标：
让 Scope Contract 越界从“硬失败”变成“可恢复的人类控制事件”。

当前已有：
- scope gate deny outside editableScope
- agent-loop emit scope_expansion_required

新增：
- runAgentLoop 支持 onScopeExpansionRequired callback

API:

onScopeExpansionRequired?: (request: {
  file: string;
  reason: string;
  editableScope: string[];
}) => Promise<"approve" | "reject">

行为：

1. Worker 尝试 Edit/Write scope 外文件
2. scope gate deny
3. engine emit scope_expansion_required
4. 如果 onScopeExpansionRequired 不存在：
   - 保持当前行为：tool_result error，Worker 自行修正
5. 如果 callback 返回 reject:
   - tool_result error: stay within editable scope
   - 不扩 scope
6. 如果 callback 返回 approve:
   - 将 file 加入 runtime editableScope
   - emit log: scope expanded
   - 后续同一文件 Edit/Write 允许
   - 不需要立即重试当前 tool call，下一轮 Worker 可继续

Acceptance Tests:
1. no callback → current deny behavior preserved
2. callback reject → scope not expanded
3. callback approve → subsequent write to same file allowed
4. scope_expansion_required emitted before callback
5. expanded scope appears in state/snapshot or summary if available
6. tsc + full vitest pass

Do not touch:
- TUI
- prompts
- provider
- benchmark scripts