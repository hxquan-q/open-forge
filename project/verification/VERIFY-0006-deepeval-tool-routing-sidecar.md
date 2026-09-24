---
id: VERIFY-0006
type: verification
status: done
owner: coding-agent
source: "user-request; RESEARCH-0006; DeepSeek live eval 2026-09-24; ~/.openforge-dev logs"
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_task: []
related_research: [RESEARCH-0006]
---
<!-- Copyright The Open Forge contributors. -->

# DeepEval 开发期旁路：工具路由评测

## 被验证的合同

`scripts/eval/` 作为开发期 sidecar：隔离 SDK Session + 假工具目录，评估 `deepseek-chat` 是否按 `docs/agent/tool-routing-evaluation.md` 的成对场景选对第一把工具。评测不是产品功能，不进 `check` / husky / 默认 CI。

对照了 `~/.openforge-dev` 当天 Desktop 日志和 App Monitor，只作运行时证据，不把用户会话正文写进本文件。

## Given / When / Then

- **Given**：临时网站 + Remotion 夹具、空 `VETTA_HOME`、工作区自带 `.git`、`includeAgentSkills: false`、创建后再钉死 16 把假工具。
- **When**：用户分别发出文档里的成对请求（外观、插件、脚手架、侧边栏、cron/调度器、PDF Skill、计划/看板、图表、预览/Remotion）。
- **Then**：
  - Session 不加载宿主技能；
  - 需要动作的用例第一把工具等于 Golden，且不调用成对禁忌工具；
  - 「谁最大」只回答文本、不调 `render_chart`；
  - 通过的用例 DeepSeek judge ≥ 0.6。

## 环境与输入

- 平台：Windows，`scripts/quality/run-vitest.mjs`
- Subject / Judge：`deepseek-chat` @ `https://api.deepseek.com`
- 授权：`OPENFORGE_EVAL=1` + 环境变量 `DEEPSEEK_API_KEY`（未写入仓库）
- Golden：`scripts/eval/goldens/tool-routing.json`（17 条）

## 实际命令

```text
bun run eval:agent
```

## 结果

日期：2026-09-24。报告 `scripts/eval/results/tool-routing-2026-09-23T17-56-12.595Z.json`（gitignore）。

隔离：`skillNames: []`，活动工具为 16 把假工具。Judge probe 通过。Harness 合同测试通过。

| 用例 | 首工具 | 结果 |
| --- | --- | --- |
| website-dark-mode | `edit_website_theme` | 通过 / judge 1.0 |
| vetta-window-dark | `vetta_appearance` | 通过 / judge 1.0 |
| install-vetta-plugin | `vetta_plugins_manage` | 通过 / judge 1.0 |
| install-project-vite-plugin | `project_package_install` | 通过 / judge 1.0 |
| create-react-project | `project_scaffold` | 通过 / judge 1.0 |
| add-dir-to-sidebar | `vetta_projects_add` | 通过 / judge 1.0 |
| business-cron | `project_code_edit` | 通过 / judge 1.0 |
| vetta-daily-summary | （无调用） | **漏调用**，期望 `vetta_scheduler_create` |
| scheduler-capabilities | `vetta_scheduler_query` | 通过 / judge 1.0 |
| use-pdf-skill | `skill_pdf` | 通过 / judge 1.0 |
| list-execution-plan | `session_todo` | 通过 / judge 1.0 |
| add-to-vetta-board | `vetta_board_create` | 通过 / judge 1.0 |
| who-is-max | （无调用） | 通过 / judge 1.0 |
| draw-monthly-trend | `project_code_edit` | **误调用**，期望 `render_chart` |
| implement-trend-chart | `project_code_edit` | 通过 / judge 1.0 |
| preview-react-app | `project_preview` | 通过 / judge 1.0 |
| export-remotion-mp4 | `remotion_render` | 通过 / judge 1.0 |

合计：**15/17 路由通过**。失败是模型选择质量，不是 harness 隔离故障。

### Desktop 运行日志（`~/.openforge-dev`，2026-09-24）

App Monitor：交互会话 10 次、347 轮、工具 423 次（失败 59）。高频：`edit` 140/50 失败、`write` 69、`read` 72、`shell` 61/5 失败、`html_to_pdf` 3/3 失败、`render_pdf_page` 10/10 成功。Provider 错误 2。Marketplace `vetta-official` 刷新 404。主进程多次 `vetta:models:fetch-remote` 无 handler（lite 构建）。当天窗口多次 reload `http://127.0.0.1:3020/`。未跑内容创作画布 / 真实图片点评 / 工作流排障的隔离评测（缺 Desktop 素材）。

## 未运行的验证与原因

- 未跑全仓 `bun run check`：工作区另有无关 Desktop 改动；`check:quick` 的 guards 被过期 `modes-data.ts` 打断，与本次评测文件无关。
- 未跑 `verify:ui:*`：本次是 Agent 路由评测，不是 UI 走查。
- 未登录 Confident AI。
- 未做多模型、多次重复区间统计。

## 剩余风险

- 单次采样，不是稳定误调用率。
- `vetta-daily-summary` 漏调用、`draw-monthly-trend` 误走项目改码，说明调度器创建与对话图表边界仍弱。
- Desktop 日志里的 `edit` / `html_to_pdf` / marketplace 404 是产品运行问题，不在本 sidecar 断言范围内。
- 聊天里出现过明文 API key，必须轮换。
- Open Forge 首发版本未定，本条不写入继承的 Vetta Release Notes。
