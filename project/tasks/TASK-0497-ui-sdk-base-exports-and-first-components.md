---
id: TASK-0497
type: task
status: done
priority: P2
owner: packages/theme-ui + packages/ui
requirement: REQ-0008
plan: PLAN-0032
source: upstream 556fd7ad7（ButtonGroup）+ 11a71308b（VettaKbd）+ 107d85bbc（ADR-0148 细粒度导出，部分）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0495, TASK-0496]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: d088554bc
read_paths:
  - packages/ui/package.json
  - packages/ui/src/index.ts
  - packages/ui/src/utils.ts
  - packages/ui/src/button.tsx
  - packages/theme-ui/package.json
  - packages/theme-ui/src/shared/index.ts
  - packages/theme-ui/src/shared/MacKeyboardPreview.tsx
  - apps/desktop/src/renderer/public-ui-exports.test.ts（上游对照，本地无此文件）
  - project/plans/PLAN-0003-open-forge-rebrand.md
write_paths:
  - packages/ui/package.json
  - packages/ui/src/button-group.tsx
  - packages/ui/src/button-group.test.tsx
  - packages/ui/src/index.ts
  - packages/theme-ui/package.json
  - packages/theme-ui/src/shared/VettaKbd.tsx
  - packages/theme-ui/src/shared/VettaKbd.test.tsx
  - packages/theme-ui/src/shared/kbd-keys.ts
  - packages/theme-ui/src/shared/kbd-keys.test.ts
  - packages/theme-ui/src/shared/index.ts
  - apps/desktop/src/renderer/public-ui-exports.test.ts（可选，若移植）
  - project/tasks/TASK-0497-ui-sdk-base-exports-and-first-components.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-24
updated: 2026-11-24
---
<!-- Copyright The Open Forge contributors. -->

# UI SDK 底座 · 第一批：细粒度导出落地口径 + ButtonGroup + VettaKbd（PLAN-0032 P2 切片 1）

## 背景与决策落地（D2）

PLAN-0032 D2 已拍板「跟进细粒度导出，作为 P2 第一个 Task」。侦察澄清了上游 ADR-0148 的真实口径，本 Task 按它落地，不复刻上游 206 行导出表：

- **上游不是全量文件级。** `upstream/dev:packages/theme-ui/package.json` 的 206 条里绝大多数是 `{types, import}` 双值重复 + 仍保留目录 barrel（`./chat`、`./settings` 等）。**只在首屏需要单独直通的文件上加文件级子路径**（如 `./activity/code-preview`、`./app-boot`）。
- **本地的对应物 = 给移植组件加它们需要的子路径，用上游同名子路径**，保证后续 P2–P8 移植时组件内 `import "@vetta-org/theme-ui/xxx/FileName"` 不改写。
- **`Vetta` 前缀保留。** 本地命名先例已确立：移植的 `VettaGoCard`（`packages/theme-ui/src/computer-use/ComputerUseView.tsx:156`）保留 `Vetta*` 标识符；包名仍叫 `@vetta-org/ui`。故 VettaKbd 不改名，D2 的命名问题就此关闭。

## 目标

1. 在 `@vetta-org/ui` 的 `exports` 与 `index.ts` 增加以下子路径（与上游同名）：`./button-group`。本次只加这一个——其余 4 个 P2 组件（Stepper/ColorSwatchPicker/SessionTopItem/StepSlider）在后续切片里连同它们的子路径一起进。
2. 在 `@vetta-org/theme-ui` 的 `exports` 增加 `./shared` 下 VettaKbd 所需的直通子路径（按上游 `shared/` 的实际暴露形式，若上游用目录 barrel 则本地沿用，不单开文件级）。
3. 移植 ButtonGroup（`packages/ui/src/button-group.tsx` + `.test.tsx`，合并上游 556fd7ad7 + 样式迭代 1cdb283d2/8353a62d7/ce89aada1/3ad290027/0c177dc97 的最终态，不逐提交搬）。
4. 移植 VettaKbd（`packages/theme-ui/src/shared/` 下 `VettaKbd.tsx` + `VettaKbd.test.tsx` + `kbd-keys.ts` + `kbd-keys.test.ts`）。

