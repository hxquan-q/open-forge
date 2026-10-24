---
id: TASK-0399
type: task
status: verifying
priority: P1
owner: desktop-runtimes
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
write_paths: ["apps/desktop/src/main/runtimes", "apps/desktop/src/main/ipc/runtimes.ts", "apps/desktop/src/main/main.ts", "apps/desktop/src/main/plugins/command-runner.ts", "apps/desktop/src/main/plugins/plugin-command-permissions.test.ts", "project/tasks/TASK-0399-runtime-startup-async-probes.md", "project/tasks/README.md", "project/plans/PLAN-0002-performance-reliability.md", ".github/release-notes/v0.1.3.md", "project/tasks/TASK-0402-notification-journal-projection.md"]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-24
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# 运行环境启动探测异步化

## 目标与范围

消除 RuntimeManager 初始化/刷新及 Git 探测链路中的同步子进程阻塞，保留安装、PATH、版本与失败恢复行为。

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

Given 托管/系统运行时探测缓慢或失败；When 正常初始化→查看状态→刷新/重试；Then 探测等待期间事件循环继续推进，结果、PATH与失败降级保持，重试仍可成功。

## 测试与验证

- 先运行 runtimes 现有测试；新增慢子进程期间心跳推进与超时/失败恢复回归，使用临时目录及本机 Node 夹具，不访问真实运行环境目录/网络。记录同一受控等待下旧/新心跳与探测耗时。
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
- 实施前审查确认 Git 的状态/安全判定也需 Promise 传播至 plugin command-runner；同目录 tar 探测/解压同属初始化子进程链，纳入本片。保持 IPC 返回结构和 macOS CLT 防弹框保护。期间仅一个串行 Worker 写本Task源文件，Coordinator只读准备后续任务；Worker完成后才切换写入所有者，不构成同工作区并行写代码。
- 中断恢复事实：生产实现已冻结，未提交。旧同步Git慢Node探测回归 `heartbeats=0` 明确失败；异步实现定向7文件49通过、1原平台skip；后续输出上限/下载取消/tar缓存变更的3相关文件16通过、1原skip。实际组合测试与完整check尚未运行，不能据此宣布工程完成。原Worker/原评审在模型切换后路由失败，未取得最终独立评审；当前会话继续接管，不重复实现。
- 恢复后的独立只读评审发现新增退出风险：execFile的AbortSignal终止路径不等同于其killSignal配置，忽略SIGTERM的子进程可能不结束；已退出父进程的后代持有stdio又可拖延close。需在下一串行写入窗口补明确kill/断流并确认直接子进程退出，main并行启动清理后在既有消费者清理组收尾；两种回归必须补齐。本Task尚未工程通过。
- 退出补修已完成：手持abort监听，显式SIGKILL并关闭本进程持有的stdio，仍等直接子进程close；main先发起关闭，将Promise并入原有消费者allSettled，不新增最前置await。受控OS边界的两条新回归旧实现均红，补修后与真实Node/安装/Git/插件gate/quit九文件共56通过、1原平台skip（Node runner，8.19s）。实际Node夹具在Windows未复现“已退出父进程仍持有管道”的先决状态，因此该风险使用明确可控的外部进程边界模型验证，不冒充Windows原生复现。
- 退出补修独立复审已通过，未发现剩余P1/P2。共享导航README含其他会话未提交行，precommit会整文件重暂存，故本批提交导航索引的临时例外另记 WAIVER-0007；源码、Task正文、发布说明及验证门禁不豁免，导航在工作区保持同步且不得夹带他人内容。

- 完整check代码、类型及设计门禁均已通过；唯一剩余为他人在途TASK-0402与已集成但保留verifying的TASK-0154广写域重叠未登记。仅补0402的conflicts_with事实，保留其原字段/状态/正文，不提交该他人记录；随后重跑完整check。

## 本轮工程交付（2026-10-24）

- 主进程node/python/pip/Git/tar探测与准备使用有界异步子进程；Git状态与调用闸门保持Promise接线，退出明确强杀直接子进程并关闭持有管道，阻止取消后继续准备。旧同步心跳为0的基线已转绿，退出两条边界旧红→绿；9文件56通过、1原平台skip，后续完整Desktop也覆盖本片。
- 组合验证：按test:changed影响图，externals/kanban 102、theme-ui 236、内置xianxia 1项通过；Desktop整包6155通过、3项进程型超时、18原跳过，隔离复跑相关3文件11通过、2原平台skip，覆盖全部先前超时及修正后的主题夹具。不是单次test:changed全绿；初轮WSL bash环境不符的运行已中止，不计通过。验证仅在当前进程将Git Bash放在PATH首位，未改持久环境/超时/断言。
- 采用更保守的完整命中包测试替代重复impact筛选；完整 `bun run check` 最终退出0，lint、全部类型、设计、模块边界、声明头和Project合同均通过。本机日志：`temp/desktop-performance-check-accepted.log`、`temp/desktop-performance-desktop-validated.log`、`temp/desktop-performance-final-recheck.log`。
- 无代码Worktree：全程单一串行Writer切换，原生只读分域调查和独立审查；源码/测试按本Task路径提交。共享导航在工作区同步，提交例外见WAIVER-0007，不夹带他人记录。
- 验收入口：重启开发版后观察启动响应、首次文件编辑及上次会话恢复；更早历史可向上加载、主动完整加载可用。真实安装版/系统性能采样及人工体验尚未执行，不以构建字节或夹具条目推算实际RAM/CPU降幅；未发布、未推送。
