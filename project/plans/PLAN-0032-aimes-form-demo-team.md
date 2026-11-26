---
id: PLAN-0032
type: plan
status: verifying
priority: P1
requirement: REQ-0035
owner: packages/plugins/presets/eform-demo
created: 2026-11-26
updated: 2026-11-26
depends_on: []
related_tasks: [TASK-0494]
---
<!-- Copyright The Open Forge contributors. -->

# AIMES 表单演示团队交付

采用独立 preset，沿用已支持的 Code Team 清单、Markdown 人设/工作流和系统插件打包；现有 `eform-craft` 不动。不给正式团队新增模式，也不复制其生产级流程。独立预置有少量新资产，但能单独启停、验证和回滚，不需要宿主分支或 SDK 变更。

[TASK-0494](../tasks/TASK-0494-aimes-form-demo-team.md) 串行交付五角色、默认 AIMES 接入合同、双语入口和双 profile 配置，验证清单、装配和制品；之后由用户在获准的 Code 会话与 AIMES 测试环境走代表性演示。回滚时停用该 preset，或撤销这一切片，不迁移正式团队或旧会话。

不操作目标 AIMES 仓库、远端或测试服务器，不新增公共协议和 ADR。若实际主壳无法加载同一份相对路径静态包，先以现有接入合同复现并修正演示入口；不要改宿主或正式团队绕过问题。
