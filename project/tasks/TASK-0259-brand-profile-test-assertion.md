---
id: TASK-0259
type: task
status: verifying
priority: P2
owner: Desktop 渲染层测试
requirement:
plan:
source: BUG-0106
related_requirement: []
related_plan: []
related_tasks: [TASK-0249]
related_issues: []
related_bugs: [BUG-0106]
execution: serial
branch: main
worktree: unassigned（main 串行实施）
base_commit: 9801e62fc
read_paths: [apps/desktop/src/renderer/domains/plugins/runtime/plugin-official-models.test.ts, apps/desktop/src/renderer/domains/plugins/runtime/plugin-official-models.ts, apps/desktop/src/renderer/shared/components/ModelSelect/useModelOptions.ts, apps/desktop/src/renderer/domains/project/components/sidebar/SidebarTopBar.brand.test.tsx, apps/desktop/src/shared/desktop-brand.ts]
write_paths: [apps/desktop/src/renderer/domains/plugins/runtime/plugin-official-models.test.ts, project/bugs/BUG-0106-brand-profile-provider-display-name-test.md, project/bugs/README.md, project/tasks/TASK-0259-brand-profile-test-assertion.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 品牌档位相关测试断言改为引用品牌事实源

## 目标

让断言「provider 展示名」的用例随当前品牌档位成立，而不是写死某一档的品牌名，恢复 desktop 渲染层测试在默认档下的绿灯。

## 当前事实（证据）

见 BUG-0106：`useModelOptions.ts:122` 用 `${DESKTOP_BRAND.displayName} Go` 拼展示名，默认档为 `Allstr ai`，而用例期望写死 `Open Forge Go`；该文件没有 `VETTA_BRAND_PROFILE` 钉档。同型正确写法见 `SidebarTopBar.brand.test.tsx`（引用 `resolveDesktopBrandName`）。

## 范围

### 并发评估

- 结论：不支持并发（单文件测试断言改动）
- 执行方式：serial
- 可并行 Task：无（TASK-0250/0251/0252 写路径不相交，但本任务为存量红修复，先做）
- 前置依赖：无
- 冲突文件/独占路径：无
- Branch：main（沿用当前主检出）
- Worktree：不拆出（main 串行）
- 集成负责人：本轮 Agent
- 集成顺序：先于 TASK-0250

### 做

- 把该用例的展示名断言改为引用品牌事实源（`DESKTOP_BRAND.displayName` 或 `resolveDesktopBrandName`），使默认档与 `self` 档都能通过。
- 若同一文件还有其它写死品牌名的断言，一并按同一口径处理。

### 不做

- 不改 `useModelOptions.ts` 的生产行为（展示名随档位是预期行为）。
- 不改品牌解析与默认档口径。
- 不动其它包的测试。

## Given / When / Then

- Given 未设置 `VETTA_BRAND_PROFILE`，When 运行该测试文件，Then 全部用例通过，展示名断言等于 `Allstr ai Go`。
- Given 显式 `VETTA_BRAND_PROFILE=self`，When 同一运行，Then 展示名断言等于 `Open Forge Go`。

## 必须保持

- 用例仍证明「远程 provider 的展示名由品牌档案决定」，不弱化为只断言 remote 标记。
- 不新增档位钉桩来回避断言口径问题。

## 测试与验证

- 定向测试：`apps/desktop` 包内 `bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/plugins/runtime/plugin-official-models.test.ts`
- 质量检查：`bun run check`

## 验收分层

- 工程验证：待执行
- 技术评审：自审
- 集成：与 frontmatter `integration_status` 一致
- 人工功能验收：不适用（纯测试修复）
- 发布：未授权

## 功能验收包

- 入口与前置条件：无用户界面入口。
- 操作步骤或 AI 任务输入：运行该测试文件。
- 预期行为与最终产物：用例全绿且断言随档位变化。
- 不通过表现与已知限制：仍写死品牌名。
- 验收反馈及回归案例：待回填

## 交付记录

- 实际修改：`apps/desktop/src/renderer/domains/plugins/runtime/plugin-official-models.test.ts`——导入 `DESKTOP_BRAND`，用例标题去掉写死的品牌名，断言改为 `` `${DESKTOP_BRAND.displayName} Go` ``，并加一行注释说明展示名随档案。
- 实际运行：
  - 默认档：`apps/desktop` 包内 `bun ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/plugins/runtime/plugin-official-models.test.ts` → 4/4 通过。
  - `VETTA_BRAND_PROFILE=self` 同一命令 → 4/4 通过。
  - `bun run check` → exit 0。
- 未运行及原因：无（纯测试断言修复，无用户界面入口，人工验收不适用）。
- Worktree：不拆出（main 串行）
- 剩余风险：无已知风险；该文件仍不钉档位，断言随默认档变化而成立，这正是修复目的。
