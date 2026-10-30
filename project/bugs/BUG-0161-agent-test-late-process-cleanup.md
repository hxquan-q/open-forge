---
id: BUG-0161
type: bug
status: verifying
priority: P1
owner: scripts/agents
requirement: REQ-0002
source: TASK-0412 phase timing b3u6m1r68
related_requirement: [REQ-0002]
related_plan: [PLAN-0019]
related_tasks: [TASK-0412, TASK-0416]
related_issues: [ISSUE-0035]
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# 控制器测试超时后仍运行异步进程并提前删除夹具

## 用户流程

- Given 开发者通过仓库 Node runner 运行真实 Git/进程合同测试。
- When 用例或初始化触及原超时，框架开始 afterEach/afterAll。
- Then 测试拥有的异步流程应收到取消并完成收尾，再移除临时目录。

## 实际行为与根因证据

b3u6m1r68 的临时 preload 与 setup 日志以同一 PID/id 配对：runner 子进程 32、120、202、226 分别在原用例开始，却在后续用例阶段才 close。runner 的 afterEach 只执行 rmSync，没有给 executeAdapter/verifyRun 传入测试取消信号或等待仍在运行的操作。部分旧流程的 taskkill 阻塞发生在后续用例内；该事件不能算成后续用例自身的进程成本。

integrate beforeAll 超过 10000ms 后，afterAll 在 prepareTask 所启动子进程尚无 close 时删除目录，报 EPERM；合成状态仍为 preparing。未访问 controller.key，未按旧 PID 终止或删除现场。这个现场不证明子进程的内部阻塞原因，也不覆盖所有历史 EPERM。

## 环境与失败证据

Windows 11、Node 26.3.1、Vitest 4.1.11，task/TASK-0412-delivery-blockers 的未提交候选。b3u6m1r68：24 通过、5 原超时失败、5 初始化后未执行，122.97 秒；integrate EPERM、runner ENOTEMPTY。计时有同步日志扰动，不作为无扰动性能基准。

## 最小复现与回归

用可控 onActivity 同步点启动真实测试进程；关闭夹具时必须传入取消、等待进程与操作结束，关闭完成后不得再启动操作。回归放入现有 process.test.mjs；原 runner 与 integrate 全文件保持连续行为和原超时。

## 影响与期望

影响开发测试的隔离、可重复性和临时资源收尾，不是产品 Runtime 缺陷，也不证明真实自主部署隔离。修复仅在测试夹具拥有生命周期；控制器的 fail-closed、执行证明、租约与身份重验不改。

## 修复与验证

TASK-0416 已实现测试专用 owner：桥接取消、登记整个异步操作、关闭后拒绝新操作，关闭时等待已登记流程收束。runner 每测试独立保存 owner 与目录；integrate 的初始化、cycle 和 review→verify 全流程均登记，原安全重验及生产实现不改。

新增真实进程回归在 no-op 旧行为下准确失败于取消信号，实现后通过。首次三完整文件为 20 通过、1 项 runner 原 5000ms 超时（5276ms），integrate 五项已实际执行；经 baseline 初始化职责调整及移除 tracked 文件冗余 add 后，同入口、单 worker、全部原超时下 21/21 通过，59.71 秒。本次未见 EPERM/ENOTEMPTY，不代表全部历史清理错误已关闭。

随后完整 bun run check 通过，但第七批 bnw86pnmm 的行为门禁仍失败：quality 718 通过、1 项 runner 原 5000ms 超时（6144ms）、5 项因 integrate beforeAll 原 10000ms 超时未执行，225.09 秒，未进入包测试。本轮没有 EPERM/ENOTEMPTY 输出，不据此关闭全部历史清理错误。之后只读评审指出新增 process 回归自身的 teardown 所有权及等待断言两项 P2，已在 TASK-0416 内返修并由原评审复核关闭。process 全文件 7/7、空 active 等待变异准确 red；最新六个完整控制器测试文件 63/63 通过（95.30 秒），quick、guards、diff 与定向合同通过。完整静态及冻结候选复验仍待完成，状态保持 verifying；定向绿不替代广域验收，不提交、推送或发布。
