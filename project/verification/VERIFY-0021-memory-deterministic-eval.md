---
id: VERIFY-0021
type: verification
status: ready
priority: P1
owner: coordinator
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0388]
related_issues: []
related_bugs: []
source: REQ-0027 M2 确定性验收（TASK-0388 合同）
created: 2026-10-23
updated: 2026-10-23
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 记忆确定性评测基座与 M2 批次结论（TASK-0388）

## 目的与范围

交付 REQ-0027 M2（自动混合版）的确定性评测基座：脱敏合成场景 × 检索对照 × 成本账本。
本基座**只跑确定性合同**——真实 Provider 未授权不跑、明确留空，不以 mock 成绩冒充模型质量结论，不据此扩大 automatic 默认启用。

评测基线：`main@b356465f0`（0382 集成后）。

## 评测工具

`scripts/evals/memory/run-deterministic.ts`（bun 执行）：

```bash
bun scripts/evals/memory/run-deterministic.ts [--scenario isolation|correction|short-query] [--report <path>]
```

- 合成场景：isolation（2 条目隔离检索）、correction（更正后检索）、short-query（1 字短词 + trigram）。
- 检索对照臂：none / summary（顺序截取）/ lexical（FTS5）/ semantic-deterministic（确定性字符重合替身，非语义）/ hybrid（RRF 融合）。
- 指标：命中率、p50/p95 延迟（冷热混合预热 2 轮 + 实测 10 轮）、成本账本（写入/后台/检索次数）。
- 确定性合同：同参数重跑结果完全一致（无随机）。

## 实测结果（2026-10-23，win32-x64）

### isolation（构建入口查询）

| 检索路 | 命中 | p50(ms) | p95(ms) |
|---|---|---|---|
| none | 0/1 | 0 | 0 |
| summary | 1/1 | 0 | 0 |
| lexical | 1/1 | 0.24 | 0.39 |
| semantic-deterministic | 1/1 | 0.01 | 0.03 |
| hybrid | 1/1 | 0.31 | 1.02 |

### short-query（1 字短词 + trigram 双查询）

| 检索路 | 命中 | p50(ms) | p95(ms) |
|---|---|---|---|
| none | 0/2 | 0 | 0 |
| summary | 2/2 | 0 | 0.01 |
| lexical | 1/2 | 0.53 | 0.96 |
| semantic-deterministic | 2/2 | 0.01 | 0.05 |
| hybrid | 2/2 | 0.8 | 1.62 |

### 观察

- 短词场景 lexical 1/2（"记"字 instr 回退命中"记忆"行但"trigram 检索"需 ≥3 字 FTS 命中）：这是**预期行为**——1 字走 instr、trigram 需 ≥3 Unicode 字，两路合同各自正确，混合路补齐。
- hybrid p50 高于单路（~0.3-0.8ms）：两路串行执行的自然开销，在 S2 规模可忽略。
- summary 臂的"全命中"是因为合成场景条目少且查询与条目直接重叠——真实数据下会退化；这正是需要真实模型质量评测的原因。

## 连续用户流程合同（packages/coding-agent test）

`packages/coding-agent/test/memory/memory-user-flow.test.ts` 3 例：
1. 记住→重启→找回（当前值+历史+来源）→纠正保留历史→user/project scope 隔离→忘记→重启不复活（含写入拒绝）。
2. 词法检索：短词降级标注 + scope 过滤 + 注入有界（同库真实 FTS）。
3. 失败工具旁路：遗忘后写入失败如实报错，不伪装成功。

## 未执行项与边界

- **真实 Provider / 真实 embedding 模型评测：未运行（未授权）**。质量结论为"未验证"——`semantic-deterministic` 臂是字符重合度替身，不是语义检索质量证据。不据此扩大 automatic 默认启用。
- 连续任务净收益对照（成功率/重复失败/召回/尾延迟/费用）：需真实模型与预算授权后按 REQ-0027 验收标准独立执行。
- 多进程并发、大数据量（1k/10k 条）：合成场景规模小，冷热延迟不代表真实负载。

## 结论

确定性评测基座就绪：场景可复算、指标可对账、成本有账本、真实质量明确区分"未验证"。
M2 批次工程合同全部就位；后续模型质量门禁等授权后在本基座上跑。
