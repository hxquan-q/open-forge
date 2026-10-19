---
id: REQ-0017
type: requirement
status: ready
priority: P1
owner: desktop
source: user-request（2026-10-16：在桌面端新增「智能客服」入口，直连公司 WeKnora 知识平台向知识库智能体提问）
related_requirement: []
related_plan: []
related_tasks: [TASK-0318]
related_issues: []
related_bugs: []
created: 2026-10-16
updated: 2026-10-19
---
<!-- Copyright The Open Forge contributors. -->

# 桌面端「智能客服」直连 WeKnora

## 用户问题

需要使用知识库的同事要在 Open Forge 与 WeKnora 网页之间来回切换：问题在 Open Forge 里，答案在另一个网页里，复制粘贴与溯源都靠手工。WeKnora 已提供 REST + SSE 的会话问答接口，但桌面端没有任何接入方式。

## 用户结果

在桌面端侧边栏有一个「智能客服」入口，选好智能体、输入问题即可得到**逐字流式**的回答；模型检索过程中的旁白与最终回答**分区显示**；可以开多个对话并在历史对话之间切换；敏感操作（打开历史对话会替换当前对话）先经确认。全程只需要填写 WeKnora 地址与一个租户 API Key，凭据存入系统加密存储。

## 范围

1. **连接层**（`apps/desktop/src/main/weknora/`）：建会话 / 列会话 / 载消息 / 列智能体四个 REST 调用、SSE 增量解析、错误归一化；不引入新依赖，可脱离 Electron 单测。
2. **通道层**：按既有注册链暴露 8 个调用频道与一条流事件推送通道；`get-config` 只回传「是否已配置」，绝不回传密钥明文。
3. **界面层**（`renderer/domains/weknora/`）：侧边栏入口（默认置顶）、智能体选择器、提问与流式渲染、思考/回答分区、取消、新建对话与历史会话（点历史先确认）。
4. **文案**：全部走 i18n，中文为基准并维护英文镜像。

**明确的边界**：

- **不改 WeKnora 侧任何配置**，只做只读调用。
- **不建第二套事实源**：历史从 WeKnora 读取，本地不持久化会话；凭据复用既有加密存储，不自建。
- **不新增执行内核**：流事件沿用既有的「主进程自产事件 → 渲染进程增量消费」通道，不经过 TurnPipeline。
- 首版不含：引用来源角标（上游平台在智能体路径下不产生引用，见 TASK-0318 交付记录）、更完整的冷门错误提示。

## Given / When / Then

- **Given** 已配置地址与租户 API Key；**When** 选择智能体并提问；**Then** 回答逐字出现，结束后思考区自动收拢、正式回答铺开，展开思考区可见检索旁白。
- **Given** 一段长回答正在流式；**When** 离开页面再返回；**Then** 仍可取消、仍可继续提问，不留「生成中」挂起态。
- **Given** 已有若干历史对话；**When** 点击其中一条；**Then** 先弹确认并说明会替换当前对话，取消则不做任何改动。
- **Given** 尚未配置；**When** 进入页面；**Then** 给出中文引导且**不发起任何网络请求**。

## 验收

工程侧：全部验收标准见 `docs/devflow/weknora-customer-service/01-spec.md`（25 条，21 条通过、4 条属上列首版不含项）；自动化测试 149 例全绿；静态审查发现项按用户圈定修复并复验。人工侧：待同事在部署环境确认。
