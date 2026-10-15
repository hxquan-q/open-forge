---
id: ISSUE-0030
type: issue
status: draft
priority: P1
owner: packages/plugins
related_requirement: []
related_plan: []
related_tasks: [TASK-0208]
related_issues: []
related_bugs: [BUG-0088]
source: origin/chenxvhua 分支（allstar-coding v0.4 ac-fence）；user-request 合并评审
created: 2026-10-05
updated: 2026-10-12
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# allstar-coding ac-fence 的插件权限扩张与验收边界未定

## 背景

用户要求把 `origin/chenxvhua` 合并进本地 main 并推 dev。该分支（作者 Chenxvhua，7 个提交）在 `packages/plugins/presets/allstar-coding` 引入「事中拦截层」ac-fence：插件 `activate` 里通过 plugin-sdk `registerHook` 注册 `PreToolUse`，对主控派发的子代理工具调用按任务契约的 glob scope 做执行前判定，越权即 block。实现落在 `src/fence.ts`、`src/fence/judge.ts`、`src/fence/contract-store.ts`、`src/fence/audit-log.ts`，另带 `scripts/ac-audit.mjs`、`scripts/scope-glob.mjs` 与 2 个测试文件。

## 已知事实

- `plugin.json` 的 `permissions` 从 `["agent.skills.control"]` 扩到 `["agent.skills.control", "agent.hooks.register", "agent.hookHandler.execute"]`；`plugin.json`/`ability.json`/`package.json` 版本 0.1.0 到 0.2.0，而提交信息写作「v0.4」，两处口径不一致。
- 设计为 fail-open：判定纯内存、异常按放行处理，附 3s 超时纪律；缺 hooks 权限时 `registerHook` 为 warn+noop，插件打 `[ac-fence]` 前缀日志便于排查。
- 该工作在本仓 `project/` 中没有任何记录承载（`grep ac-fence`、`chenxvhua` 均无命中）；分支自带的发布说明提交还把 `Upstream baseline` 行改成了不在 `upstream/dev` 的 `5eecd278d`（真值 `d217984c72ef7b5f66ce0a6fea1ae2375060d425`）。
- AGENTS 的不变量要求「Plugin…权限按最小集合声明，不允许静默扩大宿主能力」。
- 2026-10-12 他人实机日志（0.1.3 打包版，Windows）：`fence-log append failed for write/shell/spawn_agent: Plugin permission denied: fs.write` 30+ 条——manifest 未声明 fs 写能力，`ctx.fs.writeFile` 追加 `docs/ac/fence-log.jsonl` 在生产恒被拒，审计落盘整体失效（已立案 `BUG-0088`）。
- 同一日志另见 `Cannot install over a system plugin: allstar-coding`——经 local-server `plugins.manage` 尝试安装 marketplace 的 `allstar-coding-0.2.0.vettapkg` 被拦；拦截符合系统插件保护设计，但也意味着系统预置插件无法经 vettapkg 通道升级，与本插件的迭代分发方式直接相关。

## 未决问题

- 预置插件持有 `agent.hooks.register` 与 `agent.hookHandler.execute` 是否属最小集合？fail-open 的取舍是否需要独立评审？
- ac-fence 的验收级别：工程验证（构建 + 单测）够用，还是需要实机端到端？
- 该实现属于 Upstreamable 还是 Open-Forge-only？

## 候选方案与取舍

- 按现状接收：把权限扩张与 fail-open 记为已知边界，先集成，后续按反馈调整。
- 收紧后接收：保留围栏，把 fail-open 改为可配置且默认 block。
- 暂缓：先补齐记录与评审再集成。

## 推荐方案

按「按现状接收」集成并如实登记边界（本次用户已明确要求合并），在 TASK-0208 的验证里跑通插件构建与自身单测；权限集合与 fail-open 的取舍留作本条待决。

## 决策触发条件

用户评审 ac-fence 行为或权限面后给出方向时更新本条；若决定收紧，另立 Task。
