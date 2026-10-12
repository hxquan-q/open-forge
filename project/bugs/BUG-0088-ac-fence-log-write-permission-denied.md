---
id: BUG-0088
type: bug
status: verifying
priority: P2
owner: packages/plugins
requirement:
plan:
source: 用户提供的他人实机日志巡检（render 2026-10-09）
related_requirement: []
related_plan: []
related_tasks: [TASK-0208]
related_issues: [ISSUE-0030]
related_bugs: []
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# allstar-coding ac-fence 审计日志缺 `fs.write` 权限声明，fence-log 追加每次必被拒

## 用户流程

- Given：allstar-coding 系统插件激活，ac-fence 经 `agent.hooks.register`/`agent.hookHandler.execute` 挂好 `PreToolUse` 拦截钩子。
- When：围栏对 `write`/`shell`/`spawn_agent` 等工具调用完成判定（放行或拦截）后，按设计把判定结果追加进 `fence-log.jsonl`。
- Then：审计条目应落盘；实际每次追加都失败：`[ac-fence] fence-log append failed for <tool>: Plugin permission denied: fs.write`。

## 实际行为

fence 判定本身工作（fail-open 设计下拦截照常执行），但审计落盘整体失效——生产环境没有任何 fence-log 记录，且每次拦截/放行尝试追加都向 renderer 日志写一条 warning（30+ 条/天）。

## 期望行为

插件声明其真实使用的最小 fs 权限集（或把审计改经已授权的能力通道），fence-log 正常追加；不再刷 `permission denied` 警告。

## 环境与失败证据

- Open Forge 0.1.3 打包版，Windows；allstar-coding 系统插件（日志中 `vetta-plugin://allstar-coding`）。
- `temp/log/render/2026-10-09.log`：`fence-log append failed for write/shell/spawn_agent: Plugin permission denied: fs.write` 共 30+ 条。

## 最小复现

1. 打包版启动（allstar-coding 随系统插件激活）。
2. 触发任意 ac-fence 判定路径（write/shell/spawn_agent 工具调用）。
3. 观察 render 日志出现 `Plugin permission denied: fs.write`。

## 影响

ac-fence 的审计闭环在真实环境完全不存在——ISSUE-0030 评审「fail-open 取舍」与 BUG-0082 之后的黑盒验收都缺少这层证据来源；同时形成持续的误导性日志噪音。

## 根因证据

- [`packages/plugins/presets/allstar-coding/plugin.json`](../../packages/plugins/presets/allstar-coding/plugin.json) `permissions` 仅 `["agent.skills.control","agent.hooks.register","agent.hookHandler.execute"]`，未声明 fs 写能力；系统插件权限按 manifest 自动授予，未声明即拒绝。
- [`src/fence/audit-log.ts`](../../packages/plugins/presets/allstar-coding/src/fence/audit-log.ts) `createFenceLogAppender` 经注入的 `io.writeFile` 写 `docs/ac/fence-log.jsonl`；[`src/fence.ts`](../../packages/plugins/presets/allstar-coding/src/fence.ts) 以 `ctx.fs.writeFile` 装配——正好落在未授权能力上。
- 另注：审计文件写进用户项目仓 `docs/ac/` 是否合规属于 ISSUE-0032 的词法写域边界讨论，本 Bug 只管「声明与使用不一致」这一层。
- 置信度：高（manifest 权限清单与调用点一一对应）。

## 回归测试

以生产 `plugin.json` 的权限集装配插件 `PluginContext` 触发一次围栏判定，断言 `ctx.fs.writeFile` 调用不被宿主拒绝；或更窄的合同测试——audit-log 所需能力必须全部出现在 manifest `permissions` 中。旧实现下断言失败。

## 修复与验证

- 修复：`plugin.json` `permissions` 按最小集合补 `fs.read`（fence-log 去重读/stat、state.md 兜底）与 `fs.write`（fence-log 落盘 writeFile/createDirectory）——preset 权限自动授予，声明即生效；属仓库内 preset 业务变更，非对外合同，未动 PLUGIN_API_VERSION/手册（TASK-0237）。
- 测试：`test/manifest.test.ts` 权限用例改为断言 fence 装配所需的完整最小集（旧 manifest 红基线已录）；preset 全套件 133 例绿。
- 检查：preset `bun run build` 产出 `allstar-coding-0.3.2.vettapkg`，解包核对 plugin.json 权限五项齐全；`check:lint` 绿。
- 未运行及原因：实机打包环境复测未做（无该机访问权）；`ISSUE-0032` 的 `docs/ac/` 词法写域讨论维持开放，本修复只管声明与使用一致。
