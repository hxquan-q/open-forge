---
name: open-forge-task-intake
description: Open Forge 开发入口。按分析、轻量维护或行为变更选择最少必要调查与验证；实施前续接或建立 Task，推进实现、审查和交付。适用于功能、缺陷、测试、重构、CI/CD、性能、AI 反馈及文档/技能维护；纯闲聊不触发。
---
<!-- Copyright The Open Forge contributors. -->

# Open Forge 统一开发入口

当前会话负责完成已授权目标。根/最近一级 AGENTS 定义边界；本入口只决定任务路线和下一份材料。外部 Skill 提供方法，不覆盖仓库合同。

## 先分范围

| 请求 | 读取与产出 |
|---|---|
| 问答、分析、评审、仅计划或运行已有验证 | 只读命中源码与证据；需要持久化时按 [记录路由](../../../project/CONVENTIONS.md#记录路由选择哪种文档)落盘，纯问答可直接回复。记录完成不自动进入实施 |
| 文档、技能、无逻辑配置或已知文件的局部维护 | 从目标文件与已有来源开始；用 [Task 入口](../../../project/tasks/README.md#按需读取)查询或建立轻量合同。无行为变化时核对链接、命令和事实 |
| 功能、Bug、测试、重构、性能或公共合同变化 | 沿实际入口查所有者、生产者/消费者和现有测试；按下表选专项规则，Task 记录受影响行为及最低充分验证 |

轻量与否由行为风险决定。涉及错误、权限、兼容、取消或状态转换时进入行为路线，不以 diff 小省略必要验证。

## 实施四步

1. **核对现场**：运行 `git status --short`，读取目标最近规则与当前源码；续接时回读 Task、实际 diff 和已有证据。已知路径直接调查；陌生跨模块问题或所有权不清时才读 [图谱辅助](references/knowledge-context.md)，图谱缺失/过期不阻断源码调查。
2. **落盘合同**：按 ID/主题检索已有来源与 Task，只读命中记录；新记录按 Project 的 [元数据](../../../project/CONVENTIONS.md#3-frontmatter-规范)与 [记录路由](../../../project/CONVENTIONS.md#记录路由选择哪种文档)选择最小组合。相关 Task 在修改交付文件前记录目标/不做项、Owner、输入输出、Given/When/Then、保留合同、验证及执行范围；轻量串行任务用短范本，并行/迁移用完整模板。达到 ready 标准后置 `in_progress`、同步焦点行、回读确认并向用户报告 ID 与串行/并发结论；随后自主实施。
3. **完成切片**：一次完成一个可验证行为，按根规则的编码纪律直接实现。新行为/Bug 先有失败测试或明确基线，纯重构使用已有基线。按下表加载所需规则；共享写域串行，授权的并行写入才使用独立 Worktree。范围/依赖/验证发生实质变化时更新 Task，独立 concern 另拆。
4. **验证交付**：按 [测试政策](../../../docs/dev/agent-rules/testing.md)运行最低充分检查，代码任务执行完整 check；按 [交付合同](references/delivery.md)记录实际结果、审查、未运行项及风险，更新状态与索引、提交。发布说明走 [交付规则](../../../docs/dev/agent-rules/delivery.md)；工程完成、人工接受与发布分别记录，必需验证失败不宣称完成。

Task 的必要内容与状态唯一来源是 [实施前记录](../../../project/CONVENTIONS.md#实施前记录)。授权和合同明确后继续执行，技术细节自行调查；只有仍影响行为、公共合同、数据兼容、安全、费用或不可逆结果的歧义才提问。若此前先改后记，如实补记实际 diff 与缺失证据，再继续，不能倒填或覆盖他人修改。

## 按需入口

| 触发条件 | 下一入口 |
|---|---|
| 实现、重构、协议/存储/权限变化 | [工程规则](../../../docs/dev/agent-rules/engineering.md)；先确认调用方和责任边界 |
| 行为变化、直接写测试或 AI 质量反馈 | [测试技能](../open-forge-testing/SKILL.md)；软件合同与真实模型效果分开取证 |
| 报错、回归、性能退化 | [diagnose](../diagnose/SKILL.md)；先复现/基线再调整 |
| CI/CD、打包、发布准备 | [流水线路线](references/ci-cd.md) |
| Expo/EAS | [Expo 入口](../expo-overview/SKILL.md) |
| UI 交互 | 目标最近的设计规则与 [测试政策](../../../docs/dev/agent-rules/testing.md)；实机验证仍须当前任务授权 |
| 委派、代码完成后的独立审查、多 Task 集成或中断协作恢复 | [原生会话协作](references/session-coordination.md)；先记录再派工，使用宿主真实能力 |
| 跨阶段规划、新记录类型、状态/关系不清 | [Project 入口](../../../project/README.md)与 [管理规范的对应章节](../../../project/CONVENTIONS.md) |
| 显式要求启动后台控制器 | [自主协议](../../../docs/dev/agent-rules/autonomy.md)；普通开发会话不依赖该控制器 |

选择最相关路线，领域 Skill 缺失时用仓库文档与已有测试推进并说明限制；不自动安装技能或调用收费服务。Go/Kotlin 使用包内工具链。

## 执行与纠偏

- 已确认的当前调用方、类型和数据决定实现范围；按 [根编码纪律](../../../AGENTS.md#编码纪律)与 [防御代码判断](../../../docs/dev/agent-rules/engineering.md#防御代码的判断)处理可达失败，保留边界校验与清理。
- 相同候选和条件下已通过的证据继续复用；新修改、新失败或新风险出现时只重验受影响范围，并完成必需门禁。失败先区分自身回归、既有问题与环境阻断，无新证据时停止重复尝试，调整假设或报告阻断。
- 单次证据写入 Task；可复用基线才另建 VERIFY。长期决定按现有 Task/Plan/ADR 归属记录，不新增平行台账。
- 当前目标内依赖已满足且已授权的工作持续推进；不因准备好计划、派出子任务或完成记录就结束，也不自动领取无关 backlog。

## 维护与验证

`.agents/skills` 是权威正文，Claude 通过 `.claude/skills` 共享链接读取。运行 `node scripts/quality/workflow-skills.mjs` 只读验证路径；不创建镜像。

[验收场景](references/scenarios.md)用于人工走查或已授权模型对照；静态检查只证明文件合同，不证明模型遵循。设计证据见 [RESEARCH-0048](../../../project/research/RESEARCH-0048-agent-guidance-and-development-paradigms.md)。
