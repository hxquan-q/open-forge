---
id: REQ-0034
type: requirement
status: in_progress
priority: P1
owner: desktop
source: user-request-2026-11-16
created: 2026-11-16
updated: 2026-11-16
related_plan: []
related_tasks: [TASK-0486]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# 默认会话委任机制（自适应流水线 P2）

## 用户问题与结果

P1（ap-* 六技能，`08ae76480`+`711311f9c`）让默认 code 会话按任务轻重自适应启用环节。P2 解决"选了智能体/团队之后会话归谁"：现状是单 agent 人格接管、团队整队接管，用户选一个域专家（如 eform 域成员）就失去默认会话的轻量调度。

目标语义（用户 2026-11-16 已认可，设计定稿见工作区 `adaptive-pipeline-roadmap.md` §3/§4 统一模型）：

| 会话形态 | 驾驶员 | 任务执行 |
|---|---|---|
| 无指定（默认） | 默认 code 会话 | P1 行为不变 |
| 指定 worker 型 agent / 无主控团队 | 默认 code 会话（轻量调度） | 任务落在成员域→按域委派：常驻型=spawn 一次 durable 会话+followup_task 顺序排队；一次性型=按定义起 one-shot；域外→通用子代理兜底 |
| 指定有主控成员的团队（@allstar 型） | 主控成员接管 | 维持现状（Team 会话编排），默认 code 逻辑不覆盖 |

worker/主控的判定：`lifecycle` 标记（常驻 `resident` / 一次性 `oneshot`）。**缺省不带标记 = 主控/接管型，完全保持现状**——存量插件预设与用户档案零行为变化；标记是加入委任模型的显式 opt-in。团队是否有主控由队长档案是否带标记推导。

## 范围

- 件1（内核）：会话按成员定义（persona+技能+生命周期）动态注册子代理类型（`SubagentTypeRegistry` per-session 扩展）；spawn 子代理顶栏/卡片呈现成员名；常驻成员不重复起实例（重复 spawn 引导 followup_task）。不碰 agent-bus、不做跨会话。
- 件2（合同）：Agent Center profile 与插件 manifest `agents[]` 增加生命周期标记；含 PLUGIN_API_VERSION、插件手册、SDK CHANGELOG 等对外合同全套同步。
- 件3（产品语义）：新会话下拉"选人格"→"选机组"——worker 型 agent 与无主控团队走"默认会话保持驾驶+按域委派"；有主控团队维持 Team 会话接管。
- 配套：主控型成员不塞叶子位（general 型子代理 persona 明确 leaf worker；委派指引声明"路由匹配到主控成员→建议整会话接管"）；同成员多任务默认顺序执行，并行仅用户明说；ap-contract/ap-router 预留位按需启用，不重写技能正文。
- 件4（能力标签）允许降级：v1 靠 LLM 读 responsibility/description 文本做域匹配。

## 不做什么

不动 ap-* 技能资产正文；不迁移/修改存量预设插件的 agents 声明（是否给 allstar/eform 成员打标记是后续内容决策，另行任务）；不做跨会话全局常驻 agent（P3 真agent-bus）；不做 manifest 机器可读环节标签（件4 降级）；成员头像进子代理快照暂不做（快照高频推送会放大 data URL 载荷，记入 roadmap 遗留观察项）。

## Given / When / Then

1. Given 档案带 `lifecycle` 标记的单个 agent 被选为新会话 target，When 创建会话并发出首条消息，Then 会话由默认 coding agent 驾驶（无人格 addon、能力面为默认），系统提示含该成员的委派指引；LLM 可 `spawn_agent(agent_type=<成员类型>)` 按成员定义起子代理，子代理带成员 persona 与成员技能白名单。
2. Given 成员为常驻型且已有同类型子代理存在（任意状态），When 驾驶会话再次对该成员 spawn，Then 内核拒绝并引导使用 `followup_task`（排队语义：在跑则等待、顺序完成、绝不重复起实例）。
3. Given 无主控团队（队长档案带标记）被选为 target，When 发送首条消息，Then 走普通会话链路：默认会话驾驶，全部 worker 成员注册为可委派类型；有主控团队（队长未标记）行为与现状完全一致（Team 会话编排）。
4. Given 未标记的 agent/团队，When 被选中，Then 行为与 P2 之前逐字节一致（人格 addon 接管 / Team 会话）。
5. Given 插件 manifest 声明 `agents[].lifecycle`，When 插件启用同步，Then 标记随预设铺进档案；写错值被清单校验拒绝。

## 必须保持的不变量

- 未标记资产零行为变化；`SubagentTypeRegistry` 组合级注册表不得被会话级成员污染（per-session 覆盖层）。
- 团队/主控会话链路（agent-team runtime）不动；单 agent 普通会话链路的恢复降级语义（AGENT_PROFILE_UNAVAILABLE 新建报错、恢复降级）保持。
- spawn 契约 v1 槽位、`followup_task` 排队语义、报告/通知合同不变；成员子代理仍是单层委派（子会话关闭再委派）。
- 包依赖方向：`packages/coding-agent` 合同不 import apps；desktop 主进程持有成员解析，渲染层只传身份。
- 插件边界：manifest 新字段 fail-closed 校验，PLUGIN_API_VERSION 推版本，权限最小集不变。

## 验收标准

- 件1 动态注册与 spawn 子代理行为合同测试；件2 排队/不重复起实例的状态转换测试；件3 交互测试 + 下拉文案全部走 i18n 零硬编码（见 TASK-0486 验证节）。
- 定向测试绿 + 完整 `bun run check` 绿；发布说明碎片落 `.github/release-notes/fragments/`。
- UI 实机验证（bun run dev）由用户手动执行，Agent 不主动启动。

## 风险与失效条件

- 委派指引是提示词纪律：驾驶 LLM 可能漏委派或乱委派，靠指引明确性 + 常驻 spawn 守卫兜底；实机验证留给用户。
- 技能白名单走 skillPolicy allow 列表：成员档案勾选了不可用技能时按 allow 语义降级（列表内的不可见即不可调），不阻断会话创建。
- lifecycle 标记是产品语义开关，打错标记会改变该资产被选中时的会话形态；文档与 UI 文案必须讲清"标记 = 加入机组、缺省 = 人格接管"。
