---
id: BUG-0159
type: bug
status: verifying
priority: P1
owner: desktop/testing
requirement: REQ-0002
source: TASK-0412 third delivery batch; TASK-0414 local fetch guard
related_requirement: [REQ-0002]
related_plan: []
related_tasks: [TASK-0412, TASK-0414]
related_issues: [ISSUE-0035]
created: 2026-10-29
updated: 2026-10-29
---
<!-- Copyright The Open Forge contributors. -->

# 市场流程测试未隔离安装前的 manifest 网络请求

## 用户流程

- Given：开发者用本地归档运行市场的插件安装、MCP 准备、技能安装和 bundle 升级/缓存恢复测试，HOME 与文件产物已隔离。
- When：真实 OpenMarketplaceService 执行安装前 manifest 检查。
- Then：请求应由本地 manifest 替身确定地响应；不得因测试漏注入而访问示例 GitHub 仓库或依赖外网延时。

## 实际行为与期望

五个流程只注入 fetchArchive，fetchManifest 回落到全局 fetch。生产服务正确地在安装前检查远端版本并支持离线缓存回退，因此原功能断言可能在请求失败后仍然通过，却带入未隔离的网络等待。期望只修测试 fixture，保留生产检查与原有连续用户流程、断言和超时。

## 环境与失败证据

Windows 11、Node runner、Vitest 4.1.11，基准 HEAD f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0，当前未提交交付候选。命令级 VITEST_MAX_WORKERS=1，未使用真实 Desktop、Provider 或用户状态。

第三次完整批次 b081j0xol 的两个市场测试分别超时 5000ms 和 10000ms；相同两个文件独立 36/36 通过（20.17 秒），不能据此关闭广域失败。

在旧 fixture 上新增拒绝默认 fetch 并在 afterEach 断言零调用的守卫，包内运行两个完整文件：36 项中 5 失败、31 通过，7.64 秒。全部失败来自新增的明确隔离断言，无真实外网请求、无收集错误、无超时改动。

| 流程 | 默认 fetch 调用 |
| --- | --- |
| compatible plugin release refresh/install | 2 |
| MCP from active validated snapshot | 1 |
| validates and lists MCP/plugin/bundle | 1 |
| installs only from active validated snapshot | 1 |
| bundle identity/disabled state/cache reload/upgrades | 4 |

共 9 次请求，路径均为示例仓库的 raw/refs/heads/main/.vetta/marketplace.json；bundle 使用 example/market，其余使用 example/vetta-abilities。请求由本地守卫立即拒绝，生产离线回退捕获异常后，最终由调用断言可靠报告。

## 最小复现与根因证据

1. 在两个测试文件 beforeEach 中 vi.stubGlobal("fetch", rejectingSpy)，afterEach 断言 spy 零调用并恢复 globals。
2. 不修改原 service 配置、断言或超时，运行两个完整文件。
3. 确认上述五个流程触及默认 fetch；构造器分别以 options.fetchArchive ?? fetch、options.fetchManifest ?? fetch 绑定下载边界。

调用链：install/prepareMcp → ensureSnapshotFresh → refreshInBackgroundIfChanged → downloadManifest。生产 manifest 下载上限 15000ms；仅注入归档不能证明测试离线。此证据确认隔离缺陷及两个广域失败用例的暴露路径，尚未还原当时具体请求时长，不能声称唯一超时根因。

## 回归测试

两个文件保留默认 fetch 零调用守卫，即使服务吞掉网络异常并离线回退，也不能掩盖泄漏。对五个流程注入与归档一致且随版本变化的 manifest 响应，继续使用真实 service、catalog、临时文件和 bundle 安装器；现有升级、禁用状态、来源身份、缓存恢复、损坏版本回退及未引用包拒绝断言必须保留。

## 修复与验证

- 修复：TASK-0414 已补齐四个 service 流程及 bundle 流程的 manifest fixture；bundle 从当前可变归档提取 manifest，未修改生产实现、原超时或业务断言。
- 测试：有效 red 后，两文件 36/36 通过（7.45 秒），市场目录 152 项通过、2 既有跳过（15.26 秒）。评审收尾修正后，两文件再次 36/36 通过（10.16 秒），目录 18 文件通过、1 既有跳过，152 项通过、2 既有跳过（24.14 秒）；默认 fetch 零调用守卫均通过。
- 检查：收尾修正后 git diff --check、bun run check:quick 及 TASK-0414 worktree 合同通过。独立只读评审 ae64d6a217f85b1bc 指出的两个 list 测试后台清理竞态，已用 deferred manifest 和公开 install 流程在 finally 中等待完成；同一评审者复核确认原 P2 已处置、未发现新的实质问题。该竞态为源码可构造时序，未冒充运行时复现；复审未代跑测试。最终完整候选门禁待执行，现有广域红结果未被定向绿覆盖。
- 未运行：新 fixture 完整批次、真实 Linux、远端 CI、真实 Desktop 和发布均未执行；不以本地定向结果替代。
