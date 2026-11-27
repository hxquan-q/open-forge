---
id: TASK-0546
type: task
status: verifying
priority: P3
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0545]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 3999d212d
read_paths: []
write_paths:
  - apps/desktop/src/main/models/presets/catalog.ts
  - apps/desktop/src/main/models/presets/sync.ts
  - apps/desktop/src/main/models/presets/sync.test.ts
  - project/tasks/
  - project/research/RESEARCH-0052-upstream-0.6.20-0.6.31-commit-triage.md
  - .github/release-notes/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# Kimi 预设分国际站与国内站（上游 5fd12b81f）

## 合同

- 来源与目标：上游 `5fd12b81f`。国际站与国内站 API Key 互不通用，原来只有一个不标区域的 Kimi（实际连国际站），国内站用户填 key 只会得到鉴权失败。拆成「Kimi (Global)」与「Kimi (China)」两个预设，分别对应 `api.moonshot.ai` 与 `api.moonshot.cn`，共享同一份 models.dev 目录条目（`catalogId: "kimi"`）。台账 RESEARCH-0052「改写后采纳」区。
- 落点核对结论（2026-11-27）：
  - 本仓 `catalog.ts` 与上游结构一致（同一份 PRESET_PROVIDERS 形状，无 `catalogId`），可直接按上游 diff 移植。
  - 本仓 `sync.ts` 有分叉（无 `managedBy`、refresh 签名不带 baseUrl、adoptedPresetIds 无 disabled 过滤），但 `catalogModelsFor` 与 `refreshPresetModels` 中 `enrichModelsFromCatalog` 的调用形状与上游相同，只改 `def.id` → `presetCatalogId(def)` 两处三调用。
  - 本仓 `sync.test.ts` 缺 upstream 的 `mocks.snapshot` 重构与新增 Kimi describe；测试按上游最终态移植（不涉及本仓分叉面）。
  - 目录生成侧 `PROVIDER_KEYS` 不加 `kimi-cn`——快照 `providers` 按预设 id 作 key 只写 `kimi` 一份，`kimi-cn` 经 `catalogId` 共享读取，CATALOG_VERSION 与快照不变（上游同口径）。
  - 余额注册表 `registry.ts` 按域名匹配已兼容 `api.moonshot.cn`，无需改动。
  - 渲染端无硬编码预设清单（rg 确认），预设列表与 icon 合同测试自动覆盖新条目。
- 输入 → 输出：上游最终态语义 → 预设服务商出现 Kimi (Global) / Kimi (China) 两项，各连各站，未填 key 时两者看到同一份目录模型。
- 做 / 不做：catalog 拆分 + catalogId 机制 + sync 两处目录查询改写 + 上游测试移植；不做 `PROVIDER_KEYS` 加家、CATALOG_VERSION 提升、快照重生成、余额注册表改动。
- Given / When / Then：
  - 列出预设服务商 → 存在 `kimi`（displayName "Kimi (Global)"、baseUrl api.moonshot.ai/v1）与 `kimi-cn`（displayName "Kimi (China)"、baseUrl api.moonshot.cn/v1）两项。
  - 目录 `providers.kimi` 有模型、未填 key → 两个预设的 catalogModels 都是同一份模型列表。
  - 已启用旧 `kimi` 的用户 → 不受影响（id 不变，即国际站）。
  - 带 key 刷新 `kimi-cn` → `enrichModelsFromCatalog` 以 `kimi` 为目录 key 补元数据。
- 保留：CATALOG_VERSION=8 与随包快照不动；`PROVIDER_KEYS` 不加 kimi-cn；`isChatModel` 过滤口径两站一致。
- 验证：移植上游 sync.test.ts 新增 describe（目录断言用 toMatchObject/toEqual 值断言，无新增 `toHaveBeenCalled*`）；定向跑 presets 相关测试；`bun run test:impact`；`bun run check`。
- 人工验收：不适用（预设列表为数据驱动，行为由 sync 测试锁定）。

## 交付

- 实施（2026-11-27）：
  - `catalog.ts`：`catalogId?: string` 接口字段、kimi 改名 "Kimi (Global)" + 区域注释、kimi-cn 新条目（baseUrl api.moonshot.cn/v1、catalogId "kimi"）、`presetCatalogId` 导出——与上游同区段逐字一致（刻意不带回 managedBy 分叉字段）。
  - `sync.ts`：`catalogModelsFor` 两处与 `refreshPresetModels` 一处 `def.id` → `presetCatalogId(def)`。
  - `sync.test.ts`：snapshot mock 重构为可变 `mocks.snapshot` + 新增 Kimi describe（与上游 5fd12b81f 逐字一致）。
- 验证（全部实际执行）：
  - 定向测试：sync.test.ts 3/3；presets+balance 目录 9 文件 88 用例全过（含 icon 合同测试自动覆盖 kimi-cn）。
  - `bun run test:impact`（catalog.ts+sync.ts）：8 文件 91 用例全过。
  - `bun run check`：lint/types/guards/mobile 全绿；声明头审计 missing=0。
  - 独立 verifier 复查结论 complete：移植逐字比对通过、启用/拉取/同步/余额四条链闭环实证（kimi-cn 独立 key 与 templateId、fetch 走 .cn、enrich 共享 kimi 目录、余额按域名+自带 baseUrl 打 .cn）；变异测试实证断言非恒真（退回 def.id 后 Kimi describe 如期失败）；分叉约束全部成立。
- 未运行：人工 UI 验收（合同定为不适用）。
- 风险/观察：两站共用同一 icon symbol，仅靠 displayName 区分（上游设计如此）；kimi-cn 启用条目落 models.json 的 key 与 templateId 均为 kimi-cn，与旧 kimi 完全独立、无迁移负担。
