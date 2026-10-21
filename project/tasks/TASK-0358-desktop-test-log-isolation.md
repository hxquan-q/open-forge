---
id: TASK-0358
type: task
status: verifying
priority: P2
owner: desktop-testing
requirement: REQ-0002
plan: PLAN-0020
source: user-request; RESEARCH-0035 修复授权
related_requirement: [REQ-0002]
related_plan: [PLAN-0020]
related_tasks: [TASK-0350]
related_issues: []
related_bugs: [BUG-0140]
execution: serial
branch: main
worktree: .
base_commit: a524856ef0cd94a182ebc35380494fda7ec9f21c
read_paths: ['apps/desktop/vitest.config.ts', 'apps/desktop/src/test', 'apps/desktop/src/main/logger.ts']
write_paths: ['apps/desktop/src/main/conversations/session-archive-service.test.ts', 'apps/desktop/vitest.config.ts', 'apps/desktop/src/test', 'apps/desktop/src/main/logger.ts', 'project/tasks/TASK-0358-desktop-test-log-isolation.md', '.github/release-notes/v0.1.3.md']
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# Desktop测试日志与真实数据根隔离

## 目标与范围

来源为[RESEARCH-0035](../research/RESEARCH-0035-fourteen-day-log-performance-audit.md)及用户「请你立项修复」。实现本concern的可复现修复、配套回归与交付记录。当前行为/期望以正文合同及后续复现为准，未知唯一根因不提前写死。

## Given / When / Then

- Given：受影响的正常入口与受控资源/系统/时间替身，不使用真实用户状态。
- When：测试通过真实logger写入时只落临时测试根，默认/Dev日志零新增；并发worker互不干扰、保留被测日志合同。
- Then：上述公开行为可由旧实现失败、新实现通过的隔离回归证明，并覆盖成功→失败/重载→恢复的连续流程。

## 必须保持

- 角色、工具调用、取消、错误、usage/stop与原有持久化兼容语义不变；权限最小化，不禁用安全校验。
- 不读取凭据/会话正文；日志只含必要身份/阶段聚合，不保存用户内容。
- 不删除测试、不提高阈值、不修改生成文件消除失败。

## 并发评估

- 条件支持独立只读调查；生产实现由当前Coordinator在main串行执行，不共享目录并行写代码。
- 本轮原生只读子任务仅查看源码/测试并返回证据，不修改文件/Git、不运行真实实例。
- branch/worktree：main / 当前主检出。共享Project索引与最终集成由Coordinator维护。归属Open-Forge-only；不创建代码Worktree。
- 顺序依PLAN-0020；真实发现扩大写域/合同前更新本记录。没有任务依赖不等于同时写入。

## 输入输出与不做项

- 输入：当前源码/测试、既有Bug/Task、脱敏日志证据；输出：修复、回归、指标/边界及验收包。
- 不做：真实Provider/SSH/UI测试、依赖升级、发布/制品上传、私有业务服务端、历史已修复项重做、生成用户页面源码修改。

## 测试与验证

- 实际定向入口：Desktop在apps/desktop执行`bun ../../scripts/quality/run-vitest.mjs --run <相关测试文件>`；资源与SSH在各包目录执行同一Node runner。实际结果见交付记录；未使用裸bun test。
- 修改后：定向回归、代表性用户流程、`bun run test:impact -- <本Task实现路径>`、中间`check:quick`，交付前完整`bun run check`；组合按影响执行test:changed。
- 性能切片保留相同受控条件的前后调用数/耗时证据，不以生产收益承诺代替测量。

## 验收分层与验收包

- 定向工程验证通过，独立复审未发现剩余阻断；本次提交集成本地main。组合门禁详见PLAN-0020交付记录，工程完成不等于人工接受。
- 内部测试基础设施无需人工功能验收；需定向与Desktop组合回归完成后才闭合，发布未授权。
- 入口：该Task的正常功能入口；执行上列连续流程，结果及失败恢复须符合合同。详细入口/限制在完成时回写。

## 交付记录

在 setup 中先建立每文件临时VETTA_HOME，顺序执行后续setup；退出时核验绝对父目录后清理。真实logger写文件回归旧配置先红，隔离后连同进程健康与marketplace连续流程3文件8例通过。

## 原生协作与复审

/root/identity_diagnosis、/root/plugin_diagnosis、/root/remote_diagnosis完成分域只读调查；/root/repair_review独立审查实际diff。发现并修复分页reset失败loading与请求淘汰、合法marker夹具与mock类型、绘制Hook接线覆盖、context路径重复及并发失败继续派发、Hook staged activation迟到commit。复审未发现可确认剩余阻断；上述角色均未改文件/Git、未代跑测试，不声称异模型家族评审。组合测试与完整check结果待最后回填。

## 当前候选门禁与入口

- 隔离候选：main的3c3a50d47加本次源码与新增测试；完整`bun run check`的lint、全部类型、guards、mobile lint均通过。候选副本Desktop测试有12个文件因复用的工作区包缺少构建产物而无法解析；这不作为源代码失败或通过证据。
- 候选副本仅隔离源码，复用128处已安装node_modules链接；初次副本缺深层依赖/符号链接的检查失败已补齐后重跑通过。未改检查阈值。
- 影响命令：`bun run test:impact -- apps/desktop/vitest.config.ts packages/coding-agent/src/resources/runtime/context-resources.ts packages/ssh-transport/src/ssh-connection.ts`自动回退test:changed。Coding Agent 252文件1620通过/3既有跳过，Runtime Desktop 13文件51通过；SSH首次误用系统WSL bash失败，改进程PATH选择既有Git Bash后21文件236通过/25既有跳过。CLI两个超时用例分别单跑通过；Desktop组合回归结果见下文。
- 实际源码/测试路径以本Task write_paths与本提交为准；承载本记录的原子提交完成绑定。未运行真实UI/Provider/远端SSH或发布。

## 组合验证中新增的必要测试兼容修正

真实主工作区完整check揭示另一会话提交45fbcb77e的3个带`?instanceB`字面量import触发TS2307。本片只修测试模块重载接线：保留`vi.resetModules()`、homeB环境、A导出/B导入与所有断言；删除无必要的query后缀，使服务、paths与config使用重载后的同一模块图，同时保持静态类型。相较忽略类型/声明通配模块/动态字符串逃避检查，直接普通模块标识更小且保留类型合同。不会回退/夹带他人用例或更改产品源码；该追加的独立只读判断与定向验证结果见后续交付。

- 兼容修正结果：/root/repair_review只读确认resetModules会重建B模块图、保留mocks，普通模块导入可共享正确的B配置/事件状态。源码check的TS2307为失败基线；仅删除3处query，新增B默认会话目录必须位于homeB的隔离断言，原断言全部保留。

- 恢复静态类型后，完整check进一步指出同一新增迁移夹具的3个目录解析端口以同步函数实现Promise合同（5处调用报错）；夹具改为async包装，返回目录及所有断言不变，不改产品端口或放宽类型。
- 当前主工作区最终验证（2026-10-22）：`bun ../../scripts/quality/run-vitest.mjs --run src/main/conversations/session-archive-service.test.ts src/test/log-home-isolation.test.ts`（`apps/desktop`）2文件12例通过；`bun run check`通过（lint、全部类型、guards、mobile lint）。
- 较宽Desktop回归曾有`src/main/browser-automation/webview-live-edit.test.ts`的3个5秒超时；该文件属于其他Task，本Task未改动。该组合结果仍待稳定后复验，因此本Task保持`verifying`。未运行真实Desktop UI、Provider、远端SSH或发布。
