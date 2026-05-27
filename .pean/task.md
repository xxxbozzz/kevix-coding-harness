对，这个顺序现在是正确的。

先底层，后 TUI。否则 TUI 做得再漂亮，engine 不能兑现“只修改什么”，用户体验还是假的。

底层现在的目标应该冻结为：

```text
Kevix Engine must enforce the human-approved task boundary.
```

也就是：

1. 用户/上层给 engine 一个 Scope Contract
2. engine 绝对执行这个 contract
3. Worker 不能靠 prompt 自觉
4. 越界不是继续猜，而是发出可恢复事件
5. 测试命令只能验证，不允许夹带副作用

我建议底层修正顺序：

**P56.1 Scope Contract Hardening**

必须先做。内容就是刚才发现的三个洞：

- `editableScope: []` = deny all writes
- scope 越界必须 emit `scope_expansion_required`
- `successChecks` 不能允许 `npm test && ...` 这种复合命令

验收：

```text
tsc pass
full tests pass
scope-contract tests 覆盖上述三点
```

**P56.2 Scope Expansion Runtime**

P56.1 只是 emit 事件。下一步要让 engine 支持上层决策：

```ts
onScopeExpansionRequired?: (request) => Promise<"approve" | "reject">
```

如果 approve：

```text
expand editableScope → retry or continue
```

如果 reject：

```text
Worker receives tool error: stay within editable scope
```

但这个可以 P56.2 做，别塞进 P56.1。

**P56.3 Scope Contract in Summary / Artifact**

任务结束后 summary 要记录：

```ts
scopeRespected: boolean
scopeExpansionRequests: [...]
filesChanged: [...]
```

否则 benchmark 和论文数据不知道 task 是否真的在边界内完成。

**P56.4 Auto/Wiki 路由再接 Scope**

之后 Auto/Wiki 才能用：

```text
历史上这个 scope/task memory fail → probe
```

但这要等 Scope Contract 稳了再做。

所以现在给 worker 的底层 directive 应该很短：

```md
只做 P56.1，不碰 TUI。

修 Scope Contract 的三个底层语义漏洞：
1. editableScope=[] deny all writes
2. scope deny emit scope_expansion_required
3. successChecks reject shell compound commands

不要做 Proposal UI。
不要做 TUI。
不要改 prompts。
不要改 benchmark。
```

我的判断：**P56.1 是现在唯一该做的事。**  
先把 engine 的边界执行修硬，再让 TUI 去调用它。