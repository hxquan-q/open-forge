---
id: RESEARCH-0009
type: research
status: done
priority: P2
owner: coding-agent
source: "user-request; https://github.com/confident-ai/deepeval; https://github.com/promptfoo/promptfoo; https://github.com/maseval/MASEval; RESEARCH-0006; VERIFY-0006"
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_issue: []
related_verification: [VERIFY-0006, VERIFY-0007]
---
<!-- Copyright The Open Forge contributors. -->

# 用 DeepEval、Promptfoo、MASEval 评估 Desktop Agent

## 问题与范围

用户要求同时使用 [DeepEval](https://github.com/confident-ai/deepeval)、[Promptfoo](https://github.com/promptfoo/promptfoo) 和 [MASEval](https://github.com/maseval/MASEval) 评估正在开发的 Agent Desktop 项目。

约束继承 [`RESEARCH-0006`](RESEARCH-0006-deepeval-agent-quality.md)：这是开发期旁路，不是产品功能；不进 Desktop/CLI/Plugin/Agent Loop；不进默认 `check` / husky / CI；密钥只走环境变量。

本笔记回答三个框架各自评什么、如何共用同一被测对象，以及为什么 MASEval 必须停在 `scripts/eval/`。

## 事实来源

| 来源 | 用到的事实 |
|---|---|
| DeepEval npm `0.9.17` + `VERIFY-0006` | TypeScript sidecar 已能对隔离 Session 做首工具合同 + DeepSeek judge。`toPass()` / `GEval.measure()` 因 telemetry CJS 阴影崩溃，旁路只用 `DeepSeekModel.generate()`。 |
| Promptfoo 文档（Node API / custom provider，2026） | `evaluate({ prompts, providers, tests })` 接受 `ProviderFunction`；断言可以是 `javascript` 函数；`sharing` / `writeLatestResults` 可关。要求 Node，不提供 Agent 生命周期模型。 |
| MASEval `0.5.1` 源码（`Benchmark` / `Task` / `Environment` / `AgentAdapter` / `Evaluator` / `ModelAdapter`） | Python 3.10+。官方立场是评「系统」而不是把 Agent 拆成可替换零件；现有系统用 `AgentAdapter._run_agent(query)` 包一层。`Benchmark.run(tasks, agent_data)` 必填第二参；必须实现 `get_model_adapter`。无 TypeScript SDK。自带 GAIA 等基准，与本仓库 Desktop 路由合同无关。 |
| 本仓库质量门禁 | Windows 禁止 `bunx vitest` / 裸 `npx vitest`；真实 Provider 默认不跑；`scripts/` 不是 workspace，改评测文件不会拖进 `test:changed`。 |

## 当前结论

三个框架不要做成三套被测对象。正确切法是 **一个 subject runner，三个 orchestrator**：

```text
goldens/tool-routing.json
  → harness/run-session.ts   隔离 SDK Session + 假工具
  → harness/run-case.ts      JSON CLI（给 Python / 外部进程）
        ├─ DeepEval suites   judge + expect(first tool)
        ├─ Promptfoo         隔离 / 首工具 / 禁忌工具断言矩阵
        └─ MASEval           Benchmark 生命周期 + Adapter 子进程调 run-case
```

| 框架 | 适合补的空档 | 不该让它做的事 |
|---|---|---|
| DeepEval | 自然语言 rubric、同一轨迹的 judge 分数 | 替代确定性首工具断言；登录 Confident AI |
| Promptfoo | 同一输入上的多条机械断言、以后做 prompt/模型对比 | 当产品内嵌评测台；默认写 `~/.promptfoo` 或分享到 Cloud |
| MASEval | 把 Desktop Agent 当成一个系统：环境 → 适配器 → 轨迹 → 评估器 | 重写 Agent；跑 GAIA；在 `packages/*` 增加 Python 运行时 |

MASEval 的 Adapter 只包装已有 `createCodingAgentSession()`。仓库没有 Python 测试运行时，所以 MASEval 只能作为 sidecar：`scripts/eval/.venv` + `pip install maseval`，由 `bun run eval:agent -- maseval` 拉起。这不是产品依赖。

第一刀仍是工具路由，不是 Desktop 全量功能。内容创作画布、真实图片点评、工作流排障需要 Desktop 素材，三框架都还不覆盖。

## 被否决的方案

- **把任一 SDK 嵌进 Desktop / coding-agent / Plugin**：用户已否定「评估变成产品功能」。
- **新建 `@vetta/eval` workspace**：要改 path map 和包边界，还容易被产品 import。
- **为 MASEval 在 monorepo 加正式 Python 包**：只有这一处需要，成本高于收益。
- **用 MASEval 官方 GAIA/公开基准代替手写 Golden**：评的是别人的任务，不是 Vetta 工具路由。
- **三套独立 Session 实现**：会让隔离合同分叉；隔离故障会被误读成「框架分数不同」。
- **默认登录 Confident AI / Promptfoo Cloud**：密钥与轨迹离开本机。

## 代码/测试/指标锚点

- 共享被测：`scripts/eval/harness/run-session.ts`、`scripts/eval/harness/run-case.ts`
- DeepEval：`scripts/eval/suites/tool-routing.eval.ts`
- Promptfoo：`scripts/eval/promptfoo/run.mjs`
- MASEval：`scripts/eval/maseval/run.py`
- 合同测试：`scripts/eval/harness/*.test.ts`（无网络）
- 实跑记录：[`VERIFY-0007`](../verification/VERIFY-0007-three-framework-tool-routing.md)
- MASEval 必须从 `run-case` stdout 读一行 JSON；SDK 日志走 stderr，否则 `json.loads` 会把整轮打成 `unknown_execution_error`

## 失效条件与置信度

结论在下列情况失效：MASEval 公开 API 大改导致 Adapter 合同对不上；Promptfoo `evaluate()` 不再接受 inline `ProviderFunction`；产品决定把评测嵌进 App。置信度高：三份上游源码/文档与本仓库 sidecar 约束一致。

## 下一步触发信号

- 同一 Golden 上三个框架结论持续分叉（超过模型抖动）→ 先查共享 runner，再查编排器。
- 需要评多 Agent 协作 → 再给 MASEval 加第二个 Adapter，而不是改 DeepEval/Promptfoo。
- Open Forge 首发版本确定 → 再把用户可感知的评测入口写进自己的 Release Notes；在此之前只留在 Task/VERIFY。
