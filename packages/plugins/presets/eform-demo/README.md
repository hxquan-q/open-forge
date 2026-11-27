<!-- Copyright The Open Forge contributors. -->
# AIMES 表单演示团队

在绑定目标 AIMES 项目的 Code 会话中新建团队会话，选择 **AIMES 表单演示团队**，与主控 `@eform-demo` 沟通。它和正式开发的 `eform-craft` 并列，不改变正式团队的入口、成员或流程。

[工作流](agent/workflows/demo.md) 使用主控、需求、原型、测试、部署五个成员。主控只沟通和协助交接；测试成员做必要的构建检查和静态代码审视，按需选用单元测试，不做实际交互或操作测试。该预置只提供提示词和工作流，不加宿主权限或运行时门禁。它不包含固定表单、测试服务器配置或已部署的 AIMES 产物。

需求和部署角色以正式 eform 的对应 Prompt 为蓝本。演示版的 [字段规格与基础资料](agent/docs/field-specification.md) 和 [完整打包、AIMES 接入与回滚](agent/docs/static-delivery.md) 随包注入对应成员的任务书，不调用正式团队的 Skills，也不增加插件权限。

## 验收走查

在获准的 AIMES 测试项目中给团队一个小任务，例如「做一个领料申请演示：列表进表单，选物料、填数量，保存后列表回显」。预期需求把物料建模为对象、名称建模为文本、数量保留数值；原型只做前端与随包 JSON mock。交付应给出同一个合并候选的前端包、本次表单的独立预览方式和 AIMES 部署文档（本次演示为纯前端 mock，后端无改动）。用户如需实机验收，可按部署文档从 AIMES 菜单进入主界面，确认演示与本机预览使用相同 mock，再选一条既有模块路径确认原接口可用；团队不代做。

在本目录运行 `bun run test`、`bun run check`、`bun run build` 可验证清单、资源与 `.vettapkg`，不需要连接 AIMES 或调用真实模型。实际模型与主壳行为需通过上述走查验证。交付为同一个合并候选的前端包、本次表单的独立预览方式和 AIMES 部署文档；本次演示为纯前端 mock，后端无改动。

## Context Boundary

```yaml
purpose: "AIMES 表单演示 Code Team：为列表、表单、Vue/JSON mock 和 qiankun 测试接入提供轻量协作提示词"
provides: []
consumes: []
internal_dependencies:
  - "@vetta-org/plugin-sdk"
  - "@vetta-org/plugin-vite"
```
