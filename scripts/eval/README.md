<!-- Copyright The Open Forge contributors. -->
# Agent 开发期评测（旁路）

这是给开发者用的评测入口，**不是产品功能**。它不进 `bun run check`、husky、`test:changed` 或默认 CI。

被测对象是公开的 `@vetta/coding-agent/sdk`。DeepEval、Promptfoo 和 MASEval 只出现在本目录；产品代码不得 import 它们。

三个编排器共用同一套隔离 Session 和 `goldens/tool-routing.json`：

| 框架 | 入口 | 评什么 |
|---|---|---|
| DeepEval | `suites/*.eval.ts` | DeepSeek judge + 首工具合同 |
| Promptfoo | `promptfoo/run.mjs` | 隔离 / 首工具 / 禁忌工具断言矩阵 |
| MASEval | `maseval/run.py` | 系统生命周期 + Adapter 轨迹，再评同一合同 |

## 本地密钥（可本地用，禁止提交）

```bash
cp scripts/eval/.env.example scripts/eval/.env
# 填入 DEEPSEEK_API_KEY；可把 OPENFORGE_EVAL=1 写进 .env
```

`scripts/eval/.env` 已被 gitignore（根 `.env` 规则 + 显式 `scripts/eval/.env`）。`run.mjs` 启动时会加载该文件，**不会覆盖**已在 shell 里设置的变量，也**不会**把密钥打印到日志。

## 命令

```bash
# 只跑无网络的轨迹投影 / Golden / run-case 合同
bun run eval:agent

# 用 DeepSeek 跑三个框架（优先读 scripts/eval/.env）
bun run eval:agent

# 只跑其中一个
bun run eval:agent -- deepeval
bun run eval:agent -- promptfoo
bun run eval:agent -- maseval
```

MASEval 需要本地 Python venv（不进产品依赖）：

```bash
python -m venv scripts/eval/.venv
scripts/eval/.venv/Scripts/python -m pip install -r scripts/eval/maseval/requirements.txt
```

可选环境变量：

| 变量 | 默认 | 含义 |
|---|---|---|
| `OPENFORGE_EVAL` | 未设置 | 设为 `1` 才打真实 DeepSeek |
| `DEEPSEEK_API_KEY` | 无 | 被测模型（和 DeepEval judge）共用；只放 shell 或 `scripts/eval/.env` |
| `OPENFORGE_EVAL_SUBJECT_MODEL` | `deepseek-chat` | 被测模型 |
| `OPENFORGE_EVAL_JUDGE_MODEL` | `deepseek-chat` | DeepEval judge |
| `OPENFORGE_EVAL_BASE_URL` | `https://api.deepseek.com` | DeepSeek 兼容端点 |

不要运行 `npx deepeval test run`、`npx promptfoo eval` 或 `npx vitest`。DeepEval 必须走 `scripts/quality/run-vitest.mjs`。不要登录 Confident AI 或 Promptfoo Cloud。不要跑 MASEval 自带的 GAIA 等公共基准。

MASEval 通过 `bun scripts/eval/harness/run-case.ts` 拿 JSON。SDK 的 `console.log` 必须进 stderr，stdout 只留一行 JSON。

DeepEval 0.9.17 的 `GEval.measure()` / `toPass()` 会因包内 `dist/telemetry.js` 挡住 `dist/telemetry/` 而在启动时崩溃。旁路只使用官方 `DeepSeekModel` 做 judge，评分提示词在 `harness/score-case.ts`。

## Session 隔离

临时工作区必须自带 `.git`，并把 `VETTA_HOME` 指到该次评测的空目录。否则 SDK 会沿 cwd 向上扫到开发机 `~/.agents/skills`，或读到 `~/.openforge` 的技能/钩子。

不要在 `createCodingAgentSession({ activeTools: [] })` 里清空工具表：公共 SDK 的 `activeTools` 只接受内置名，空列表会把假路由工具一起关掉，模型就只剩 `invoke_skill` 或干脆不调工具。创建后再 `setActiveToolsByName` 钉死评测目录里的假工具。

## 评什么

`goldens/tool-routing.json` 覆盖 `docs/agent/tool-routing-evaluation.md` 里可隔离的成对场景：外观/插件、项目脚手架与侧边栏、调度器、PDF Skill、会话计划与看板、图表、预览与 Remotion。内容创作画布、真实图片点评和工作流排障仍需要 Desktop 素材，不在这一刀。

这还不是 Desktop 全量 Action 目录。分数写到 `results/`（已 gitignore），不要把密钥写进报告。live 跑完后 `summarize-results.mjs` 会汇总三框架最新报告。
