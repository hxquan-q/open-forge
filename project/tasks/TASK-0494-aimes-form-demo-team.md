---
id: TASK-0494
type: task
status: verifying
priority: P1
owner: packages/plugins/presets/eform-demo
requirement: REQ-0035
plan: PLAN-0032
source: user-request
related_requirement: [REQ-0035]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: unassigned
worktree: unassigned（主检出串行）
base_commit: 57468fe3b
read_paths: [packages/plugins/presets/eform-craft, docs/plugin, packages/plugins/plugin-sdk]
write_paths: [packages/plugins/presets/eform-demo, packages/plugins/tenants.json, bun.lock, docs/architecture/dependents.md, project, .github/release-notes]
exclusive_paths: [packages/plugins/presets/eform-demo]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-26
updated: 2026-11-26
---
<!-- Copyright The Open Forge contributors. -->

# 新增 AIMES 轻量表单演示 Code Team

## 合同

- 归属：Open-Forge-only。串行单切片实施，清单/工作流/资源和租户注册同一交付；当前主检出 `chenxvhua`，不切分支、不提交、不操作远端。
- Given common 租户选择 Code Team，When 选中 AIMES 表单演示团队并发起表单需求，Then 以 `@eform-demo`、五个专属成员与演示工作流完成需求、原型、核心测试和部署交付。正式 `@eform` 仍走原团队，不嵌套调用。
- Given 使用对象字段的常见演示，When 合并 `master` 后交付，Then 按同一候选构建完整 CustomDev 前后端，只有本次表单使用已内置的 JSON mock；本机预览与 AIMES 菜单的演示行为一致，既有模块保留真实后端。单独打开不计为 AIMES 接入通过。部署文档包含真实接入参数和未验证项。
- 只新增声明式预置和薄打包入口，不改 SDK、宿主、正式团队或真实 AIMES；演示本身不新增后端、数据库或生产流程。
- 验证：先确认租户未注册的基线，以 SDK 公共 manifest 解析验证 Code Team、locale、成员、工作流及引用，补关键演示合同断言；包内测试、类型检查、实际构建和归档内容核验，按用户偏好运行 `check:quick`，不启动完整 check、impact 或全量测试。真实模型和 AIMES 菜单需要另行实机验收。

- 主控验收反馈：从正式 `eform.md` 原样复制到演示主控，再在副本逐条改写。保留由主控识别 Code 项目、确认当前授权并交接上下文；完整 AIMES 演示先核对绑定的 CustomDev 项目，不要求运行后端。没有目标接入事实不能自行降级，只有用户明确只要预览时才可从获准的演示目录制作独立原型。删除正式预检、共享合同/Skill 依赖和主控复审。验证先加主控边界的定向合同，再修改副本并重跑该合同和制品核验。

- 需求与部署验收反馈：从正式角色 Prompt 原样复制再适配，派生字段规格与静态交付指南，随预置打包并注入对应成员任务书，不加插件权限。需求保留附件证据、对象与展示属性、影响业务的取值规则和未决项；部署保留真实注册/静态资源核验、合并后构建、菜单内验收和回滚。移除正式版的数据库核验、后端制品、服务重启、dev PR；不改主控及其他成员。先跑失败合同，再验证角色任务书装配、链接和归档；不在真实环境执行。

- 交付口径修正：mock、无新增后端是**本次演示表单**的开发边界，不是整个项目的打包边界。合并 `master` 后用同一候选打完整 CustomDev 前后端；既有模块、接口、配置及运行依赖保留，不用演示静态目录代替项目制品。继续支持独立本机预览；测试环境验收同时冒烟一条依赖既有后端的代表性路径。此次只修改演示预置、需求/任务记录和发布说明，不实际打包或部署 AIMES。

- 测试口径修正：测试成员只做必要的构建检查和静态代码/制品审视，能不做单元测试就不做，确有必要时按需求自行决定。整支演示 Team 不执行实际交互/操作测试，不改完整前后端打包和默认 AIMES 接入；把运行态验收步骤随文档交用户，标记未执行。

## 交付

- 实施：新增 `eform-demo` 预置及五份人设、工作流、中英文入口；登记 common 开发与生产 profile，离线安装生成 workspace 锁条目和反向依赖图。正式 eform 目录、SDK 和宿主无改动。补 v0.1.5 发布说明碎片并汇编正文。
- 基线与工程验证：改动前两个 profile 都无 `eform-demo`；新预置 `bun run test` 6/6、原 `eform-craft` 定向合同 14/14；新包 `bun run check`、定向 Biome 与根 `check:quick` 通过。确认工作流、字段类型、mock 与接入不变量、Git 顺序及发布配置；静态文本合同不证明模型执行。
- 制品：`bun run build` 成功，`release/eform-demo-0.1.0.vettapkg` 含 19 个运行时文件。归档 CRC、清单、成员 Prompt、工作流、双语值以及 Federation 入口通过核验。未 staging、未发布。
- 评审与集成：自审清单、流程与实际差异；工作区候选未提交，未操作远端。`test:impact`、全量测试和根完整 `bun run check` 按用户限定未运行。
- 人工验收待做：按预置 README 从 Code 会话选中团队，用小型领料申请跑通列表、表单、对象字段和最终静态包交付；在已授权 AIMES 测试环境从真实菜单验收。未启动 Desktop、未调用真实模型、未部署或访问 AIMES 环境。
- 主控修订复验：对正式 Prompt 与演示副本做原样复制的字节比对，再逐条修改副本。新增项目识别断言在旧演示主控上 1 项失败，改后演示合同 7/7，包内类型检查和构建通过，归档内主控 Prompt 与源码一致。发布说明已更新；未操作正式团队、未提交或部署。
- 需求与部署修订复验：原样复制两份正式 Prompt 和两份指南的源 Skill，逐条适配后以 `instructionsPath` 将字段规格与静态交付指南交给对应成员；无权限变更。新合同基线 2 项失败，改后 9/9、包内类型检查和定向 Biome 通过。预置构建成功，归档 21 文件通过 CRC、成员绑定、提示词/指南内容和相对链接核验。同步 v0.1.5 发布说明；未运行真实模型和 AIMES 菜单验收、未提交或操作远端。
- 完整交付边界复验：新增合同在前端静态包口径上 1 项失败，修正原型、部署、测试和交接后 10/10；包内类型检查、定向 Biome 和预置构建通过，归档 21 文件的清单、Prompt、指南、链接和双语文案均已核验。v0.1.5 说明同步。没有实际构建或部署 AIMES 制品，也没有改动正式 eform。
- 测试边界复验：旧行为新合同 1 项失败，改后 11/11；包内类型检查、定向 Biome、预置构建和归档内容核验通过。已同步工作流、部署指南、双语文案和 v0.1.5 说明。未启动应用、未做交互或操作测试、未构建或部署 AIMES。
- 本地存档：用户于 2026-11-26 授权在 `chenxvhua` 做单笔本地提交，不推送、不发布；集成仍为 pending，运行态验收仍留给用户。
