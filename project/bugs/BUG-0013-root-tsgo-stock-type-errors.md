---
id: BUG-0013
type: bug
status: done
priority: P1
owner: packages/runtime-core
source: bun run check（根 tsgo 门禁）
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: [PLAN-0001]
related_tasks: [TASK-0094, TASK-0095]
related_issues: []
related_bugs: [BUG-0011]
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 根 tsgo 门禁存量类型错误阻断 `bun run check`

## 实际行为

`bunx tsgo --noEmit`（根 `tsc` 门禁，由 `bun run check` 的 `check:types` 调用）报告 7 个类型错误，分布在 4 个测试文件：

1. **`packages/runtime-node/test/conversation/task-fact-persistence.test.ts`**（1 个错误）
   - L51：`identity` 中传入已在合同里移除的 `generation`（TS2353）

2. **`packages/runtime-storage/test/conversation/task-fact-record-schema.test.ts`**（1 个错误）
   - L19：同上（TS2353）

3. **`packages/coding-agent/test/runtime-core/context-runtime.test.ts`**（4 个错误）
   - L1550、L1598、L1629、L1677：`port: { record: (record) => records.push(record) }` 简洁箭头把 `Array.push` 的 `number` 泄漏到声明为 `void | Promise<void>` 的观察端口上（TS2322）

4. **`packages/coding-agent/test/session-assistance-runtime.test.ts`**（1 个错误）
   - L118：`refreshAvailableModels: vi.fn()` 的 `Mock<Constructable | Procedure>` 不可赋值给 `() => void`（TS2322）

## 期望行为

`bunx tsgo --noEmit` 零错误，`bun run check` 在干净树上全绿。

## 最小复现

```bash
bunx tsgo --noEmit
```

## 根因

两组，各自独立：

- **合同先行、fixture 未跟随**：`c647a2513`（`fix(runtime): Task 合同 fail-closed 重放与逐 Turn generation 绑定`）刻意把 Task 身份收敛为 `taskId` + `rootSessionId`，generation 移到 `RuntimeTaskSnapshot.activeGeneration` 并由 `task.turn_bound` 逐次记录。两个 fixture 仍把 `generation` 放在 `identity` 里，且没有任何断言读取它——纯遗留字段，不是有意的场景。
- **签名收严后测试未跟随**：观察端口的 `record` 合同是 `void | Promise<void>`，简洁箭头返回 `push` 的 `number`；`vi.fn()` 的默认泛型含可构造签名，无法满足 `() => void`。类型检查此前未覆盖这些文件或未执行到，故长期未暴露。

置信度：高。两组错误都能在 `git log` 中定位到各自引入的提交与类型定义（`packages/runtime-core/src/task/contracts.ts`、`packages/runtime-core/src/runtime-host/session-ports.ts`）。

## 影响

- **阻塞门禁**：`bun run check` 红，违反仓库「一轮任务完成跑一次完整 check」的交付要求，任何任务都无法声明验证通过。
- **发布风险**：`check:types` 是发布流水线 quality 阶段的一部分，长期红会掩盖新增错误。
- 无运行时行为影响：4 个文件全部是测试，生产代码未受影响。

## 回归测试

现有测试本身就是回归面：改动后 4 个文件全部通过（`context-runtime` 41 例、`session-assistance-runtime` 等），且 `identity` 的 `generation` 无人断言，移除后覆盖面无损失。门禁本身由 `bunx tsgo --noEmit` 持续看护。

## 修复

- A（合同跟随）：移除两个 fixture 中 `identity.generation`，与 `RuntimeTaskIdentity` 对齐。
- B（签名跟随）：`context-runtime.test.ts` 的 4 处观察端口回调改为块体；`session-assistance-runtime.test.ts` 的 mock 按仓库既有范式（`image-normalization.test.ts`）标注 `vi.fn<RuntimeSessionModelView["…"]>`。

## 验证

- `bunx tsgo --noEmit`：0 错误
- 4 个受影响测试文件：54 例通过
- `bun run check:lint`、`bun run check:guards`：通过

## 剩余风险

无。两组修复都只收敛测试与既有合同的一致性，未改变生产代码、类型定义或运行时行为。