## 不做

- 不把 theme-ui 的 20 个目录 barrel 改成文件级（本地 `index.ts` 仅 21 个 `export *`，粒度与上游 barrel 同级，无首屏证据要求现在动它）。
- 不移植其余 4 个 P2 组件（各自有独立上游提交链，留后续切片）。
- 不动 plugin-ui 开放（a50993e86、448165e57）与转发清单（属 P2 后续切片的 D3 登记范围）。
- 不处理 7 处裸 `from "@vetta-org/theme-ui"` 导入的首屏性能问题——其中 `shared/theme/registry.ts`、`themeSharedModules.ts` 在启动路径上，会拉全部 20 个 barrel。**这是独立的性能切片**，列入附带发现，不在本 Task 捆绑。

## 附带移植：exports 合同测试

上游 `apps/desktop/src/renderer/public-ui-exports.test.ts` 用 Vite `createServer` + `pluginContainer.resolveId` 断言每个 `exports` 子路径解析到真实源文件，防导出表腐化。本地**没有**该文件。若其依赖（vite、ts）在本地测试链可用且体量可控，连同本 Task 一起移植，覆盖新增子路径；不可用则记入未做项。

## 文件头

移植的上游文件在 `check-modified-file-notices.mjs` 下按 fork 修改处理（merge-base 不动），需 `// Modified by The Open Forge contributors.`；本地已有移植先例（`packages/ui/src/drawer.tsx`、`shared/SegmentedControl.tsx`）带此头。

## 验收（Given/When/Then）

- Given `@vetta-org/ui` 新增 `./button-group` 子路径，When `import { ButtonGroup } from "@vetta-org/ui/button-group"`，Then 解析到 `packages/ui/src/button-group.tsx` 且类型可用。
- Given VettaKbd 移植完成，When 渲染 `keys="mod+shift+k"`，Then 按平台输出键帽符号，`kbd-keys` 单测覆盖 describe/resolve/detect。
- Given 新增子路径，When 运行 `bun run check`，Then 类型检查通过；移植组件的 vitest 用例全过。

## 验证

- `bun run check`（lint + types + guards）✓
- `bun scripts/quality/run-vitest.mjs` 针对新增 `.test.tsx`/`.test.ts`：21/21 通过 ✓
- `bun run test:impact -- packages/ui packages/theme-ui`：超时转后台未完成，vitest 已覆盖新增文件，影响面为纯新增无消费方改动

## DESIGN 例外（移植原语登记模式）

ButtonGroup 与 VettaKbd 沿用上游视觉语言，与本地 D01/D02/D03/D05/D07 结构性冲突。**不改写上游设计**（偏离移植目标），采用登记豁免：

- `scripts/quality/baselines/design-exceptions.json` 新增 `exemptedTokens`，逐文件逐规则计允许 token 数；`check-autonomy` 读它注入 `auditDesign`。
- `auditDesign` 第三参（exemption 函数）支持词内位置豁免——任意值里的 `rgb()/rgba()` 不再误报 D01。
- `apps/desktop/DESIGN.md` 已知例外段登记两组件，说明 D03 `<button>` 在原语层是误报（组件本身就是按钮封装）。
- 后续 P2 切片（Stepper、ColorSwatchPicker、SessionTopItem、StepSlider）按同一模式登记，不改写上游 token。

## 未做项与风险

- 裸 index 导入的首屏瀑布（7 处）留待独立性能切片；本 Task 只铺底不改消费方。
- exports 合同测试若本地缺 vite/ts 测试依赖则缓移，导出表暂靠 code review 保同步。
