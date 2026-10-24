---
id: TASK-0401
type: task
status: verifying
priority: P1
owner: desktop-conversation
requirement: REQ-0002
plan: PLAN-0002
source: user-request; RESEARCH-0044 后续实施授权
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
related_tasks: [TASK-0398]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: .
base_commit: ea67d951e8bb29a464219812465d3a4ae2939179
read_paths: [apps/desktop, packages/theme-ui, project, docs]
write_paths: ["apps/desktop/src/renderer/root-layout/useRootLayoutModel.ts","apps/desktop/src/renderer/root-layout","apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts","apps/desktop/src/renderer/domains/conversation/hooks/useSessionManager.session-switch.test.ts","project/tasks/TASK-0401-bounded-session-auto-restore.md","project/tasks/README.md","project/plans/PLAN-0002-performance-reliability.md","project/research/RESEARCH-0044-desktop-startup-resource-audit.md",".github/release-notes/v0.1.3.md"]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-24
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# 自动恢复会话的有界历史加载

## 目标与范围

自动恢复上一会话时采用既有有界 tail，避免元信息尚未就绪时默认完整历史；保留用户主动完整加载、分页、流式与草稿语义。

- 来源：[RESEARCH-0044](../research/RESEARCH-0044-desktop-startup-resource-audit.md)；用户已要求列 Task 并实施三个 P1 优化。
- 输入：当前实现、既有行为测试、脱敏调查证据；输出：最小实现、可失败回归、受控前后证据和验收包。
- 直接修改优先；只在同步IO/重依赖或恢复入口职责阻碍测试时提取必要接缝，不新增通用调度框架。
- 不做：次级缓存/隐藏窗口/知识库优化、监控协议重写、依赖升级、真实用户状态/Provider/SSH/UI测试、完整打包与发布。
- 不变量：安全沙箱与权限不变，角色/工具/错误/取消/usage/stop不变；不更改磁盘会话格式，不删功能/断言，不以扩大超时或缩小堆上限换取指标。

## 并发与执行

- 条件支持只读设计/审查并行；三个 Task 的产品代码由 Coordinator 在 main 串行写入，避免共享工作区并行写代码及脏目录集成。
- 无代码 Worktree；保留用户和其他会话未提交文档。共享 root-layout 与Project索引由同一Coordinator按顺序维护。
- 执行顺序：TASK-0399 → TASK-0400 → TASK-0401；并非功能硬依赖，各 concern 可独立回滚。
- 原生只读子任务在合同落盘后派发，禁止写入/Git/真实实例。归属 Open-Forge-only。

## Given / When / Then

Given 已记录上一大会话且 sessionsMap 尚空；When 启动自动恢复→查看最近历史→向上分页/接收live→主动重新打开完整历史；Then 自动恢复不后台全量回填，既有显式 full 与普通手动打开策略不变，历史与live无丢失重复。

## 测试与验证

- 先建立自动恢复入口空 sessionsMap 的旧红回归；结合 RootLayout/真实 opener 接线与现有 session-switch/分页测试验证，不只断言Mock调用；用合成大历史比较恢复驻留条目/映射量，实际MB收益待实机。
- Node runner：在 apps/desktop 下运行 `bun ../../scripts/quality/run-vitest.mjs --run <本Task测试>`。
- 每个切片定向测试、`bun run test:impact -- <本Task路径>`；中间编辑轮 `check:quick`，三项组合结束完整 `bun run check`。公共合同/跨包变化按测试政策追加 `test:changed`。
- 性能结论仅引用可复算的受控等待、驻留条目或构建依赖指标，不宣称真实启动时间/内存下降百分比。

## 验收分层与功能验收包

- 工程：实现、定向/组合验证与完整check已完成；独立复审发现已处置。
- 集成：integrated，由承载本记录的本地main原子提交绑定；其他工作原样保留，未推送。
- 人工：verifying，等待用户确认实际启动/恢复/编辑体验；本轮未启动真实Desktop/Provider或运行verify:ui。
- 发布：未授权。
- 入口：正常启动与本Task影响的操作入口；预期为上述 Given/When/Then，具体提交和验证结果交付时补齐。

## 交付记录

- 初始准入时未修改生产代码/测试；后续各切片的实际证据按时间补记如下。
- 最小实现决策：仅自动恢复入口显式传已有 `historyLoadMode: tail`；手动打开和resolveHistoryLoadMode默认策略不变。必要时将一次性恢复effect提取为useLastSessionRestore接缝，供真实SessionManager/分页集成回归使用，不新增协议。
- 初轮既有基线将session-switch与controller并行运行：首项动态import/transform约31s超过原30s期限，继发7项失败，controller24项通过；尚无证据将其归为产品Bug。源码冻结后改为单文件/单worker重新建基线，未调高超时或删断言。
- 源冻结后单文件 `bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/conversation/hooks/useSessionManager.session-switch.test.ts --maxWorkers 1` 九项全部通过（21.58s）；controller既有24项已通过。此基线不包含新有界自动恢复行为。
- 一次性恢复effect原行为提取后基线10项通过。新增流程改静态装配，将收集成本与既有10s行为期限分开；有效旧红为chatMessages实际2000、期望10（行为81–89ms），未提高期限或删除断言。
- 修复后真实恢复→后台回调→延迟侧栏元信息写回→向上分页100条→用户显式full连续流程通过：自动阶段chat/backlog为10且bounded，IPC历史payload从2+2000变为2+10；分页后110条，显式full恢复完整2000。实际命令为Node runner：新流程1项、原session-switch9项、controller与chat-route-pending29项，共39通过，未用合成条目推算MB或主进程成本。
- 独立只读复审未发现P1/P2；route-pending仅是骨架纯函数证据，不声称真实导航guard/UI已实测。补充无记录/已有活动/恢复拒绝的生命周期分支测试，待组合验证。

## 本轮工程交付（2026-10-24）

- 自动恢复显式tail，手动默认与显式full保留。真实manager/分页连续流程将合成2000条的自动Renderer驻留降至10条，IPC历史2+2000→2+10；分页再载100，显式full恢复2000。定向39项及新增生命周期分支均被Desktop整包覆盖，独立复核无P1/P2。
- 组合验证：按test:changed影响图，externals/kanban 102、theme-ui 236、内置xianxia 1项通过；Desktop整包6155通过、3项进程型超时、18原跳过，隔离复跑相关3文件11通过、2原平台skip，覆盖全部先前超时及修正后的主题夹具。不是单次test:changed全绿；初轮WSL bash环境不符的运行已中止，不计通过。验证仅在当前进程将Git Bash放在PATH首位，未改持久环境/超时/断言。
- 采用更保守的完整命中包测试替代重复impact筛选；完整 `bun run check` 最终退出0，lint、全部类型、设计、模块边界、声明头和Project合同均通过。本机日志：`temp/desktop-performance-check-accepted.log`、`temp/desktop-performance-desktop-validated.log`、`temp/desktop-performance-final-recheck.log`。
- 无代码Worktree：全程单一串行Writer切换，原生只读分域调查和独立审查；源码/测试按本Task路径提交。共享导航在工作区同步，提交例外见WAIVER-0007，不夹带他人记录。
- 验收入口：重启开发版后观察启动响应、首次文件编辑及上次会话恢复；更早历史可向上加载、主动完整加载可用。真实安装版/系统性能采样及人工体验尚未执行，不以构建字节或夹具条目推算实际RAM/CPU降幅；未发布、未推送。
