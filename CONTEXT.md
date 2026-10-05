<!-- Modified by The Open Forge contributors. -->
# Context

这是 Open Forge 的领域术语索引，不是需求、操作指令或实现事实清单。完整词条按领域放在 `docs/glossary/`，只读当前任务相关分册，并按同名标题查找；无需默认加载全部正文。

本次结构整理保留了原有词条与标题锚点，没有逐条确认历史描述仍适用于当前源码。涉及服务端或商业能力的记录仅供理解边界，不表示本仓拥有这些实现。产品工作流术语与开发 Task/Worktree 流程不同。

项目执行状态见 [Project Context](project/context/CONTEXT.md)。`[[词条]]` 是既有术语交叉引用写法，可在本索引搜索相同名称或前缀。

## 维护

定义只维护在一个分册；新增/更名后同步这里的标题及分册链接。根索引不复制定义或临时实现记录。标题用于保留旧链接定位，未经显式术语变更不要改名。`node scripts/quality/check-glossary.mjs` 检查 12 KiB 索引预算、词条唯一性、索引对应与文件链接，不证明定义的实现时效或模型理解。

## Glossary

## 会话、消息与工具调用

### ToolTimingEntry
[分册](docs/glossary/session.md)

### phase
[分册](docs/glossary/session.md)

### conspicuous duration
[分册](docs/glossary/session.md)

### meta panel (of a tool_call block)
[分册](docs/glossary/session.md)

### ctx (in a tool's `execute` signature)
[分册](docs/glossary/session.md)

### mentionedFile
[分册](docs/glossary/session.md)

### 结论 (assistant turn conclusion)
[分册](docs/glossary/session.md)

### MessageActions
[分册](docs/glossary/session.md)

### conversation cwd
[分册](docs/glossary/session.md)

### session 产物子目录
[分册](docs/glossary/session.md)

### host_request / host_response
[分册](docs/glossary/session.md)

### drop overlay (of ChatPage)
[分册](docs/glossary/session.md)

### image budget
[分册](docs/glossary/session.md)

### 交互式 session
[分册](docs/glossary/session.md)

### 工作模式（agent mode）
[分册](docs/glossary/session.md)

## 记忆与 IM 会话

### im-gateway cwd
[分册](docs/glossary/memory-im.md)

### im-gateway inbox
[分册](docs/glossary/memory-im.md)

### im_send_attachment
[分册](docs/glossary/memory-im.md)

### memory-mode
[分册](docs/glossary/memory-im.md)

### MEMORY.md
[分册](docs/glossary/memory-im.md)

### memory 工具
[分册](docs/glossary/memory-im.md)

### memory flush
[分册](docs/glossary/memory-im.md)

### session rollover
[分册](docs/glossary/memory-im.md)

### Layer1 microcompact
[分册](docs/glossary/memory-im.md)

### Layer2 压缩
[分册](docs/glossary/memory-im.md)

### 日期工作史
[分册](docs/glossary/memory-im.md)

### JOURNAL.md
[分册](docs/glossary/memory-im.md)

### 活动回合（live turn）
[分册](docs/glossary/memory-im.md)

### 消息折叠（message folding）
[分册](docs/glossary/memory-im.md)

## 托管运行时与环境

### 托管运行时（managed runtime）
[分册](docs/glossary/runtime.md)

### 运行时来源三层（runtime source tiers）
[分册](docs/glossary/runtime.md)

### 源重定向（source redirection）
[分册](docs/glossary/runtime.md)

### 环境管理（Environment Management）
[分册](docs/glossary/runtime.md)

## 交互、通知与模型展示

### 系统通知（system notification）
[分册](docs/glossary/interaction.md)

### 通知类型（NotificationType）
[分册](docs/glossary/interaction.md)

### agent 提问待确认通知
[分册](docs/glossary/interaction.md)

### agent 完成通知
[分册](docs/glossary/interaction.md)

### 通知抑制规则（前台同 session）
[分册](docs/glossary/interaction.md)

### 未看过的图（unseen image）
[分册](docs/glossary/interaction.md)

### icon symbol
[分册](docs/glossary/interaction.md)

### ask_user_question
[分册](docs/glossary/interaction.md)

### user question handler
[分册](docs/glossary/interaction.md)

### 问答面板
[分册](docs/glossary/interaction.md)

### option badge
[分册](docs/glossary/interaction.md)

### 实验性功能（experimental features）
[分册](docs/glossary/interaction.md)

### 输入预测（prompt prediction）
[分册](docs/glossary/interaction.md)

### 建议 bubble
[分册](docs/glossary/interaction.md)

### 模型分组 tag（model group tag）
[分册](docs/glossary/interaction.md)

### 推理档位（reasoning level）
[分册](docs/glossary/interaction.md)

### 快捷面板（Quick Panel）
[分册](docs/glossary/interaction.md)

### 快捷面板触发器（Quick Panel trigger）
[分册](docs/glossary/interaction.md)

### 最近会话面板（Quick Panel recent list）
[分册](docs/glossary/interaction.md)

## 个性化与 Provider 配置

### 个性化（personalization）
[分册](docs/glossary/personalization.md)

