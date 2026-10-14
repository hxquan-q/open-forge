---
id: BUG-0106
type: bug
status: investigating
priority: P2
owner: Desktop 渲染层测试
requirement:
plan:
source: TASK-0249 影响面复跑（2026-10-14）发现 desktop 渲染层测试恒红
related_requirement: []
related_plan: []
related_tasks: [TASK-0259]
related_issues: []
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 品牌档位翻转后 provider 展示名断言未同步，desktop 渲染层测试恒红

## 用户流程

- Given：开发者未设置 `VETTA_BRAND_PROFILE`（默认外部分发档）。
- When：在 `apps/desktop` 包内运行渲染层测试 `src/renderer/domains/plugins/runtime/plugin-official-models.test.ts`。
- Then：用例「列出登录后下发的远程 provider（Open Forge Go）」失败。

## 实际行为

`displayName` 实际为 `Allstr ai Go`，断言期望 `Open Forge Go`，用例失败（1 failed）。

## 期望行为

该用例断言的是「provider 展示名由当前品牌档案决定」，应随档位成立：默认档为 Allstr ai Go，显式 `VETTA_BRAND_PROFILE=self` 为 Open Forge Go；不应写死某一档的品牌名。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：仓库 `main`（本记录写入时 HEAD `9801e62fc`）、Windows 11、Bun 运行仓库统一 vitest runner。
- 失败测试/CI 用例与命令（若适用）：`apps/desktop` 包内 `bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/plugins/runtime/plugin-official-models.test.ts`。
- 基线对照或重跑结果：单独跑该文件稳定失败（非负载假红）；同一批次里的 `open-marketplace-*` 两个文件单跑 36/36 通过，证明其余失败属负载超时。

## 最小复现

1. 在 `apps/desktop` 包内运行上述命令。
2. 观察「Open Forge Go」用例的 `displayName` 差异。

## 影响

`apps/desktop` 渲染层测试在默认档下恒红，掩盖同批次真实回归；与 TASK-0249 的品牌改动无关（该用例不引用任何被改符号）。

## 根因证据

`apps/desktop/src/renderer/shared/components/ModelSelect/useModelOptions.ts:122` 用 `${DESKTOP_BRAND.displayName} Go` 拼展示名，而 `DESKTOP_BRAND` 由构建期 `VETTA_BRAND_PROFILE` 决定（`src/shared/desktop-brand.ts:24-28`）。REQ-0011 / TASK-0224 已把默认档翻转为 `distribution`，该用例的期望值仍写死 `Open Forge Go`，且文件内没有 `VETTA_BRAND_PROFILE` 钉档，属翻转时漏改的存量红。同型正确写法见 `src/renderer/domains/project/components/sidebar/SidebarTopBar.brand.test.tsx`（引用 `resolveDesktopBrandName(i18n.language)`）。

## 回归测试

修后该用例应在默认档与显式 `self` 档下都通过；断言改为引用品牌事实源而非字面量。

## 修复与验证

- 修复：TASK-0259——断言改为引用 `DESKTOP_BRAND.displayName`（不再写死品牌名），用例标题同步去掉具体品牌。
- 测试：默认档 4/4 通过、`VETTA_BRAND_PROFILE=self` 4/4 通过。
- 检查：`bun run check` exit 0。
- 未运行及原因：无。
