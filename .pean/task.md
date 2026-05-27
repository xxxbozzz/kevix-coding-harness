这是我的定义对于这个记忆结构它更像一个给 LLM 使用的“记忆工作间”：

Memory Sandbox
= LLM 可以翻看、比较、归纳、重写、压缩、提炼的经验空间
它的核心不是“存”，而是“允许 LLM 在里面加工记忆”。

更准确地说：

运行记录 raw traces
  ↓
进入 Memory Sandbox
  ↓
LLM 在 sandbox 里做整理：
  - 发现重复模式
  - 对比成功/失败路径
  - 提炼常见 bug 形态
  - 总结哪些任务 memory 足够
  - 总结哪些任务必须 probe
  - 形成可复用处理策略
  ↓
产出 Capability Wiki
  ↓
以后遇到相似任务，Controller 不是从零思考，而是调用已有能力
所以三者区别是：

层    作用    特点
Graph    结构化证据库    客观记录事件
Memory Sandbox    LLM 记忆加工区    可重写、可归纳、可压缩、可试探
Capability Wiki    稳定能力层    被未来任务调用
你这个想法的关键价值是：让 LLM 的经验不是靠上下文窗口临时存在，而是进入一个可持续被整理的工作空间。

它和普通 RAG 不一样：

RAG: 找相似文本 → 塞给模型
Kevix Memory Sandbox: 让 LLM 定期处理经验 → 形成结构化能力 → 再调用能力
也和普通 agent memory 不一样：

普通 memory: "上次做过什么"
Kevix sandbox: "上次为什么失败、后来怎么成功、能抽象成什么能力"
所以底层应该这样设计：

Memory Sandbox
├── raw/
│   ├── task trace
│   ├── tool timeline
│   ├── gate events
│   ├── patch attempts
│   ├── review findings
│   └── test output
│
├── working/
│   ├── LLM draft summaries
│   ├── cluster hypotheses
│   ├── failed abstractions
│   └── candidate capability cards
│
└── wiki/
    ├── accepted capability cards
    ├── routing rules
    ├── verification checklists
    └── known failure modes
最重要的一点：sandbox 允许脏，wiki 必须干净。

Sandbox 里可以有失败总结、错误假设、半成品归纳；Wiki 里只能放经过验证、可复用、可调用的能力。

这就非常符合 Kevix 的哲学：

不让每个 coding task 从零开始
不把所有经验都硬塞进 prompt
不靠黑盒自动化替用户做决定
把经验变成可以审计、可以升级、可以复用的工程能力