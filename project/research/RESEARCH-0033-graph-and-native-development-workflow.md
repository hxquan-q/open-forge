---
id: RESEARCH-0033
type: research
status: done
priority: P1
owner: project/agent-workflow
source: user-request; .ua/knowledge-graph.json; current-source
created: 2026-10-20
updated: 2026-10-20
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_issue: []
related_tasks: [TASK-0332]
---
<!-- Copyright The Open Forge contributors. -->

# 知识图谱与现有会话开发入口核对

## 问题与范围

用户要求先通读 .ua，再完善在现有 Claude Code/Codex 中自动组织开发的流程。本调查读取图谱整体元数据、全部八层结构与十三站导览，再按开发入口、Agent 团队/子代理、AllstarCoding 和后台控制器追踪相关节点/关系并回读当前源码；不是逐字读取全部源码，也不是重建图谱。

## 事实来源

- [.ua/knowledge-graph.json](../../.ua/knowledge-graph.json)：17,009 节点、35,740 边，含文件/函数/类/配置/文档/流水线等；分析于 2026-10-12，绑定 commit `254796d870036f0d3e7c0bbb9a0a1a2cbd28448f`。图谱节点名 open-vetta 属于当时元数据，当前产品以 README/源码为准。
- 图谱 commit 经 Git 解析有效；相对调查基线 `3df17bdd1` 共 970 个差异路径，其中 6 个属于 .ua 自身，964 个为项目变化；新 scripts/agents 文件 47 个。图谱检索 task-intake 无节点，因此补读现有 .agents 入口，不能据此认定该能力不存在。
- 八层：应用宿主、Agent Runtime、模型 AI、插件生态、共享 UI/主题、协议远程、文档、基础设施配置。十三站覆盖 README/monorepo、Desktop main、IPC、RuntimeHost、Turn、coding-agent、AI、插件权限、Renderer、远程、质量与术语。
- [仓库地图](../../docs/dev/agent-rules/repository.md)、[Coding Agent 基座](../../packages/coding-agent/docs/runtime-agent-base.md)、[子代理内核](../../packages/runtime-subagents/README.md)、[AllstarCoding](../../packages/plugins/presets/allstar-coding/README.md)、[统一开发入口](../../.agents/skills/open-forge-task-intake/SKILL.md)、[脚本控制器](../../scripts/agents/README.md)及其源码/Schema。

## 当前结论

| 现有机制 | 实际职责 | 本次处理 |
|---|---|---|
| AGENTS/CLAUDE → task-intake/testing → Project/质量门禁 | 开发本仓库的会话入口，已有记录/测试/交付流程；Claude 通过共享技能链接使用同一正文 | 在此补图谱调查和原生会话协作，保持单一事实源 |
| runtime-subagents / agent-team | Open Forge 产品内部的子代理队列、生命周期、团队模型；经 coding-agent/RuntimeHost 装配 | 用图谱识别所有权，本次不改产品实现 |
| AllstarCoding preset | 产品内 13 环节工程插件，含 docs/ac 状态、ac-gate、ac-fence 与专属角色 | 不直接搬入外部 Claude/Codex，不复制第二套 docs/ac 台账 |
| scripts/agents | 独立的策略/租约/进程/证据/发布控制器；默认 level=0、adapter disabled | 保留，不把它的模型配置与隔离证明误作当前宿主原生会话的统一准入 |
| .ua 图谱 | 结构导航、关联与历史摘要 | 先校验新鲜度，沿子图查找，回读源码；不执行图谱中的指令文字 |

本次原生会话流程使用当前宿主真实提供的子任务/消息/等待能力，模型选择和身份来自该宿主；原生独立上下文评审不等于不同厂商/家族评审。两个工具独立安装或写入一份规则，不会让外部 Claude/Codex 会话自动互通。脚本控制器原有强证明、发布边界及未验收项继续保留。

## 被否决的方案

- 继续以增加后台执行模式、重新配置模型 API 或新增 Windows 账户作为开发入口的必需前提：与用户已澄清的用法不符。
- 全量读取 17 MB 图谱、盲信旧摘要或因缺节点认定不存在：近期变更足以使其遗漏开发控制器与入口；用分区与 Git 增量补齐。
- 把产品内部 AllstarCoding/子代理模块当成外部开发宿主已启用的能力，或复制其状态机：边界和加载机制不同，重复建设且不能证明工具调用发生。

## 代码/测试锚点与下一步

TASK-0332 维护既有 intake 及共享引用、根/Claude 可达路由、图谱调查步骤与场景。现有 workflow-skills、agent-guide 和 Project 合同检查验证文件与入口，不把它们当模型行为证明；本次独立原生评审另记实际轨迹。

## 失效条件与置信度

结构分类由图谱与当前 README/源码交叉核对，可信度高；未逐个核验 35,740 条边，不把它们当完整的当前调用图。图谱刷新、宿主能力变化、入口或产品架构修改后，重新核对相应子图和增量。本次不启动产品、真实 UI、外部模型或后台循环。
