---
id: TASK-0486
type: task
status: verifying
priority: P1
owner: desktop
requirement: REQ-0034
source: user-request-2026-11-16
related_requirement: [REQ-0034]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: task/TASK-0486-delegation-mechanism
worktree: unassigned（主工作区串行）
base_commit: 711311f9c
read_paths:
  - packages/coding-agent/src/composition/subagent/
  - packages/agent-team/src/contracts.ts
  - apps/desktop/src/main/conversations/
  - apps/desktop/src/main/agent-teams/
write_paths:
  - packages/runtime-subagents/src/
  - packages/coding-agent/src/composition/
  - packages/agent-team/src/
  - packages/plugins/plugin-sdk/
  - docs/plugin/
  - apps/desktop/src/main/
  - apps/desktop/src/renderer/
  - apps/desktop/src/shared/i18n/locales/
  - .github/release-notes/fragments/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-16
updated: 2026-11-17
---
<!-- Copyright The Open Forge contributors. -->

# 自适应流水线 P2：委任机制（有界内核扩展）

## 合同

- 来源与目标：REQ-0034。四件（roadmap §4 定稿）：件2 生命周期标记（合同层）→ 件3 下拉语义与会话分流 → 件1 内核动态注册与 spawn → 件4 能力标签（降级：LLM 读 responsibility 文本）。
- 输入 → 输出：AgentProfile/blueprint/manifest 增 `lifecycle`（缺省=主控/现状）→ worker 选中时默认会话保持驾驶+按域委派；成员按定义注册子代理类型；常驻成员 spawn 一次+followup 排队，重复 spawn 被拒。
- 做 / 不做：做内核+UI+合同全套与测试；不做跨会话/agent-bus、不动 ap-* 技能正文、不迁移存量预设标记、不做件4 标签、头像不进子代理快照（载荷考量，记 roadmap）。串行执行，无并行冲突。
- Given / When / Then：见 REQ-0034。
- 保留：未标记资产零行为变化；Team 会话链路不动；spawn 契约 v1 槽位不变；恢复降级语义不变；manifest fail-closed + PLUGIN_API_VERSION 推版。
- 验证：件1 合同测试（动态注册/spawn/守卫）、件2 状态转换测试（排队/不重复起实例）、件3 交互测试+i18n 零硬编码；统一走 `bun run test:pkg`/`run-vitest.mjs` 定向运行；改动文件 check:quick。**2026-11-16 用户指示：`test:impact`、全量测试与完整 `bun run check` 属单独行为，由用户自行发起，不在本任务流程内跑**（收尾在交付说明列明未运行项）。
- 人工验收：用户手动 `bun run dev` 实机验证（选 worker agent/团队→委派行为、常驻排队、有主控团队不变）。

## 实施切片

1. 件2-合同：agent-team contracts/validation + store + manifest-schema + presets 解析 + reconcile + 插件合同五件套（手册/CHANGELOG/SDK patch/PLUGIN_API_VERSION 2.13.0/合同测试）+ Agent Center 编辑器 UI + i18n。
2. 件3-主进程：session-agent-profile 双态解析（persona 接管 vs 委任束）+ 委任指引构建 + 团队成员解析 + binding 记录 + resolve-session-config 透传。
3. 件3-渲染层：worker 团队目标走普通会话链路（delegationTeamId）+ 下拉文案 i18n + 路由测试。
4. 件1-内核：CodingAgentDelegatedMember 合同 + session options 校验 + per-session 注册表 + spawn 守卫 + displayTitle（runtime-subagents 小改）+ 合同测试。
5. 收尾：发布说明碎片、完整 check、索引同步、roadmap 更新。

## 交付

### 续修（2026-11-17，纠错，分支 `task/TASK-0486-delegation-type-fix`）

原交付跳过完整 check（见上文用户指示），chenxvhua 集成后完整 `bun run check` 暴露两处生产代码类型错误，本节为对已交付代码的纠错续修：

