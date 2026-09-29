---
id: TASK-0121
type: task
status: done
priority: P2
owner: apps/desktop
requirement:
plan:
source: ISSUE-0024 现场测试观察
related_requirement: []
related_plan: []
related_tasks: []
related_issues:
  - ISSUE-0024
related_bugs: []
execution: serial
branch:
worktree:
base_commit:
read_paths:
  - apps/desktop/src/main/abilities/open-marketplace/**
  - apps/desktop/src/renderer/domains/abilities/**
write_paths: []
exclusive_paths: []
depends_on:
  - ISSUE-0024
conflicts_with: []
integration_status: pending
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 官方能力市场源可用性收口：发布内容或弱化 404 打扰

## 目标

消除能力页常驻的「GitHub 来源同步失败：Open Forge Official」横幅——
要么让官方源真实可用，要么在源长期不可达时不再以失败态打扰用户。

## 范围

### 并发评估

- 结论：条件支持
- 执行方式：serial
- 可并行 Task：无（取决 ISSUE-0024 的方案决策）
- 前置依赖：ISSUE-0024 拍板（发布市场仓库 / 降级提示 / 构建期不注册）
- 冲突文件/独占路径：`main/abilities/open-marketplace/**`、
  `renderer/domains/abilities/**`、或仓库外市场内容发布
- Branch：task/TASK-0121-official-marketplace-source
- Worktree：不需要
- 集成负责人：Coordinator
- 集成顺序：独立合入

### 做

- 按 ISSUE-0024 选定方案落地：
  - A：发布 `hxquan-q/open-forge-marketplace` 的 `gh-pages`（含
    `.vetta/marketplace.json`），验证桌面端同步成功；
  - B：404/网络不可达从「同步失败」降级为不打扰用户的提示形态，
    真实内容错误仍保留报错；
- 覆盖「源不可达时能力页无失败横幅」的定向测试。

### 不做

- 不改市场源的注册/覆盖机制（`VETTA_OPEN_MARKETPLACE_REPOSITORY`
  等发行方替换路径保持不变）；
- 不删缓存兜底语义；不动已装能力的本地功能。

## Given / When / Then

- Given：官方市场源地址不可达（404）；
- When：打开能力页；
- Then：按选定方案，用户不再看到常驻失败横幅；源恢复可达后列表
  正常刷新。

## 必须保持

- 内置源「用户不可删除、不可停用」的合同不变；
- 已缓存能力在离线/不可达时继续可用；
- 源真实内容错误（签名校验失败等）仍需可见报错。

## 验收

1. 官方源 404 时能力页无失败横幅（或市场源已发布、同步成功）；
2. 定向测试覆盖不可达降级路径；
3. `bun run check` 全绿。

## 测试与验证

- 测试层级：`open-marketplace` service/IPC 定向测试 + renderer 横幅条件；
- 验证命令：`bun scripts/quality/run-vitest.mjs --run <相关测试>`、
  `bun run check`。
- 实机复核：能力页在不可达与可达两种状态下各验证一次。

## 交付记录

- 2026-09-25 按 ISSUE-0024 方案 A 完成：创建公开仓库
  `hxquan-q/open-forge-marketplace`（`main` 说明文档 + `gh-pages`
  分发分支）；`.vetta/marketplace.json` 为 schemaVersion 3 空骨架
  （`marketplaceVersion 0.1.0`、`minAppVersion 0.1.0`），经仓库内
  `parseMarketplaceManifest` 校验通过。
- 实机验证：`raw/.../marketplace.json` 与 `archive/.../gh-pages.zip`
  均 200；能力页手动刷新后「GitHub 来源同步失败」横幅消失，来源页
  显示「已同步 · 0.1.0」。
- 仓库内无代码改动；本 Task 属外部发布动作 + 实机验收。后续能力发布
  走 gh-pages 递增 `marketplaceVersion`。
