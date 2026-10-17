---
id: TASK-0305
type: task
status: done
priority: P2
owner: packages/plugins
requirement:
plan:
source: BUG-0129
related_requirement: []
related_plan: []
related_tasks: [TASK-0304]
related_issues: []
related_bugs: [BUG-0129]
execution: serial
branch: main
worktree:
base_commit: a57b2bb18
read_paths:
  - packages/plugins/presets/vetta-ui-design/engine/package.json
  - packages/plugins/presets/vetta-ui-design/engine/package-lock.json
write_paths:
  - packages/plugins/presets/vetta-ui-design/engine/package-lock.json
exclusive_paths:
  - packages/plugins/presets/vetta-ui-design/engine/package-lock.json
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# vetta-ui-design engine 的 source-map-js 升至 1.2.2+（闭合 1 条 high 告警）

## 目标

`packages/plugins/presets/vetta-ui-design/engine/package-lock.json` 中 `node_modules/source-map-js` 解析条目由 `1.2.1` 升至 `>= 1.2.2`（GHSA-68fv-2mgg-jv7q，事件循环 DoS）。所有引入方范围（tailwindcss 等 `^1.2.1`、postcss `^1.0.1`）无需变更。

## 范围

### 并发评估

- 结论：支持（与 TASK-0304 无路径交集）
- 执行方式：serial（本会话顺序执行；文件面可并行）
- 可并行 Task：TASK-0304
- 前置依赖：无
- 冲突文件/独占路径：`packages/plugins/presets/vetta-ui-design/engine/package-lock.json`
- Branch：`main`
- Worktree：主工作区（串行，不拆出）
- 集成负责人：本 Task 执行者
- 集成顺序：独立原子提交，先于/后于 TASK-0304 均可

### 做

- lockfile 内 `node_modules/source-map-js` 条目的 `version`/`resolved`/`integrity` 升至最新 1.x（≥1.2.2），哈希与 registry 元数据一致；
- 以 registry 元数据核对完整性，保持最小 diff。

### 不做

- 不改 engine `package.json` 的依赖范围与 overrides（现有范围已容纳 1.2.2+）；
- 不全量重生成 lockfile（避免无关依赖漂移）；
- 不跑 engine 完整 vite 构建（构建期传递依赖，非本变更消费面）。

## Given / When / Then

- Given：vetta-ui-design engine 以独立 npm lockfile 管理构建期依赖，`source-map-js` 为 tailwindcss/postcss 的传递依赖。
- When：lockfile 解析条目升至 `1.2.2+`。
- Then：GHSA-68fv-2mgg-jv7q 对该 manifest 的告警闭合；lockfile 其余解析结果不变。

## 必须保持

- lockfile 仅目标条目变化；JSON 结构与其余条目逐字不动。

## 测试与验证

- 定向测试：无（lockfile 级变更，无运行时面）。
- 用户流程：不适用。
- 质量检查：JSON 可解析校验；`bun run check:quick`（变更文件）。

## 验收分层

- 工程验证：通过——lockfile 解析校验 + registry 哈希核对 + check:quick 与完整 check 全绿。
- 技术评审：自审；diff 仅目标条目三行。
- 集成：`74a5eec0e` 已推 `origin/dev`；经晋升 PR #14（merge commit `6c02ce2d0`）抵达 `origin/main`，#97 告警由 Dependabot 重扫转 fixed（open=0）。
- 人工功能验收：不适用（构建期传递依赖，用户不可见）。
- 发布：未授权（未触发发版；分支晋升不属发布）。

## 功能验收包

- 不适用（无用户入口）。

## 交付记录

- 实际修改：`engine/package-lock.json` 中 `node_modules/source-map-js` 条目 1.2.1→1.2.2（`version`/`resolved`/`integrity` 三行；哈希与 resolved URL 取自 registry 元数据，与既有 svgo 条目同走 npmmirror 源）。其余条目逐字未动，diff 为 3+/3-。
- 实际运行：`npm view` 确认 1.2.2 为 1.x 最新且即补丁版本；node 解析 lockfile 成功且 `packages["node_modules/source-map-js"].version == 1.2.2`；`bun run check:quick` 与完整 `bun run check` 通过。
- 未运行及原因：engine 完整 vite 构建（构建期传递依赖，变更不进运行时产物链；TASK-0090 先例同样仅 lock 层验证）。
- Worktree：主工作区串行，未拆出（无并行写需求）。
- 剩余风险：无运行时面；Dependabot #97 告警须变更抵达默认分支（origin/main）后才转 fixed。
