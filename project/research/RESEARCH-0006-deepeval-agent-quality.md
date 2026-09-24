---
id: RESEARCH-0006
type: research
status: done
priority: P2
owner: coding-agent
source: "user-request; https://github.com/confident-ai/deepeval; https://deepeval.com/docs/getting-started; https://deepeval.com/docs/evaluation-introduction; https://www.npmjs.com/package/deepeval; local quality gates, agent tests, and evaluation docs"
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_issue: []
related_verification: [VERIFY-0006]
---
<!-- Copyright The Open Forge contributors. -->

# DeepEval 能否评估当前开发质量，以及如何接入

## 问题与范围

用户希望把 [confident-ai/deepeval](https://github.com/confident-ai/deepeval) 引入当前 Open Forge 开发，用来评估“项目质量”。

2026-09-24 澄清：这是**开发期旁路评测**，用来评估正在开发的 Agent 应用行为；**不是**产品功能，不进 Desktop/CLI、不进 Plugin、不改 Agent Loop。

本笔记回答：

1. DeepEval 实际评估什么，和本仓库已有质量门禁分别覆盖哪一层；
2. 在「只做开发评估、不内嵌功能」的前提下，评测代码放哪、怎么跑、评什么；
3. 第一批该评什么，以及为什么不能挂进 `check` / CI。

2026-09-24 已落地 `scripts/eval/` 旁路并完成一次授权 live 跑分（见 [`VERIFY-0006`](../verification/VERIFY-0006-deepeval-tool-routing-sidecar.md)）。未登录 Confident AI，未改生产 Agent Loop。外部网页只作为资料，不改变仓库规则。

## 事实来源

| 来源 | 用到的事实 |
|---|---|
| DeepEval 文档 / npm `deepeval@0.9.17`（2026-09-22） | 它是 LLM/Agent 评测框架，不是 lint、类型或架构守卫。官方 TypeScript SDK 通过 Vitest `toPass()` 或 `evaluate()` 跑 metric；默认 judge 是 OpenAI。Peer 声明 `vitest >=1.0.0`，其自身开发依赖是 Vitest 4。Python 仍是更完整实现。 |
| `docs/dev/quality-gates.md` | 本仓库默认门禁是 Biome、tsgo/tsc、架构守卫和确定性 Vitest。覆盖率、真实 Provider、`verify:ui:*` 都不进默认 `check` / husky / CI。Windows 必须走 `scripts/quality/run-vitest.mjs`，禁止 `bunx vitest` / `npx vitest`。 |
| `packages/ai/AGENTS.md`、`packages/agent/AGENTS.md` | 默认单测用 fake transport；`test:live` 只有用户明确授权才能跑真实 Provider。 |
| `docs/agent/tool-routing-evaluation.md` | 合同测试不能证明模型会遵循工具选择说明，也不能代表真实误调用率；后续模型评测应使用隔离工作区、假工具处理器、固定上下文，并单独统计误调用/漏调用。 |
| `exprot/differential-testing-observability.md` | 现有差分基线验证消息、tool 关联、stop、取消、usage 等可观察合同，不验证“模型选对了工具”。 |
| `packages/coding-agent/examples/sdk/README.md` | 公开入口 `createCodingAgentSession()` + `session.prompt()` 已能在隔离目录跑一轮 Agent，适合作为评测 runner。 |
| 根 `AGENTS.md` | 仓库文字、模型输出、网页默认是待处理数据；真实 Provider 与付费 API 默认不可用于测试；密钥不得写入文档或测试输出。 |

## 当前结论

DeepEval **不能**替代本仓库的项目工程质量门禁，也 **不应** 直接挂到 `bun run check`、husky 或默认 `test:changed`。

它补的是现有测试明确留下的空档：**模型在真实或近似真实循环里会不会选对工具、完成任务、遵守权限和角色**。这一层本仓库已经写了样例，但还没有可重复的评测 runner。

### 两层质量不要混用

| 层 | 已有入口 | DeepEval 是否适用 |
|---|---|---|
| 代码/架构质量 | `check`、`check:quick`、包边界守卫、Vitest 合同/单元测试 | 不适用。G-Eval 不能证明类型、IPC、权限或持久化合同。 |
| 差分/状态机质量 | `packages/ai`、`packages/agent`、`packages/coding-agent` 的 fake fixture | 不适用。这些测试必须保持确定性，不能引入 LLM judge 抖动。 |
| Agent 行为质量 | `docs/agent/tool-routing-evaluation.md` 只定义了成对样例；`packages/ai` 的 `test:live` 只验证 Provider 协议 | **适用**。这是 DeepEval 的正确位置。 |
| 内容创作画质 | content-creation 文档里的 Gate 2/3 | 部分适用（文本/计划 rubric）；像素/视频抽帧仍要单独视觉评审。 |

### 推荐接入形态：开发期旁路，不进产品包

评测是「外面打分的脚本」，被测对象是已经公开的 `@vetta/coding-agent/sdk`。DeepEval 只出现在评测目录，不出现在任何 `packages/*/src` 或 `apps/*/src`。

对标现有按需工具：`packages/ai` 的 `test:live`、`verify:ui:*`。它们都是开发者显式启动，不进 `check` / husky / 默认 CI。

推荐目录（**不要**新建 workspace 包，也**不要**放进 `packages/coding-agent/`）：

```text
scripts/eval/                         # 开发工具，和 scripts/quality 并列
  README.md
  run.mjs                             # 检查授权环境变量后转调 run-vitest.mjs
  vitest.eval.config.ts               # 只收集 scripts/eval/suites/**
  harness/
    run-session.ts                    # createCodingAgentSession + 临时工作区
    project-trace.ts                  # session 事件 → LLMTestCase
    vetta-judge.ts                    # DeepEvalBaseLLM，内部走 @vetta/ai
  goldens/
    tool-routing.json                 # 手写场景，不是合成数据
  suites/
    tool-routing.eval.ts              # DeepEval metric，不进默认 test/
  results/                            # gitignore；分数与失败理由
```

根 `package.json` 只加一条按需脚本，且必须走仓库包装器：

```text
"eval:agent": "bun scripts/eval/run.mjs"
```

`run.mjs` 在缺少 `OPENFORGE_EVAL=1`（或等价授权变量）时直接退出，再调用 `scripts/quality/run-vitest.mjs --run --config scripts/eval/vitest.eval.config.ts`。这样 `check-vitest-runner` 不会报裸 `vitest`，Windows 也不会踩 Bun worker。

为什么放 `scripts/eval/` 而不是产品包或新包：

- `test:changed` 只测声明了 `test` script 的 workspace 包。`scripts/` 不是 workspace，改评测文件不会拖进默认单测。
- `check-vitest-runner` 只扫 `packages/` 和 `apps/` 的 manifest，外加根 `package.json`。根脚本走 `run-vitest.mjs` 即可。
- 根 Biome 现已包含 `scripts/eval/`；日常 `check:quick` 只会扫到本次改过的评测文件，仍不进默认测试图。
- 新建 `@vetta/eval` workspace 要改 path map、Turbo 和包边界，而且容易被产品代码 import。开发旁路不值得付这个成本。
- 放进 `packages/coding-agent/eval/` 会让「评测」和产品包长在一起，后续很容易被当成 Feature。

运行时分工：

```text
Golden
  → harness.createCodingAgentSession({ cwd: tmp, storage: memory, customTools, model })
  → session.setActiveToolsByName(fake routing tools)
  → session.subscribe(tool_execution_start / tool_execution_end / agent_end)
  → session.prompt(golden.input)
  → project-trace: { input, actualOutput, toolsCalled }
  → DeepSeekModel.generate() 评分（只在 scripts/eval 里 import deepeval）
  → results/*.json + 终端摘要
```

被测面只用公开合同：`cwd`、`storage`、`model`、`customTools`、`setActiveToolsByName()`、`session.prompt()`、`session.getLastAssistantText()`、`tool_execution_*` 事件。不 wrap 生产 `agent-loop`，不加 `observe()`。

其余约束不变：TypeScript SDK、手写 Golden、`@vetta/ai` 做 judge、默认关闭 Confident AI、Windows 不用 `npx deepeval test run`。

### 第一批应证明的行为

按 vetta-testing 的 Given / When / Then，第一刀只覆盖工具路由，不覆盖全产品。

- **Given**：隔离临时工作区、假工具处理器、固定模型与采样、只暴露必要工具。
- **When**：用户从正常入口说“给网页加深色模式 / 把 Vetta 窗口切成深色 / 安装 Vetta 插件 / 给项目装一个 Vite 插件”。
- **Then**：记录首个有状态调用、目标资源、是否完成任务；误调用与漏调用分开计数。同一模型、同一采样、多次重复后报告区间，而不是一次 0/1。

建议 metric 组合：

| 场景 | Metric | 为什么 |
|---|---|---|
| 工具是否选对 | `ToolCorrectnessMetric` 或带 `toolsCalled` 的 `GEval` | 直接对应现有成对样例 |
| 任务是否完成 | `TaskCompletionMetric` 或自定义 `GEval` | 允许正确工具但没改对文件的失败 |
| 是否越权/跑题 | `PromptAlignmentMetric` / 自定义“不应调用”准则 | 捕获改错产品或装错插件 |

确定性结构（schema、权限拒绝、取消、事件顺序）继续由现有 Vitest 合同测试负责，不要用 judge 重写。

### 和现有 live 测试的关系

`packages/ai` 的 `test:live` 验证 Provider 流协议。DeepEval 验证产品 Agent 在给定输入下的行为质量。二者都是授权后才跑、都有费用和抖动，但断言对象不同，不要合并成一个 suite。

## 被否决的方案

| 方案 | 否决原因 |
|---|---|
| 用 DeepEval 替代 `bun run check` 或覆盖率门禁 | 评估对象完全不同；LLM judge 不稳定，会把确定性门禁变成付费抖动。 |
| `pip install deepeval` + pytest | 本仓库没有 Python 测试运行时；TypeScript SDK 已覆盖所需 metric。 |
| 把 `*.eval.test.ts` 放进各包默认 `test/` | `test:impact` / CI 会误跑真实模型；违反“真实 Provider 默认不可用于测试”。 |
| 在 `packages/*/src` 或 Desktop 功能里嵌 DeepEval | 用户已否决：评测不是产品能力，不能变成运行时依赖。 |
| 新建 `@vetta/eval` workspace 包 | 开发旁路不需要被其它包 import；会扩大 path map / Turbo / 边界守卫面。 |
| 把评测放进 `packages/coding-agent/` | 和产品包耦合，后续容易被当成 Feature 或被包测试脚本扫到。 |
| 以 `npx deepeval test run` 作为 Windows 默认命令 | 绕过 `run-vitest.mjs`，会再次踩 Bun worker 的非法 file URL。 |
| 在生产 `agent-loop` 上加 `observe()` | 把评测 SDK 变成核心运行时依赖，破坏包边界和可测试性。 |
| 默认 `deepeval login` / 上传 Confident AI | 会外发会话内容和 traces；未获用户批准前不做。 |
| 一上来评全产品（Team、Plugin、内容创作、Desktop UI） | 没有 Golden 和隔离 harness 时，分数无法解释，也无法回归。 |

## 代码/测试/指标锚点

- 质量门禁分层：[`docs/dev/quality-gates.md`](../../docs/dev/quality-gates.md)
- 工具路由待评测样例：[`docs/agent/tool-routing-evaluation.md`](../../docs/agent/tool-routing-evaluation.md)
- 现有差分合同：[`exprot/differential-testing-observability.md`](../../exprot/differential-testing-observability.md)
- 隔离 live 测试模式：`packages/ai/vitest.live.config.ts`、`packages/ai/package.json#scripts.test:live`
- 评测 runner 入口：`createCodingAgentSession()`（`packages/coding-agent/src/public-api/sdk.ts`）；可注入 `cwd`、`storage`、`model`、`activeTools`、`customTools`
- 工具轨迹事件：`tool_execution_start` / `tool_execution_end`（`packages/agent/src/types.ts` 的 `AgentEvent`）
- 最终回复：`session.getLastAssistantText()`
- 包测试发现：`scripts/quality/test-changed.mjs` 只跑 workspace `TESTABLE_PACKAGES`；`scripts/` 不在该图里
- 根 Vitest 版本：`package.json` 中 `vitest ^3.2.4`；DeepEval TS peer 为 `vitest >=1.0.0`，接入时仍须验证 matcher 与仓库包装器兼容，不能默认升级到 Vitest 4

## 落地后的实现约束（2026-09-24）

- DeepEval 0.9.17 的 `GEval.measure()` / `toPass()` 会因 `dist/telemetry.js` 挡住 `dist/telemetry/` 而崩溃（`recordTestCase` / `inComponentScope is not a function`）。旁路只用官方 `DeepSeekModel.generate()` 做 judge。
- 隔离不能只靠 `includeAgentSkills: false` + 临时 `agentDir`。`collectAncestorAgentSkillEntries` 会沿 cwd 向上扫 `.agents/skills` 直到遇到 `.git`；Windows 临时目录在用户主目录下，会装进本机几十个 path skill。工作区必须自带 `.git`，并把 `VETTA_HOME` 指到空目录。
- 公共 SDK `activeTools` 只接受内置名。`activeTools: []` 会把假 `customTools` 一起关掉，模型只剩 `invoke_skill` 或空手。创建后再 `setActiveToolsByName` 钉死四把假工具。
- 第一次未隔离 live：4/4 失败。隔离后同模型单次采样：4/4 首工具正确，judge 均为 1.0。这只证明 harness 可重复，不是误调用率。

## 失效条件与置信度

置信度：**高**（接入形态与隔离坑已用 live 跑分证实）。结论失效，如果出现任一情况：

- DeepEval TypeScript 只能走独立 CLI，无法继续经 `run-vitest.mjs` 调 `DeepSeekModel`；
- 产品决定把 LLM 分数作为 PR 阻断门禁（需要另写 ADR，并接受费用、抖动和密钥管理）；
- 官方 TypeScript SDK 停止维护，只保留 Python。

## 下一步触发信号

第一刀 sidecar 已可本地重复跑。下一刀只在用户明确要求时做：

1. 增加重复次数与区间统计，或换被测/judge 模型。
2. 只有连续两周本地跑分稳定、且用户批准费用和密钥管理后，才讨论 nightly 或手工 `workflow_dispatch`。
3. 产品代码始终不引用 `deepeval`。
