---
id: BUG-0198
type: bug
status: verifying
priority: P2
owner: project
requirement: REQ-0031
plan: ""
source: user-report-2026-11-25
related_requirement: [REQ-0031, REQ-0032, REQ-0033]
related_plan: []
related_tasks: [TASK-0493]
related_issues: []
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# 仓库文档引用个人机器上的文件和绝对路径

## 用户流程

- Given：用户或贡献者在另一台机器克隆仓库。
- When：阅读需求、任务、插件 README 或按文档执行操作。
- Then：仓库内权威资料和链接可以在该检出中定位；必须由用户提供的外部资料明确说明，不依赖某个人的目录布局。

## 实际行为与影响

部分管理记录把工作区外个人文件写为需求来源或主报告；插件 README 也将仓库外的工作区草稿列为来源。一些源码链接使用开发者的 `file:///` 路径，另有操作说明直接使用某台机器的 checkout 路径。其他用户无法依照这些路径查阅证据或复现步骤。自主控制器启用配置的机器绑定另记 BUG-0199，按用户决定暂不修改。

本问题不等同于 Desktop 应用运行依赖工作区文档，也不假定历史日志路径和虚构测试样例都是错误。

## 复现与证据

- 检查 REQ-0031、TASK-0479、REQ-0033 与 eform-craft preset README 的来源描述，可见指向仓库外个人工作区的引用；相关需求和现行 preset 内容在仓库内另有记录。
- PLAN-0009 的多处 `file:///` 源码链接绑定特定本机 checkout；Kotlin 远控操作文档的命令同样写死开发机 checkout。
- `project/agents.json` 的已启用适配器命令和 `scripts/ci/Initialize-YunxiaoPipelines.ps1` 默认目录包含特定机器路径；是否属于可携带配置缺陷及兼容影响见修复任务的分类核对。

## 修复合同

- 对现行文档提供仓库内可访问的事实源及可迁移的链接/命令；先确认关键信息已在仓库内，再替换不可靠的来源引用。
- 保留历史结论与证据语义；无需别人访问的本机测量环境、路径解析问题所需样本、虚构路径测试和用户明确要求的兼容标识不可盲目删除或伪装成可复现事实。
- 涉及可执行配置、进程调用或 CI/CD 的实际行为时，不静默停用功能、不访问远程服务；先明确使用合同并覆盖可复现风险。

## 验证与状态

- TASK-0493 已修复仓内来源、源码链接、可执行文档及云效辅助脚本的已确认路径问题；两项控制器适配器配置按用户要求单列 BUG-0199、暂不修改。历史故障环境样本和未入仓原始材料如实保留或说明，不冒称已迁移完整证据。
- 定向脚本回归 4/4、eform preset 14/14、Apple Skill 5/5，目标仓内链接检查及完整 `bun run check` 通过；独立只读审查未发现阻断。impact/全量行为测试、真实云效请求和远程 CI 未运行，详见 TASK-0493。当前为 verifying，等待用户验收，不声称已发布。
