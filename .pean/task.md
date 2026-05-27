Scope Contract 变成 engine 一等公民
现在 scope 更多在 TUI/approval/gate 层拼出来。引擎应该正式接收：

editableScope: string[]
readOnlyEvidence: string[]
successChecks: string[]
然后所有工具调用都围绕这个 contract：

Edit/Write 只能改 editableScope
Read 优先读 readOnlyEvidence
Bash 默认只运行 successChecks
想改 scope 外文件时 emit scope_expansion_required
这是减少“这里改了那里错”的核心。