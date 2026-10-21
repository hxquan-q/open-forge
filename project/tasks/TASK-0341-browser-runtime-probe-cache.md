---
id: TASK-0341
type: task
status: ready
priority: P2
owner: desktop
requirement:
plan:
source: RESEARCH-0034; 用户提供的 browser 面板耗时观测
related_requirement: []
related_plan: []
related_tasks: [TASK-0339, TASK-0218]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行，不拆 worktree）
base_commit: 74877ddef
read_paths:
  - apps/desktop/src/main/browser-automation
  - apps/desktop/src/main/capabilities
  - apps/desktop/src/main/ipc/plugin-capabilities.ts
  - apps/desktop/src/preload
  - packages/capability-sdk/src/foundation
  - packages/plugins/plugin-sdk/src
  - packages/plugins/presets/browser/src
  - project
write_paths:
  - apps/desktop/src/main/browser-automation/browser-runtime-manager.ts
  - apps/desktop/src/main/browser-automation/browser-runtime-manager.test.ts
  - apps/desktop/src/main/browser-automation/browser-automation-service.ts
  - apps/desktop/src/main/browser-automation/contracts.ts
  - apps/desktop/src/main/capabilities/browser-provider.ts
  - apps/desktop/src/main/capabilities/browser-provider.test.ts
  - apps/desktop/src/main/capabilities/integrations/plugin/foundation/browser.ts
  - apps/desktop/src/main/ipc/plugin-capabilities.ts
  - apps/desktop/src/preload/api-types/plugins.ts
  - apps/desktop/src/preload/apis/plugins.ts
  - apps/desktop/src/renderer/domains/plugins/runtime/plugin-host-apis.ts
  - apps/desktop/src/renderer/domains/plugins/runtime/plugin-context-browser.test.ts
  - packages/capability-sdk/src/foundation/browser.ts
  - packages/plugins/plugin-sdk/src/browser.ts
  - packages/plugins/presets/browser/src/runtime/runtime-controller.ts
  - packages/plugins/presets/browser/src/components/BrowserConsole.tsx
  - packages/plugins/presets/browser/test/runtime-controller.test.ts
  - project/tasks/TASK-0341-browser-runtime-probe-cache.md
  - project/tasks/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths:
  - apps/desktop/src/main/browser-automation/browser-runtime-manager.ts
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 浏览器运行时探测缓存与并发去重

## 目标

把 `agent-browser --version` 的探测结果缓存在主进程，并对同一时刻的并发请求去重，避免面板重挂载、会话创建与安装后检查各自再起一个子进程；人工重检绕过缓存，安装前后使缓存失效，实际执行失败仍能及时更新状态。

## 范围

### 并发评估

- 结论：不支持并行；与 TASK-0339/0340 共享 Tasks 索引与 Release Notes。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无；插件 `activate()` 已有预热调用，本 Task 只改变探测的成本与语义。
- 冲突文件/独占路径：`browser-runtime-manager.ts` 为本 Task 独占；capability Schema 增加可选字段，不影响既有调用方。
- Branch：`main`。
- Worktree：不拆出；缓存语义需要跨 manager、service、capability、插件控制器一起验证。
- 集成负责人：当前 Coordinator。
- 集成顺序：TASK-0340 之后，本轮最后一项。

### 做

1. `BrowserRuntimeManager` 增加状态缓存：成功（`ready` / `browser-missing` / `outdated` 等可判定结果）缓存约 60 秒，失败或不可判定（`missing` / `error`）缓存约 4 秒；参数以可注入时钟与 TTL 的形式暴露，便于测试。
2. 同一执行环境的在途探测去重：多个调用方共享同一个探测 Promise；任一调用方取消只结束自己的等待，不取消共享探测。
3. 代次保护：安装开始时递增代次并清空缓存；安装前启动的旧探测即使晚到也不得写回缓存；安装结束后强制重新探测。
4. 人工重检绕过缓存：`status` 增加可选的 `fresh` 语义，沿 capability 输入（`fresh?: boolean`）、plugin capability 方法、preload 通道、插件 SDK 类型、`runtime-controller.refresh({ fresh })` 一路透传；`BrowserConsole` 的重检按钮使用 `fresh: true`，`activate()` 的预热仍走缓存。
5. 执行失败仍更新状态：会话创建在 `runtime_not_ready` 或其他启动失败时使缓存失效，下一次状态查询重新探测。
6. 测试：缓存窗口内重复 `status()` 只 spawn 一次；并发 `status()` 只 spawn 一次；调用方取消不打断共享探测；安装开始使旧缓存失效且旧代次晚到结果不写回；`fresh` 绕过缓存；失败 TTL 短于成功 TTL；会话创建失败使缓存失效。
7. 更新 Tasks 索引、本 Task 交付记录与当前版本发布说明。

