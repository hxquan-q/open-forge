---
id: TASK-0199
type: task
status: done
priority: P1
owner: desktop-testing
source: TASK-0187 impact validation failure
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0187]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree:
base_commit: 34558a9ac
read_paths: [apps/desktop/src/main/filesystem/conversation-workspace-visibility.test.ts, apps/desktop/src/main/filesystem/filesystem-service.ts]
write_paths: [apps/desktop/src/main/filesystem/conversation-workspace-visibility.test.ts, project/tasks/TASK-0199-conversation-fixture-import-boundary.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0187]
integration_status: pending
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 会话目录可见性回归的隔离初始化边界

## 目标与范围

TASK-0187 的标准 impact 第二次有效运行中，1088 测试通过、仅本文件 beforeAll 超过 10 秒而失败，三个场景未执行。冷模块转译被放入 hook 超时窗口，是验证入口问题，不把它当作用户功能失败。

按仓库已有 await vi.hoisted 模式先配置隔离 VETTA_HOME，再用正常静态模块加载；beforeAll 只保留真实目录/文件准备，afterAll 恢复环境并清理自己的临时目录。不能 mock 被测文件系统、放大 timeout、删断言或跳过测试。

## 并发与合同

在 TASK-0187 的唯一专用集成工作树中串行；不建立第二工作树，不派实现 Agent。
Given 隔离的对话根与 UUID 会话目录，When 正常/递归列举及以会话目录为根，Then 三个原场景和全部断言保持，真实读写仍经过 filesystem-service。相对入口不变，失败仍使测试失败。

## 验证与验收

基线：impact-3.log，beforeAll 10018ms，hook timeout=10000ms；没有改任何超时。
定向：通过 Node runner 的 Desktop config 跑本文件及 filesystem-service/file-explorer-dotfiles。
批次：重跑相关影响面与 test:changed、完整 check。内部测试修复，人工 UI 验收不适用；工程验证待执行，集成 pending，发布未授权。

续接（2026-10-03）：用户要求继续完成；保留已有测试修正，先复核定向用例，再执行批次 impact/changed/check。未授权启动真实实例。主树存在其他任务草稿，按现行协作规则不在脏主树强行集成。

本轮定向验证：3 文件/19 测试通过（67.52s）。check:quick 首次失败为本轮填写的 serial 子任务独立工作树字段违反合同；已按同批子任务约定清空字段，实际执行位置由父 TASK-0187 管理，正文保留位置事实。

工程证据：本轮定向 3 文件/19 测试通过，包含正常/递归列举与会话目录本身可见性；完整 bun run check 通过。测试原断言及超时未改变，无运行时产品修改。批次关联测试与集成证据归 TASK-0187；尚未集成，保留 verifying。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