- `desktop-conversation-service.ts` `resolveBoundAgentProfile`：错误详情与 log.warn 误用简写 `{ delegationTeamId }` 引用不存在的标识符——新建委任会话且目标团队已删时应抛 `AGENT_PROFILE_UNAVAILABLE`，实际先抛 `ReferenceError`（真运行时缺陷）。改为显式键值 `{ delegationTeamId: delegatedTeamId }`，键名保持与配置字段一致。先红后绿：`desktop-conversation-service.test.ts` 补"新建委任会话且团队已删 → 抛 `AGENT_PROFILE_UNAVAILABLE` 且详情含 `delegationTeamId`"用例，旧实现因 `ReferenceError: delegationTeamId is not defined` 失败，修复后通过。
- `session-delegation.ts` `resolveTeamDelegation`：局部 `controllerMembers` 声明为 `ResolvedTeamDelegation["controllerMembers"]`（readonly 数组）却对其 `push`，TS2339；运行时 `[]` 可变无实际错误。改为元素只读的可变数组类型，返回处自然收窄，行为与公共类型不变。类型层验证依据：desktop typecheck 报错消失即红绿，不造运行时用例。
- 验证：定向测试 29/29（service 18 + 绑定解析 11）；`bun run --cwd apps/desktop typecheck` 两处委任报错消失（仅剩 terminal-settle 等既有存量）；`check:quick` 改动文件无新增违规（守卫失败均为 WAIVER-0011/0012 与 3 份测试缺声明头等既有存量）；完整 `bun run check` 由用户另行发起，本续修门禁成功标准=两处委任报错从 check 日志消失（其余存量不在边界内，不修不续期）。
- 发布说明：不新增碎片。理由：委任功能 v0.1.5 待发未发布，缺陷存在于原任务待发提交内，用户在任何已发布版本中不可触达；既有碎片 `v0.1.5/delegation-mechanism.md` 已覆盖该功能全部可感知面。

实际修改（两提交，`task/TASK-0486-delegation-mechanism`）：

- `30a3dadb0` 件2：`packages/agent-team` lifecycle 合同与校验；store 创建/更新；`plugin-agent-presets`/`-reconcile` 铺标记；plugin-sdk manifest schema + 合同测试 + CHANGELOG + 版本 0.3.15；`PLUGIN_API_VERSION` 2.13.0；`docs/plugin/manifest.md`；Agent Center 编辑器三布局「会话方式」radio + i18n zh/en。
- `b0b04534a` 件3+件1：`packages/coding-agent` 委任成员合同/校验/per-session 注册表/成员类型装配（leaf-worker 包裹+技能白名单+displayTitle）/spawn 常驻守卫；`packages/runtime-subagents` `displayTitle` 合同与快照回填；desktop 主进程 `session-agent-profile` 双态解析、`session-delegation`（成员解析+委派指引+团队绑定身份）、service/resolve-config 透传；渲染层 worker 团队路由（`delegationTeamId` 全链）、下拉「机组调度」徽标 i18n、`worker-target` 分类；发布说明碎片 `v0.1.5/delegation-mechanism.md`。
- 件4 降级：未做 manifest 机器可读环节标签，v1 靠驾驶 LLM 读成员域描述（responsibility/description）匹配——委派指引已按此设计（roadmap 定稿允许）。

实际运行验证（全部定向，2026-11-16）：

- plugin-sdk manifest 17/17；presets 22/22 + reconcile 450 例包内；agent-team 包 109 例全绿。
- 内核新测试 28 例：成员映射/注册表复制/边界校验 9、spawn 常驻守卫 4、displayTitle 3、装配级成员 spawn+守卫+不泄漏 10（subagent-session-assembly 扩展）。
- desktop：绑定解析 11/11（persona/worker/团队三态）、路由与分类 6/6、编辑器交互 17/17；既有回归（选择器/发送链/会话服务/装配/准入观测）全绿。
- 改动文件 check:quick 多轮通过（设计守卫 D03 曾拦原生 button，改语义 radio 后消）。

未运行及原因：

- `bun run test:impact`、全量测试与完整 `bun run check`：按用户 2026-11-16 指示属单独行为，由用户自行发起。守卫链已知存量阻断（与本任务无关，分支自带）：WAIVER-0011/0012 过期；BUG-0187 五文件缺 Modified-by 头（team-sidebar-conversation-projection 等）。
- UI 实机验证（`bun run dev`）：留给用户；验证点=选 worker agent/无主控团队→默认会话驾驶+按域委派、常驻成员排队不重复起实例、有主控团队行为不变。

发布说明：`.github/release-notes/fragments/v0.1.5/delegation-mechanism.md`（新增/改进/其他三节）。

已知风险与遗留：

- 委派靠驾驶 LLM 执行指引（域匹配/排队纪律），常驻守卫只拦重复 spawn；漏委派属模型行为，实机观察。
- 成员头像不进子代理快照（data URL 会随高频快照推送放大载荷）——「UI 顶栏呈现成员名」由 title 满足，头像呈现留 P2.x。
- MCP 面按继承（成员档案 mcpServers 勾选暂不收窄子代理 MCP 面）；写域为契约纪律（constraints 由驾驶 LLM 填），无机器围栏——与 P1 取舍一致。
- 存量预设（allstar/eform）未打标记（内容决策，另行任务）；打标后其单选行为会切到机组语义。