### 不做

- 不改 `agent-browser --version` 的命令、超时、输出上限或版本比较规则。
- 不在缓存命中时跳过权限检查、取消检查或安装后的真实探测。
- 不把缓存过期结果宣称为当前健康：过期后仍要重新探测。
- 不改插件的激活时序与 Module Federation 加载路径（dev 加载优化属后续独立范围）。
- 不启动 Desktop、不连接真实 Provider。

## Given / When / Then

- Given 刚完成一次成功探测，When 在 60 秒内反复打开 Browser 面板，Then 不新增版本探测子进程。
- Given 多个调用方在同一时刻查询状态，When 探测尚未返回，Then 只启动一个子进程，所有调用方得到同一结果。
- Given 某调用方的 `AbortSignal` 被触发，When 共享探测仍在进行，Then 该调用方收到取消，其他调用方照常完成。
- Given 用户点击「重新检测」，When 缓存仍在有效期内，Then 仍然执行一次真实探测并刷新缓存。
- Given 安装开始，When 安装前的探测晚于安装结束返回，Then 旧结果不写入缓存，安装后的状态以新一轮探测为准。
- Given 状态为 `missing`，When 4 秒后再次查询，Then 重新探测；4 秒内则命中缓存。
- Given 会话创建因运行时未就绪失败，When 立即查询状态，Then 不使用失败前的旧缓存。

## 必须保持

- `BrowserRuntimeStatus` 的 phase 集合与字段不变；`fresh` 是可选输入，缺省行为对既有调用方等价。
- 安装去重（`installPromise`）与安装日志字段不变。
- 取消语义：调用方取消后错误仍按既有路径抛出，不被缓存吞掉。
- 插件的 `activate()` 预热、面板订阅与重检按钮的现有职责边界不变。
- 不使用缓存替代真实命令执行、权限检查或安装后的版本校验。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/browser-automation/browser-runtime-manager.test.ts apps/desktop/src/main/capabilities/browser-provider.test.ts`。
- 插件回归：`bun scripts/quality/run-vitest.mjs --run packages/plugins/presets/browser/test/runtime-controller.test.ts apps/desktop/src/renderer/domains/plugins/runtime/plugin-context-browser.test.ts`。
- 影响面：`bun run test:impact`。
- 质量检查：`bun run check:quick`；交付前完整 `bun run check`。
- 用户流程：宿主测试覆盖缓存窗口、并发、取消、安装代次、人工重检与失败失效；真实面板耗时留人工验收。

## 验收分层

- 工程验证：待执行。
- 技术评审：待执行。
- 集成：待集成。
- 人工功能验收：待验收；需要在真实 Desktop 中反复打开面板并在缓存期内观察新增版本探测子进程为 0。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：Desktop 侧边栏打开 Browser 面板；本机已安装满足版本要求的 `agent-browser`。
- 操作步骤或 AI 任务输入：连续开关面板多次；点击「重新检测」；在缓存期内创建会话。
- 预期行为与最终产物：缓存期内新增版本探测子进程为 0；重检触发一次真实探测；安装与执行失败后状态仍及时更新。
- 不通过表现与已知限制：每次打开面板都新增探测子进程；重检被缓存吞掉；安装后仍显示旧状态。
- 验收反馈及回归案例：待用户反馈。

## 交付记录

- 实际修改：待回填。
- 实际运行：待回填。
- 未运行及原因：待回填。
- Worktree：未拆出；缓存语义跨主进程与插件层，串行修改。
- 剩余风险：60 秒/4 秒 TTL 是待验证参数，若实际使用中出现「外部安装后长时间不刷新」可再调整。
