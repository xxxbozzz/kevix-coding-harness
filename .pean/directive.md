## Product Intent

构建一个在 CI 中 clone 源码 → DeepSeek 生成 fix → git diff → SWE-bench 评估的全自动 workflow。让 LLM 看到真实源码，从根本上解决 patch apply 失败问题。跑 5 instance × 2 arm（Generic vs Kevix Auto）paired comparison，拿到可比数据。

## Primary Claim

Kevix Auto 在同模型、同工具、同预算条件下，相比 Generic Agent：
- 更高 patch apply rate
- 相同或更高 resolved rate
- 更低 cost per resolved

## Task Decomposition

1. **写 CI workflow** —— clone repo → read source → DeepSeek generate fix → git diff → SWE-bench eval
2. **实现 Generic 和 Kevix Auto 两套 prompt** —— 在 CI 中分别调用
3. **跑 5 instance × 2 arm = 10 CI eval**
4. **出数据** —— pass@1, apply rate, tokens per arm

## Hidden Semantics

- GitHub Actions runner 上有 Git + Python，clone 速度远超本地
- DeepSeek API key 通过 CI secrets 传入
- 每个 job 独立，互不干扰
- SWE-bench evaluator 和 patch 生成在同一个 job 中

## Acceptance Tests

1. 1 个 instance 的 auto mode 能在 CI 中跑通全流程
2. patch apply rate > 之前的 5%
3. Generic vs Auto 有可比数据

## Implementation Constraints

- 使用 SWE-bench 官方 evaluator
- 不改已生成的 predictions 文件
- 使用 CI secrets 传 API key

## Red Flags

- 不要在本地跑（太慢）
- 不要跳过 Generic baseline
- 不要手动写 patch

## Coding Worker Directive

### Step 1: 写 CI workflow（gen_and_eval.yml）
- checkout kevix repo
- clone target repo
- call DeepSeek API with source code context
- apply fix, git diff
- run SWE-bench evaluator
- output results

### Step 2: 添加 DEEPSEEK_API_KEY 到 CI secrets

### Step 3: 测试 1 个 instance
