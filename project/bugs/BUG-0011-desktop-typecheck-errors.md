---
id: BUG-0011
type: bug
status: done
priority: P0
owner: apps/desktop
source: runReleaseChecks typecheck gate
created: 2026-01-10
updated: 2026-01-10
related_requirement: [REQ-0005]
related_plan: [PLAN-0005]
related_tasks: [TASK-0052]
related_issues: [ISSUE-0007]
related_bugs: [BUG-0004]
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Desktop TypeScript 类型检查存量错误阻断发布准备

## 实际行为

`bun run --cwd apps/desktop typecheck` 报告 11 个类型错误，分布在 4 个文件：

1. **`src/main/browser-automation/webview-agent-guest.ts`**（6 个错误）
   - `parent` 隐式 `any` 类型，因其在初始化器中直接或间接引用自身（L101, L172）
   - `node` 类型为 `unknown`（L106, L177）
   - `Element` 类型上不存在 `isContentEditable` 和 `innerText` 属性（L235）

2. **`src/renderer/domains/abilities/components/detail/PluginPermissionVisual.tsx`**（3 个错误）
   - 联合类型中 `uiPreview` 不是所有成员的共有属性（L54, L55）
   - `"interface"` 不可赋值给目标 group 联合类型（L57）

3. **`src/main/artifacts/canvas-artifact-service.test.ts`**（1 个错误）
   - 尝试赋值给只读属性 `service`（L277）

4. **`src/renderer/domains/settings/components/useBuiltinMcpSecretsDialogModel.test.tsx`**（1 个错误）
   - `undefined` 不可赋值给 `BuiltinMcpPreset | null`（L17）

## 期望行为

`apps/desktop/typecheck` 必须通过，才能执行 `scripts/release-desktop.mjs prepare`，进而切换到 Open Forge 首发版本 `0.1.0`。

## 最小复现

```bash
bun run --cwd apps/desktop typecheck
# 或
bun x tsc --noEmit -p apps/desktop/tsconfig.json
```

立即报告上述 11 个错误。

## 根因

BUG-0004 修复后，Desktop 类型检查实际执行，暴露了此前被静默忽略的存量类型错误。这些错误在 `runReleaseChecks()` 中阻断发布准备流程。

## 影响

- **阻塞发布**：无法执行 `prepare --version 0.1.0 --initial`，Open Forge 首发版本切换被挂起
- **质量门禁**：`bun run check:types` 失败，影响所有需要完整类型检查的工作流

## 修复策略

逐文件修复，每个文件的修复应：
1. 最小化改动范围，只修复类型错误本身
2. 保持运行时行为不变
3. 优先使用明确的类型标注而非 `any`
4. 测试相关文件可适当调整断言或 mock

## 验证

- 修复后运行：`bun run --cwd apps/desktop typecheck`
- 必须零错误通过
- 运行：`bun run check:quick -- <changed files>`
- 相关组件或测试应保持功能正常

## 交付要求

- 单独提交，Commit Message：`fix(desktop): 修复 TypeScript 类型检查的 11 个存量错误`
- 不混入版本切换或其他无关改动
