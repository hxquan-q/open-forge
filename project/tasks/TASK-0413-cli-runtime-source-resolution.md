---
id: TASK-0413
type: task
status: verifying
priority: P0
owner: cli-host/testing
requirement: REQ-0002
source: user-request; BUG-0156
related_requirement: [REQ-0002]
related_plan: []
related_tasks: [TASK-0412, TASK-0404, TASK-0405]
related_issues: []
related_bugs: [BUG-0156]
execution: serial
branch: task/TASK-0412-delivery-blockers
worktree: unassigned（主检出任务分支串行实施）
base_commit: f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0
read_paths: [apps/cli-host/, packages/runtime-memory/, packages/coding-agent/vitest.config.ts, .github/workflows/quality.yml, .github/actions/install-bun-dependencies/, scripts/quality/]
write_paths: [apps/cli-host/vitest.config.ts, apps/cli-host/test/workspace-resolution.contract.test.ts, .github/release-notes/fragments/v0.1.4/task-0413-cli-runtime-source-resolution.md, project/decisions/waivers/WAIVER-0016-delivery-repair-release-fragments.md, project/tasks/TASK-0413-cli-runtime-source-resolution.md, project/tasks/README.md, project/bugs/BUG-0156-cli-runtime-memory-test-entry.md, project/bugs/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-29
updated: 2026-10-29
---
<!-- Copyright The Open Forge contributors. -->

# CLI Runtime 合同测试的记忆包源码解析

## 目标与范围

修复 BUG-0156：干净 CI 的 verify:runtime-contract 在收集 coding-agent 依赖时无法解析 runtime-memory。CLI Vitest 已将其他 workspace 公共入口映射到源码；补齐新依赖的一致测试解析与回归，而非改变生产 exports、引入全仓预构建或掩盖失败。

## 并发评估

串行，与 TASK-0412 的验证及 TASK-0405 发布修复按序组合；当前主检出任务分支，无并行实现 Worker。只读发布调查不写本任务路径。若发现需要变更生产打包或公共边界，先回写范围。

## Given / When / Then

- Given：干净安装，无 runtime-memory/dist；CLI 测试正常加载真实 coding-agent 源码。
- When：运行 verify:runtime-contract，或按实际 CLI Vitest 配置解析 runtime-memory 公共入口。
- Then：解析源码并加载真实策略解析器，无收集错误；正常会话初始化、显式策略和历史配置语义保持。
- Given：本地已有 dist；When：运行回归合同；Then：同样断言源码入口，避免缓存掩盖缺失 alias。

## 必须保持

生产包 exports/dist 合同、角色/工具/错误/取消语义及 CI 检查保持；不用空 Mock 或新 skip，不访问真实 Provider 和用户状态。改动归属为 Open-Forge-only 的源码测试装配。v0.1.3 已有不可变 tag，候选内部说明按 WAIVER-0016 暂存 v0.1.4 碎片；不修改已打 tag 正文或擅自晋升版本。

## 测试与验证

先新增基于真实 Vite resolver 和 CLI 配置的入口回归，证明旧配置命中 dist 而非源码并失败，再补 alias。

运行新合同及 `bun run verify:runtime-contract`、`bun run verify:artifact:installed`；必要时以隔离干净检出验证无 dist 环境。最终组合 `bun run test:changed --base origin/dev` 和 `bun run check`。实际远端 CI 必须绑定推送候选另记，不能用本地绿灯替代。

## 验收分层与验收包

工程：新合同、Runtime 合同及安装制品通过；第三次完整批次 CLI 52 文件通过、1 既有跳过，239 项通过、14 既有跳过，quality 700 项通过、完整 check 通过。整体仍因 Desktop 两个市场超时失败，后续隔离修复与最终候选门禁见 TASK-0412/0414；新 SHA 远端 CI 待执行。技术评审：独立只读评审 a8448a3bfd62a8b9b 已回收，WebSocket 发现已修复并复验。集成：pending。人工验收：测试解析修复无新增产品交互，自动合同可验收，不声称持久记忆功能已经人工接受。发布：用户已授权目标 0.1.3，标签身份阻塞另由 TASK-0405 控制。

复算为干净检出安装后执行 runtime-contract；预期所有测试正常收集并通过。远端仍缺入口即不通过，保留日志与 SHA。

## 交付记录

已核对 quality.yml 安装后直接运行 runtime-contract；CLI alias 覆盖其他 runtime 包但缺 runtime-memory；coding-agent 自身已有此 alias。

新增 workspace-resolution.contract.test.ts，通过 Vitest 公开的 createViteServer 加载实际 CLI 配置与真实 Vite SSR resolver，不增加 Vite 直接依赖。旧配置实际失败：期望 packages/runtime-memory/src/index.ts，得到 packages/runtime-memory/dist/index.js，1 例失败；这是有效回归证据。本次最初尝试直接导入未声明的 vite 导致收集失败，该次仅属测试实现错误，不算目标 Bug 的 red。

已补 runtime-memory 源码 alias，生产 exports、依赖安装 action 和 quality workflow 均未修改。新合同 1/1、完整 Runtime 合同 28 文件 138 例、安装制品 14 例通过。独立只读评审 a8448a3bfd62a8b9b 指出解析服务器默认监听固定 WebSocket 端口；已增加 ws:false，仅关闭无关网络副作用，定向复验 1 文件 1 例通过（1.60 秒）。第三次完整批次 CLI 239 项通过、14 既有跳过，quality 700 项及完整 check 通过，整体仍因两个 Desktop 市场超时失败；隔离修复及最终完整候选门禁见 TASK-0412/0414，新 SHA 远端复验待完成。
