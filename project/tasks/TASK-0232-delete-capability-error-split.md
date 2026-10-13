---
id: TASK-0232
type: task
status: verifying
priority: P3
owner: packages/runtime-core
requirement:
plan:
source: BUG-0097（assertCapability 把「无路由认领」与「路由声明拒绝」压成同一「不支持 delete」错误）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0097]
execution: serial
branch:
worktree:
base_commit: ba5f5bbc2
read_paths: [packages/runtime-core/src/runtime-host/runtime-host-catalog-facade.ts, packages/runtime-core/src/runtime-host/session-services.ts, apps/desktop/src/main/agent-runtime/composition.ts, project/bugs/BUG-0097-delete-capability-misclassified.md]
write_paths: [packages/runtime-core/src/runtime-host/runtime-host-catalog-facade.ts, packages/runtime-core/test/runtime-host/runtime-host-catalog-facade.test.ts, .github/release-notes/v0.1.3.md, project/bugs/BUG-0097-delete-capability-misclassified.md, project/tasks/TASK-0232-delete-capability-error-split.md, project/tasks/README.md]
exclusive_paths: [packages/runtime-core/src/runtime-host/runtime-host-catalog-facade.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# assertCapability 区分「未被认领」与「能力被拒」两类错误

## 目标

`assertCapability` 把 `resolve` 的两种 falsy 分裂开：

1. `access === undefined`（无 catalog 认领该路径——外来格式/他实例专属/已删残留）→ 新错误文本如实表述「不归本运行时认领」，仍 `INVALID_REQUEST` + `retryable:false`（路由归属是静态组合，重试不会改变）。
2. `access.delete === false`（路由认领但声明拒绝）→ 保留原 `does not support` 语义（本组合三条路由全 `delete:true`，该分支当前不可达但合同保留）。
3. `delete`/`rename` 两个 capability 同构处理。

## 约束

- 不改 `RuntimeSessionAccess`/`RuntimeSessionAccessResolver` 端口形状——分裂只发生在 assert 内部。
- purge 逐条容错语义不变：单条失败仍不阻断其余文件。
- runtime-core AGENTS：runtime-host 变化覆盖成功/拒绝/部分初始化语义；facade 单测直接构造 fake options，不走整 host。

## 验收（Given/When/Then）

- Given：accessResolver 返回 undefined → When：`deleteSession(path)` → Then：拒绝 `INVALID_REQUEST`，message 含「不被本运行时认领」语义且不含 `does not support`。
- Given：accessResolver 返回 `delete:false` → Then：拒绝文本保留 `does not support delete`。
- Given：accessResolver 返回 `delete:true` → Then：继续走 catalog.deleteSessionArtifacts（防回归）。
- rename 路径同合同；旧实现 → 两类情形文本相同（红基线）。

## 交付记录

- 红基线：新增 facade 测试的未认领用例在旧实现下报 `does not support`（两类拒绝同文本），如预期失败。
- 实际修改：`runtime-host-catalog-facade.ts` `assertCapability`——`access === undefined` 单独分支报 `Session is not recognized by this runtime`；显式拒绝分支文本不变；`code`/`retryable`/`source` 均不动。端口形状、purge 容错、路由配置零变化。
- 测试：`runtime-host-catalog-facade.test.ts` 4 例（未认领 delete/rename、显式拒绝、授权路径）。
- 全量：impact（facade）20 套件 117 例过。
- 检查：`check:lint` 绿。
- 未运行：`bun run check` 全量（`.ua/` 既有 guard 残留会红，与本次无关）。
