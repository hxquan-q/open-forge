---
id: TASK-0458
type: task
status: in_progress
priority: P1
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0453]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 78f8ba441
read_paths:
  - packages/host-protocol/src/domains/settings.ts
  - apps/desktop/src/main/models/presets/sync.ts
  - apps/desktop/src/main/models/presets/errors.ts
  - apps/desktop/src/main/ipc/settings.ts
  - apps/desktop/src/preload/apis/system.ts
write_paths:
  - packages/host-protocol/src/domains/models.ts
  - packages/host-protocol/src/index.ts
  - apps/desktop/src/main/host/models-domain.ts
  - apps/desktop/src/main/host/desktop-host.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/settings.ts
  - apps/desktop/src/preload/apis/system.ts
  - apps/desktop/src/preload/host-transport.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0458-models-preset-catalog-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0453]
conflicts_with: []
integration_status: pending
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 模型预设目录迁移到 Host 合同（PLAN-0029 Phase 2 延续）

## 目标

把 `vetta:models:list-presets`、`vetta:models:refresh-preset-catalog` 两个免 key 的预设目录通道迁到 `@vetta/host-protocol`（`models.listPresets`、`models.refreshPresetCatalog`），renderer 经 preload 的签名不变，旧 handler 删除，`count-ipc-channels` 计数下降。

## 范围

### 并发评估

- 结论：主工作区串行切片，无并行诉求。

### 做

- `packages/host-protocol/src/domains/models.ts` 新增预设目录合同：`PresetError`（8 个错误码枚举 + 可选 params/detail）、`ModelDefinition`、`PresetProviderInfo`、`PresetProvidersResult`、`refreshPresetCatalog` 结果的 TypeBox Schema；两个方法参数均为空对象。
- `desktop-host.ts` 注册第二个领域 `modelsHostDomain`；实现只调用既有 `listPresetProviders` / `refreshPresetCatalog`。
- preload `system.ts` 的 `models.listPresets` / `refreshPresetCatalog` 改走 `host.call`；`host-transport.ts` 的客户端方法类型扩为 Settings ∪ Models。
- 删除 `ipc/settings.ts` 中两个旧 handler 及对应 removeHandler；`refresh-preset-models`（带 key 参数）、`presets-updated` 事件与 auto-sync 保持原状。

### 不做

- 不迁移任何携带凭证的通道（`copy-api-key`、`refresh-preset-models`、`models:get/set` 等）——按 ADR-0152 第 7 条需单独评审。
- 不引入事件订阅原语（`presets-updated` 留旧通道，待快照+增量事件模型定稿）；不改 renderer；不动 Host 进程边界。

## Given / When / Then

- Given 设置页打开预设服务商区 / When `window.vetta.models.listPresets()` / Then 经 `vetta:host:request` 返回与旧通道一致的 `PresetProvidersResult`（含 catalogSource/catalogError）。
- Given 用户点击手动刷新 / When `window.vetta.models.refreshPresetCatalog()` / Then 返回 `{ok, error?, elapsedMs, modelCount}` 与旧通道一致；`vetta:models:list-presets` / `refresh-preset-catalog` 旧 handler 不再注册。
- 非法参数返回 `INVALID_PARAMS`；Host 侧结果不符合 Schema 返回 `INVALID_RESULT`。

## 测试与验证

- 失败用例先行：`desktop-host.test.ts` 断言 8 个方法注册与 models 领域透传（先 RED 再实现）。
- 定向：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/host/desktop-host.test.ts apps/desktop/src/preload/host-transport.test.ts`。
- `bun run check:quick -- <改动文件>`；`bun run test:impact -- <改动文件>`；`node scripts/quality/count-ipc-channels.mjs` 记录计数下降。

## 交付记录

- 实际修改（2026-11-07）：新增 `packages/host-protocol/src/domains/models.ts`（`models.listPresets` / `models.refreshPresetCatalog`，空参数为 `additionalProperties: false` 的封闭合同）并在包出口导出；`apps/desktop/src/main/host/models-domain.ts` 实现透传既有 `listPresetProviders` / `refreshPresetCatalog`；`desktop-host.ts` 注册第二领域；`ipc/settings.ts` 删除两个旧 handler 及 removeHandler（`refresh-preset-models`、auto-sync 与事件不动）；preload `system.ts` 两处改 `host.call`，`host-transport.ts` 客户端类型扩为 Settings ∪ Models。renderer 无改动（签名不变）。
- 失败用例先行：`desktop-host.test.ts` 先新增 4 用例 + 更新注册清单断言，RED 5 failed | 6 passed；实现转绿。
- 实际验证：定向 4 文件（desktop-host / host-transport / host.test / stream.test）24 例通过；`check:quick -- <8 个改动文件>` 通过（首轮 Biome 格式化 2 文件后复跑通过）；`bun run test:impact -- <7 个源文件>` 通过（desktop 与 host-protocol 受影响选择全绿，exit 0，1497.5s）；`count-ipc-channels` 由 693 降至 691（`ipc/settings.ts` 3 → 1）。
- 构建产物：`packages/host-protocol` 重新 `tsgo` 构建（dist 为 gitignore 生成物，仅本地解析需要；测试经仓库 runner）。
- 未运行与风险：完整 `bun run check` 未运行（docs-site/mobile 既有环境问题，见 TASK-0448/0453 记录）；设置页 UI 走查需授权未执行；settings 领域的空参数仍为宽松 `Type.Object({})`（本任务不改既有合同，如需封闭另行切片）；`presets-updated` 事件仍在旧通道。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）；完成标准为定向测试与门禁通过。
- 发布：不适用
