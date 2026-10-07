---
id: TASK-0173
type: task
status: done
priority: P1
owner: cli-host tests
source: RESEARCH-0019; TASK-0172
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0170, TASK-0171, TASK-0176]
related_issues: []
related_bugs: [BUG-0059]
execution: serial
branch: main
worktree: unassigned（2026-10-02 主检出串行实施完成）
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [apps/cli-host/test, apps/cli-host/src/rpc, apps/cli-host/scripts/compile-standalone.mjs, project/bugs/BUG-0059-cli-rpc-concurrent-test-timeouts.md]
write_paths: [apps/cli-host/test/support/agent-rpc-test-process.ts, apps/cli-host/test/installed-artifact-runtime.test.ts, project/verification, project/tasks/TASK-0173-cli-rpc-timeout-diagnostics.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0176]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# CLI RPC 偶发超时的可复现诊断

## 当前事实与目标

TASK-0171 首轮标准批次在单 worker 下仍有 2 个 installed-artifact-runtime 用例超时，随后单文件 13/13、完整 CLI 226 项和最终整批均通过。当前 request()/waitFor() 的错误只给出通用 RPC frame 超时与 stderr，无法直接区分等待的命令、启动阶段和最后帧。**已确认有偶发失败，未确认是丢首帧、资源争用或产品协议缺陷。**

目标：建立可重复的最小失败/对照与不泄密的诊断证据，明确超时属于启动、请求处理、资源释放还是测试夹具；不要再以一次重跑通过或单 worker 当作根因结论。

证据与同类去重见 [RESEARCH-0019](../research/RESEARCH-0019-post-integration-optimization-audit.md)。本记录为待执行合同，**本轮只建档，没有实施授权或修复结果**。

## 范围与取舍

仅修改测试支撑与有界诊断/回归夹具。分别控制源码/安装制品、单文件/完整文件顺序、启动发送时机，并记录预期 request id/command、耗时阶段、最近帧的 type/id/command 及子进程退出状态。最近帧缓冲有界，不记录 Prompt、工具参数、凭据、完整帧或真实 stderr 数据。若定位到生产缺陷，回写 BUG-0059 并另拆具有失败基线的修复 Task，不在此静默扩大到 RPC 生产协议。

不做：不增加超时、不删断言、不自动重试失败用例，不改变默认 maxWorkers=1；这项诊断不是 TASK-0170 的重复调度补丁。

## 输入、输出与并发

- 输入：上述固定源码快照、相关 Task/Bug 与可控测试夹具；开工先复核新 HEAD 和最近 AGENTS/README。
- 输出：本范围可独立回滚的改动或诊断/测量结论、对应回归与真实验证记录。
- 当前串行规划；依赖为 frontmatter 的 depends_on。未来仅在获得多 Agent 授权并补齐互斥写路径后使用独立 Task Worktree，不在主目录并行写。
- 共享冲突：记录的 conflicts_with 及公共索引/发布说明由 Coordinator 串行合并；性能/时序实验不得互相争抢同机资源。

## Given / When / Then 与验收

1. Given/When/Then：给一个永不匹配的测试请求，等待原有期限后，错误能定位 request id/command 和子进程阶段，且日志有界、无消息正文；诊断辅助本身有单元测试。
2. Given/When/Then：在同一快照按固定文件顺序分别运行源码和安装制品入口，保留每次成功/失败和环境记录；能够复现或明确报告尚不能复现，不能用 retries/skip 掩盖失败。
3. Given/When/Then：退出、stdin 关闭或取消发生后，已有 JSONL、host_response 结算和资源释放断言保持，测试内部的并发所有权场景仍执行。

完成标准：交付最小复现或明确的不可复现边界、分阶段证据、已排除假设和后续决策；不能在没有根因证据时关闭 BUG-0059。

## 必须保持

原有错误/取消、资源释放和公开合同；不新增 any、静默本地回退或凭据暴露，不降低测试基线。工具不接触真实用户实例/配置，不调用付费 Provider。

## 验证命令

- cwd `apps/cli-host`：`bun ../../scripts/quality/run-vitest.mjs run test/installed-artifact-runtime.test.ts --maxWorkers=1`。
- `bun run --cwd apps/cli-host test`；`bun run test:impact -- apps/cli-host/test/support/agent-rpc-test-process.ts apps/cli-host/test/installed-artifact-runtime.test.ts`；`bun run check`。
- 必须使用本地假 Provider、临时会话目录和现有安装制品构建入口；不访问真实 Provider/用户状态。

## 验收分层与当前交付

## 交付记录（2026-10-02/03，主检出串行实施）

- 实现：仅测试支撑与诊断夹具，未改 RPC 生产协议。`agent-rpc-test-process.ts` 的 `waitFor` 增加可选 `expectation`（`request()` 自动携带），超时错误由导出纯函数 `formatRpcWaitTimeout` 生成——预期 id/command、`child: pid/exit/signal`、`phase: ageMs/frames/sinceFirstFrame/sinceLastFrame`、`recentFrames(≤12)`（仅 type/id/command）、`stderr(tail)`（2 KiB 有界，收敛原无界 stderr）。`write_paths` 外无新增文件：单测落在既有 `test/agent-rpc-test-process.test.ts`，探针落在既有 `test/installed-artifact-runtime.test.ts`，实验记录在 `project/verification/VERIFY-0015`（新增，属 task 声明的 project/verification 范围）。
- 合同测试：诊断单测 3 例（快照格式化、启动/退出形态、真实子进程不携带帧正文）；安装制品探针 1 例（真实 standalone 二进制、永不匹配等待 750ms——同一到点机制，避免把 20s 默认期限挂进套件；偏差已在此记录）。
- 对照实验（VERIFY-0015）：同快照安装制品 3 轮（14/14，~80s/轮）+ 源码入口 `agent-runtime-selection` 3 轮（9/9），`--maxWorkers=1`、固定文件顺序，0 失败——**本轮未复现**，BUG-0059 保持 investigating，未以通过关闭。
- 保持：既有 JSONL、host_response 结算、退出/stdin/取消/资源释放断言未动（installed 13 例原样通过）；未增加超时、未删断言、未自动重试、默认 maxWorkers=1 不变。
- 实际命令与结果：诊断单测 5/5；installed 3 轮 14/14；CLI 全包 230 通过 14 跳过（`bun run --cwd apps/cli-host test`，523.8s，exit 0）；`test:impact -- <两文件>` 通过（14/14）；`bun run check` exit 0。
- 未验证项/风险：偶发根因未定位（本轮证据不支持任何单一假设关闭）；其他平台由 CI 覆盖；未触碰真实 Provider/用户状态。
- 状态：工程完成转 `verifying`；`integration_status: integrated`（随本提交入 main）。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