### 人设（persona）
[分册](docs/glossary/personalization.md)

### 自定义指令（custom instructions）
[分册](docs/glossary/personalization.md)

### 个性化懒重建（personalization lazy reload）
[分册](docs/glossary/personalization.md)

### 预设模板（provider template）
[分册](docs/glossary/personalization.md)

### 远程网关（remote gateway）
[分册](docs/glossary/personalization.md)

## Skills、能力分发与授权

### 技能管理字段（skill management fields）
[分册](docs/glossary/skills.md)

### market description
[分册](docs/glossary/skills.md)

### skill version（技能版本口径）
[分册](docs/glossary/skills.md)

### skill category（技能分类）
[分册](docs/glossary/skills.md)

### skills-manifest
[分册](docs/glossary/skills.md)

### skill download_count（下载量）
[分册](docs/glossary/skills.md)

### 通用 Agent Skill 作用域（generic agent skill scope）
[分册](docs/glossary/skills.md)

### Ability（能力）
[分册](docs/glossary/skills.md)

### Capability（授权契约）
[分册](docs/glossary/skills.md)

### bundle（能力套装）
[分册](docs/glossary/skills.md)

### 能力安装台账
[分册](docs/glossary/skills.md)

## 插件与扩展

### 可信插件（trusted plugin）
[分册](docs/glossary/plugins.md)

### 文件预览插槽（file preview slot）
[分册](docs/glossary/plugins.md)

### 活动面板插件 tab（plugin activity tab）
[分册](docs/glossary/plugins.md)

### 移动UI预览（mobile UI preview）
[分册](docs/glossary/plugins.md)

### 静态文件协议（vetta-file://）
[分册](docs/glossary/plugins.md)

### 对话插件 API（conversation plugin API）
[分册](docs/glossary/plugins.md)

### 插件内聚 MCP（plugin-scoped MCP）
[分册](docs/glossary/plugins.md)

### 系统插件（system plugin）
[分册](docs/glossary/plugins.md)

### 预置插件（preset plugin）
[分册](docs/glossary/plugins.md)

### 插件市场（plugin marketplace）
[分册](docs/glossary/plugins.md)

### 插件版本口径（plugin version semantics）
[分册](docs/glossary/plugins.md)

### 引导词（guidingWords）
[分册](docs/glossary/plugins.md)

### 插件设置（Plugin Settings）
[分册](docs/glossary/plugins.md)

## 图像、音频与媒体

### 黑胶播放器（vinyl player）
[分册](docs/glossary/media.md)

### 媒体流协议（media streaming protocol）
[分册](docs/glossary/media.md)

### 图像生成插件（Image Generation Plugin）
[分册](docs/glossary/media.md)

### 图像模式（Image Mode）
[分册](docs/glossary/media.md)

### 图像编辑 attach（Image Edit Attach）
[分册](docs/glossary/media.md)

### 图像预览 swiper（Image Preview Swiper）
[分册](docs/glossary/media.md)

### 文生图 / 图改图（Text-to-Image / Image-to-Image）
[分册](docs/glossary/media.md)

### 生成轮次（Generation Turn）
[分册](docs/glossary/media.md)

### 编辑谱系（Edit Lineage）
[分册](docs/glossary/media.md)

### 主进程图像服务（Image Service）
[分册](docs/glossary/media.md)

## 结果卡片

### 卡片描述符（card descriptor）
[分册](docs/glossary/cards.md)

### details.cards（卡片产出契机）
[分册](docs/glossary/cards.md)

### 预备描述符（pending card descriptor）
[分册](docs/glossary/cards.md)

### 卡片渲染器注册表（card renderer registry）
[分册](docs/glossary/cards.md)

### 卡片跨轮去重（card cross-turn dedup）
[分册](docs/glossary/cards.md)

### 卡片收纳（card stacking / 收纳）
[分册](docs/glossary/cards.md)

## 产品工作流与派遣

### 工作流（workflow）
[分册](docs/glossary/workflow.md)

### 派遣（dispatch）
[分册](docs/glossary/workflow.md)

### 上下文快照 fork
[分册](docs/glossary/workflow.md)

### 工作流进度
[分册](docs/glossary/workflow.md)

### 工作流 items
[分册](docs/glossary/workflow.md)

### 工作流标签卡
[分册](docs/glossary/workflow.md)

## 设计文件与画框

### .vetd（Vetta Design 文件）
[分册](docs/glossary/design.md)

### 旁挂目录（.vetd.d）
[分册](docs/glossary/design.md)

### Frame（设计画框）
[分册](docs/glossary/design.md)

### 共享引擎（design engine）
[分册](docs/glossary/design.md)

## 外部服务与商业边界

### 官方网站（site）
[分册](docs/glossary/service-boundary.md)

### Google 登录
[分册](docs/glossary/service-boundary.md)

### Vetta Go / Token Plan
[分册](docs/glossary/service-boundary.md)

### 站内信（in-app notification）
[分册](docs/glossary/service-boundary.md)

### 取消（cancel）与退款（refund）
[分册](docs/glossary/service-boundary.md)
