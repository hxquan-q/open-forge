<!-- Copyright The Open Forge contributors. -->
# @vetta/plugin-preset-allstar-coding

AllstarCoding 全流程软件工程流水线预置插件：主控 `@allstar` + 常驻辅助者 `@helper` 组成
「Allstar 流水线」团队，以 13 环节流水（需求评估 → HTML 原型 + 需求确认门 → 架构 → 任务拆分 →
逐任务开发/评审循环 → 白盒体检 → 黑盒 → 部署 → 收尾）驱动目标项目的全生命周期交付；
`docs/ac/state.md` JSON 状态机支持中断恢复，每环节收口走 ac-gate 产物硬校验。

v0.5.4（原型字段级可核对）：需求环节的原型与需求文档升级为字段级核对——原型上承载业务数据的控件尽量带「类型:取值方式」标注（placeholder 或紧邻灰字，明细表格在表头按列标注，计算字段尽力做 JS 联动演示），requires.md 新增字段清单节（F# 与原型标注一一对应，附类型/取值方式词表）。用户在需求确认门即可逐字段核对类型与取值逻辑，字段联动缺失或类型不符不再等到开发/黑盒阶段才暴露。纯提示词资产迭代（ac-requirements / ac-gate 两份技能与 G3 口径），不涉围栏、审计与权限矩阵，包版本维持 0.3.3。

v0.5.1（会话门修复）：修复 ac-fence 在生产装配下主/子会话判定失效的缺陷——宿主 PreToolUse
事件从不填充 subagent 字段（内核 baseEvent 无赋值点），旧判定 `event.subagent === undefined`
恒真导致所有子代理被误判为主会话：写域校验/只读纵深成死代码、git 子代理豁免不可达（v0.5
存档通道被自己的围栏死锁）、且全 app 任何会话的 git 写与 spawn 会被误拦。现改由插件侧
session-gate（src/fence/session-gate.ts）用 sessionId 双查重建会话身份（SubagentStart 的
agentId 恒等于子会话 sessionId；spawn 认养要求 task_name 带 AC 角色前缀且契约合法——内核
v1 契约下自然语言 scope 的普通 spawn 不会误触发；无关会话静默），判定流抽为纯模块并按
生产事件形态（无 subagent 字段）测试覆盖三类会话、认养判据、存档豁免与零误伤。

v0.5（环节级存档制）：T 级存档制升级为环节级存档制——state.md 每个（子）环节 done 即打档：
T 档（`T<n>: <摘要>`，评审 pass 触发）+ stage 档（`stage <seq>/<环节名>: <摘要>`，其余环节收口触发），
git 历史与 state.md 账本一一映射（V6 终局对账逐档对位），档内含 state.md 最新版本且逐档过 V4 写域校验。
修复了文档产物（requires/design/tasks 等）不入档导致 V3 评审前快照误报越权的缝隙，
白盒/黑盒轮修复改动也有了显式归档点。

v0.4（权限与校验体系）：任务契约 schema v2（scope glob / prohibitions / help_protocol）、
角色权限矩阵 v1（三档分级、写域互不重叠、T3 应急申请制）、reviews.md 追加制评审记录、
T 级存档制、越权处置 SOP 六步、V1-V6 硬校验节点（双证据链：git 轨迹 + 文件 mtime）。
随包分发 `scripts/ac-audit.mjs` 只读审计脚本（V2 环节收口 / V3 评审前快照 / V4 存档点），
主控在关键节点执行并贴报告留档。

v0.2（ac-fence 事中拦截层）：插件 activate 注册 `PreToolUse` + `SubagentStart` hook——
主控 spawn 的每个子代理，其工具调用（写文件/跑命令/再 spawn）在执行前按任务契约 scope 判定，
越权即 block（reason 带 help_protocol 指引），拦截记录落目标项目 `docs/ac/fence-log.jsonl`
（预期写入，ac-audit 双链已排除）。判定器为纯函数（`src/fence/judge.ts`，不 import
plugin-sdk）；glob 语义与 ac-audit 共用 `scripts/scope-glob.mjs` 权威实现（事中拦截与
事后审计对同一 path 同一判定）。git 写操作收口：主会话直跑即拦；环节级存档（T 档/stage 档）走轻量 git 子代理
（task_name `git_` 前缀 + 契约 `allow_git_write: true`，豁免只授 `git_` 前缀，偷带即拒）。
需要权限：`agent.hooks.register` + `agent.hookHandler.execute`（缺失时 registerHook 是
warn+noop 静默失效——desktop 日志查 `[ac-fence] hooks registered`）。

## Context Boundary

```yaml
purpose: 预置（preset）插件——随 manifest 铺设智能体、团队、技能与本地化声明；activate 注册 PreToolUse/SubagentStart hook 挂 ac-fence 事中围栏（按任务契约 scope 判定子代理工具调用，渲染进程内纯内存判定，文件 I/O 经 ctx.fs 宿主中转）；附带 scripts/ac-audit.mjs 只读审计脚本（主控侧 node 执行，不进渲染进程）
provides:  []
consumes:  []
internal_dependencies:
  - "@vetta-org/plugin-sdk"
  - "@vetta-org/plugin-vite"
```
