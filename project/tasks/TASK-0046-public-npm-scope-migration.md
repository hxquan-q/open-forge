---
id: TASK-0046
type: task
status: blocked
priority: P1
owner: release/package-ecosystem
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: serial
branch: forge/dev
worktree: unassigned（用户决策暂缓：不注册 npm org，任务休眠待重启指示）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [project/issues/ISSUE-0001-rebrand-infrastructure-decisions.md, packages/plugins/AGENTS.md, packages/plugins/README.md, package.json, bun.lock]
write_paths: [packages, apps, package.json, bun.lock, docs/plugin, .github/release-notes]
exclusive_paths: [package.json, bun.lock, packages/**/package.json, apps/**/package.json, .github/release-notes]
depends_on: [TASK-0043, TASK-0045]
conflicts_with: [TASK-0045]
integration_status: pending
created: 2026-09-23
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 已发布 npm 包 scope 迁移

## 目标

在目标组织可用且兼容路径明确后，将决议范围内已发布的公开 npm 包从 `@vetta-org/*` 迁移到 `@openforge/*`，同时保持内部 workspace scope 不变。

## 范围

### 并发评估

- 结论：不支持并发；这是跨包公开发布合同和根锁文件变更。
- 执行方式：serial，共享工作区串行。
- 可并行 Task：无。
- 前置依赖：`TASK-0043` 的品牌映射和 `TASK-0045` 的生态身份合同完成；`@openforge` npm 组织注册并确认可用。
- 冲突文件/独占路径：所有受影响的 package manifests、workspace 配置、`bun.lock`、插件文档和 Release Notes。
- Branch：`forge/dev`；Worktree：实施前核对发布合同和当前基线。
- 集成负责人：coordinator。
- 集成顺序：组织注册确认 → manifest/build/lockfile 修改 → 合同与安装验证 → 用户决策发布时机。

### 做

- 只迁移 `ISSUE-0001` 决议中的已发布公开包 scope；内部 `@vetta/*` workspace 包名保持不变。
- 检查所有生产者、消费者、CLI、构建配置、插件手册和锁文件引用。
- 明确存量用户的安装/升级兼容路径，并提供可验证的迁移说明。

### 不做

- 不执行 `npm publish`、registry 登录或组织注册；组织注册由用户/发布负责人完成并确认。
- 不做全仓 `@vetta` 字符串替换。
- 不更改 `VETTA_*`、IPC、MCP/远端协议和 `.vettapkg`。

## Given / When / Then

- Given：`@openforge` 组织已注册，且公开包迁移及兼容策略已确认；When：本地 workspace、构建和文档改用批准的新 scope；Then：所有包仍可在 workspace 安装、构建和验证，内部 `@vetta/*` 身份不变，Task 不会发布任何 npm 制品。

## 必须保持

- 已发布插件 SDK、CLI 和插件工程的消费者合同必须有迁移说明。
- `packages/plugins/AGENTS.md` 规定的手册、CHANGELOG、版本/API 检查和合同测试要求不得省略。
- 包发布仍由用户决定，Task 完成不等于发布授权。

## 测试与验证

- 定向测试：公开包入口解析、workspace 安装、CLI/插件安装元数据和存量 scope 兼容检查。
- 用户流程：从干净 checkout 安装 workspace、构建受影响包并验证 CLI/插件文档中的安装命令；不访问真实 registry。
- 质量检查：`bun run check:quick -- <changed files>`、`bun run test:impact -- <changed files>`、适用的已安装制品/插件合同检查；检查根 `bun.lock` 一致性。

## 阻塞

- 用户决策（2026-09-25）：**暂不注册** `@openforge` npm 组织，本任务随之休眠（blocked，非取消、非 archived）。
- `ISSUE-0001` 决策 #9 的对外 7 包 `@openforge/*` scope 迁移目标不变；待用户后续给出组织注册或迁移指示时重启。重启前不得自行注册组织、登录 registry 或执行任何 `npm publish`。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
