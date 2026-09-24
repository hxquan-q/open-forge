---
id: VERIFY-0007
type: verification
status: done
owner: coding-agent
source: "user-request; RESEARCH-0009; VERIFY-0006"
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_task: []
related_research: [RESEARCH-0009]
---
<!-- Copyright The Open Forge contributors. -->

# 三框架旁路：DeepEval + Promptfoo + MASEval 工具路由

## 被验证的合同

`scripts/eval/` 用同一套隔离 SDK Session 和 `goldens/tool-routing.json`，分别经 DeepEval、Promptfoo、MASEval 评分。评测不是产品功能，不进 `check` / husky / 默认 CI。不登录 Confident AI / Promptfoo Cloud，不跑 MASEval GAIA。

本地密钥可放在 `scripts/eval/.env`（gitignore，不提交）；`run.mjs` / `env.ts` / MASEval 启动时加载，不覆盖 shell，不打印值。

## Given / When / Then

- **Given**：临时网站 + Remotion 夹具、空 `VETTA_HOME`、工作区自带 `.git`、创建后再钉死 16 把假工具；调度器 / 图表路由说明已写入假工具描述与 system prompt。
- **When**：凭 `scripts/eval/.env`（`OPENFORGE_EVAL=1` + DeepSeek key）执行 `bun run eval:agent`。
- **Then**：
  - 无网络 harness（含 `run-case` / dotenv 合同）通过；
  - 三个框架看到同一输入的同一类轨迹字段；
  - 17 条 Golden 首工具合同全部通过，且不调用成对禁忌工具；
  - 「谁最大」只回答文本、不调 `render_chart`。

## 环境与输入

- 平台：Windows，`scripts/quality/run-vitest.mjs` + `scripts/eval/.venv`（MASEval 0.5.1）+ `promptfoo@0.123.1`
- Subject / Judge：`deepseek-chat` @ `https://api.deepseek.com`
- 授权：`scripts/eval/.env`（未跟踪；`git check-ignore` 命中）
- Golden：`scripts/eval/goldens/tool-routing.json`（17 条）
- 日期：2026-09-24

## 实际命令

```text
bun run eval:agent
bun scripts/eval/summarize-results.mjs
```

## 结果

### 本轮全绿（强化调度器/图表提示后）

无网络 harness：29 个测试通过（含 `load-dotenv` / `run-case`）。

| 框架 | 通过 | 失败 | 报告 |
| --- | --- | --- | --- |
| DeepEval | **17/17** | 无 | `tool-routing-2026-09-23T18-38-01.259Z.json` |
| Promptfoo | **17/17** | 无 | `promptfoo-tool-routing-2026-09-23T18-38-49.544Z.json` |
| MASEval | **17/17** | 无 | `maseval-tool-routing-2026-09-23T18-41-15.456Z.json` |

汇总：`scripts/eval/results/three-framework-summary-2026-09-23T18-42-26.274Z.json`，`unstableCases: []`。隔离快照均 `skillNames: []`。

相对上一轮：调度器漏调用 / 图表漏调用在强化 `ROUTING_EVAL_SYSTEM_PROMPT` 与假工具描述后消失。**随后按 vetta-testing 把同一边界落到生产入口**（见下），避免只靠评测夹具提示词。

### 按测评报告完善的生产合同（无网络）

Given / When / Then（确定性合同，不替代 live 评测）：

- **Given**：官方 Action usage、`VETTA_CLI_GUIDANCE`、通用工具选择指引、`render_chart` 描述进入模型可见入口。
- **When**：用户说「让 Vetta 每天汇总…」「Vetta 定时任务支持什么？」「把月度趋势画成图」「在网站实现趋势图组件」。
- **Then**：
  - `scheduler` usage 明确 create vs query/help，且禁止用创建演示能力；
  - CLI 指引要求创建定时任务，能力问题只查询解释；
  - 工具选择指引区分对话画图与项目实现图表；
  - `render_chart` 描述要求聊天可视化，禁止当网站组件实现。

### 上一轮对照（提示词强化前）

| 框架 | 通过 | 失败用例 |
| --- | --- | --- |
| DeepEval | 16/17 | `vetta-daily-summary` |
| Promptfoo | 13/17 | 调度器相关 + 若干本轮未调工具 |
| MASEval | 16/17 | `scheduler-capabilities` |

Open Forge 首发版本尚未切入 Desktop manifest，本条 fork-only 评测记录留在本 VERIFY，不写入继承的 Vetta Release Notes。

## 未运行的验证与原因

- 未登录 Confident AI / Promptfoo Cloud。
- 未跑 MASEval GAIA。
- 未跑内容创作画布 / 真实图片点评 / 工作流排障（缺 Desktop 素材）。
- 未跑 `verify:ui:*`（用户未授权）。
- 未跑完整 `bun run check`（工作区另有过期 `modes-data.ts`）。对本侧车文件的 Biome 已通过。

## 剩余风险

DeepSeek 路由仍会抖动；单次 17/17 不能当作永久基线。生产侧已写入说明合同，但模型仍可能忽略；应周期性 `OPENFORGE_EVAL=1 bun run eval:agent` 复核。密钥只应存在于 shell 或 `scripts/eval/.env`。
