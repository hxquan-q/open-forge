---
id: ISSUE-0009
type: issue
status: done
priority: P1
owner: release/package-ecosystem
related_requirement: [REQ-0005]
related_plan: [PLAN-0005]
source: package.json, scripts/release.mjs, workspace package manifests
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Workspace 包版本与发布范围

## 背景

Desktop 产品版本已决定独立 SemVer；这不等于根 workspace 或每个 `packages/*` package 应统一升版。当前 manifest 版本存在差异，而根 `scripts/release.mjs` 从 `packages/coding-agent` 读取版本并尝试锁步更新根包和多个 package。

## 已知事实

- 根 `package.json`、`apps/desktop/package.json`、可发布 package 和内部 workspace package 使用不同版本值。
- `scripts/release.mjs` 会批量写多个 package manifest、变更 changelog、创建 tag 并 push；它不是 Desktop release pipeline 的调用目标。
- 当前没有一个已确认的 package release cohort 清单，也没有足够事实证明所有 workspace package 同时发布。

## 决策结果（2026-09-23，用户四轮决策确认）

- **不公开发布任何 workspace 包**。薄壳 fork 的价值在 Desktop 产品层；公开发 SDK 会把上游 API 兼容性变成 Open Forge 的公共合同，维护成本远超收益。
- **硬化发包面（双保险）**：根 `publish:private`（裸 `npm publish -ws`）接入与 `release.mjs` 相同的 fail-closed 守卫；给无 `publishConfig` 的包补 `private: true`（manifest 级硬保障，挡住脚本外直接调用 npm 的路径）。
- **`@vetta-org/*` 四个包的 `publishConfig` 保留不动**：指向上游 scope 的发布配置属上游合同的一部分，不删除；fork 永不执行其发布。
- **未来重开条件**：若插件 SDK 等确实需要公开发布，以独立 Task 重开 ISSUE-0009，届时再定 `@openforge` scope、cohort 与消费者合同；不恢复全仓锁步假设。

## 未决问题（已裁决，存档）

workspace 包采用独立 package SemVer、显式 lockstep cohort，还是暂时关闭通用 root release 入口，直到实际发布范围与消费者合同明确？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| 每个公开 package 独立 SemVer | 版本只反映实际公开 API 和消费者变化 | 需要 package 级变更选择、changelog 与 release tooling | release tooling 范围扩大，需避免遗漏依赖包 |
| 显式声明 lockstep cohort | 对确实共同发布的一组包操作简单 | 必须维护可信的 cohort 清单 | 把所有 package 当成一个 cohort 会覆盖未发布或不同版本包 |
| 暂停通用 root release，按需建立 package-specific workflow | 不会误覆盖当前不同版本 | package 发布暂时不可用，需单独恢复 | 若仍有用户依赖旧命令会造成流程中断 |

## 推荐

先让现有 root release 在改任何文件前对不一致版本 fail closed，并限制 Desktop 只能使用 Desktop release 工具。保持 package 版本不变；待明确公开 package、cohort 和消费者合同后再设计 package-level release。

## 决策触发条件

- 列出实际可发布的 package、owner、消费方与发布 registry；
- 检查 `private`、`publishConfig`、package exports 和发布工作流；
- 明确哪些 package 必须同步版本、哪些独立演进。

## 后续 Task

- `TASK-0056`：为 root release 增加一致性预检和明确的推送门，验证失败不会改文件、commit、tag 或 push。
