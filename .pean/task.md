1. 会话压缩 → 做。 不是设计选择，是没做完。

2. 全程 streaming → 效果有限。 CC 的 streaming 是因为用户盯着对话流看每一步推理。Kevix 的用户交互断点在 Scope Proposal 和六点摘要——中间 Worker 执行时人不该盯着看。streaming 增加的是"观赏性"，不是控制力。真正该 stream 的是工具轨迹（tool_start/tool_result）——这个引擎已经有事件了，TUI 接线就行。

3. Wiki 像 RAG → 核心问题。 你说到了引擎现最大的设计缺陷：

当前 Wiki 只做路由：

任务进来 → routeAutoMode → "probe" → 切模式
                                   → "memory" → 直接跑

但它应该先注经验再决策：

任务进来 → queryWikiSkills(problem)
  → 匹配到 skill "null-check::TypeError"
  → 注入 Controller hints:
    "Similar tasks (4 records, 100% success):
     Playbook: Add null guard before property access
     Required evidence: test file
     Common failures: scope violation"
  → Controller 基于经验生成更好的 directive
  → Worker 拿更好的 directive 执行

这事 Kevix wiki 结构已经全支持了——WikiSkill 有 playbook、requiredEvidence、commonFailureModes、verificationChecklist。只是 routeAutoMode 没用它们，只取了 recommendedMode。

RAG 和 wiki 的区别是你之前说的——RAG 是"塞相似文本"，wiki 是"塞结构化经验"。但两者不冲突：wiki skill 就是最好的 RAG 素材，因为它已经是蒸馏过的、结构化的、可审计的经验。

优先级：会话压缩 > Wiki RAG 注入 > streaming。会话压缩是功能缺口（跑长任务会崩），Wiki RAG 是效果提升（让每次任务都不从零开始），streaming 是体验优化（好看但不是必须）。
  这个方案看起来可行 用户体验也是产品很重要的一环