---
id: TASK-0250
type: task
status: verifying
priority: P1
owner: runtime-node / 工具描述
requirement: REQ-0013
plan:
source: REQ-0013；证据见本文件「当前事实」
related_requirement: [REQ-0013]
related_plan: []
related_tasks: [TASK-0249, TASK-0251, TASK-0252]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（main 串行实施）
base_commit: 2d17d66af
read_paths: [packages/runtime-node/src/coding/host/vetta-desktop-command-port.ts, packages/runtime-node/src/coding/shared/ocr-document.ts, packages/runtime-node/src/coding/tools/html-to-pdf/description.ts, packages/runtime-node/src/coding/tools/html-to-pdf/html-to-pdf-tool.ts, packages/runtime-node/src/coding/tools/extract-text-from-pdf/description.ts, packages/runtime-node/src/coding/tools/extract-text-from-pdf/extract-text-from-pdf-tool.ts, packages/runtime-node/src/coding/tools/extract-text-from-image/description.ts, packages/runtime-node/src/coding/tools/extract-text-from-image/extract-text-from-image-tool.ts]
write_paths: [packages/runtime-node/src/coding/host/vetta-desktop-command-port.ts, packages/runtime-node/src/coding/shared/ocr-document.ts, packages/runtime-node/src/coding/tools/html-to-pdf/description.ts, packages/runtime-node/src/coding/tools/extract-text-from-pdf/description.ts, packages/runtime-node/src/coding/tools/extract-text-from-pdf/extract-text-from-pdf-tool.ts, packages/runtime-node/src/coding/tools/extract-text-from-image/description.ts, packages/runtime-node/src/coding/tools/extract-text-from-image/extract-text-from-image-tool.ts, project/tasks/TASK-0250-runtime-user-visible-brand-strings.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# runtime-node 用户可见报错与工具描述去遗留品牌名

## 目标

让 agent 调用 PDF / OCR 类工具时，用户在对话里看到的工具描述与失败原因不再出现遗留品牌名。

## 当前事实（证据）

- `packages/runtime-node/src/coding/host/vetta-desktop-command-port.ts:81`：`Vetta Desktop executable not found. Set VETTA_DESKTOP_EXE or start Vetta Desktop once to write vettaAppPath.`
- `packages/runtime-node/src/coding/shared/ocr-document.ts:74,80`：`Vetta Desktop returned no parseable JSON on stdout` / `returned an invalid OCR document`。
- `packages/runtime-node/src/coding/tools/html-to-pdf/description.ts`、`extract-text-from-pdf/description.ts`、`extract-text-from-image/description.ts`：工具描述与 `extract-text-from-pdf-tool.ts:195,197`、`extract-text-from-image-tool.ts` 的失败文本写 "Vetta Desktop"。

## 范围

### 并发评估

- 结论：不支持并发（单包文案改动 + 对应测试）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无（与 TASK-0249 无写路径交集）
- 冲突文件/独占路径：无
- Branch：main（沿用当前主检出）
- Worktree：不拆出（main 串行）
- 集成负责人：本轮 Agent
- 集成顺序：排在 TASK-0249 之后

### 做

- 上述文本改中性表述（指代宿主应用而非品牌），保留 `VETTA_DESKTOP_EXE`、`vettaAppPath` 等冻结标识与文件路径字面量。
- 工具描述保持能力语义与既有字段说明不变，只去掉遗留品牌名。
- 新增或续写定向测试，断言这些文本不含 `Vetta`，且冻结标识仍原样出现。

### 不做

- 不改 `VETTA_DESKTOP_EXE` / `vettaAppPath` / 数据目录等兼容标识。
- 不改工具入参 Schema、错误码与失败分类。
- 不改包内注释里的历史词。
- 不改可执行文件兜底候选路径：该处硬编码路径指向旧品牌安装位置属独立功能缺陷，已登记 `BUG-0111`，不在本任务内修。

## Given / When / Then

- Given 任一档位，When Desktop 可执行文件定位失败，Then 用户看到的错误文本指代宿主应用且不含遗留品牌名，仍给出 `VETTA_DESKTOP_EXE` 这一可操作线索。
- Given 任一档位，When 用户查看 PDF / OCR 工具的描述，Then 描述不含遗留品牌名且能力语义不变。

## 必须保持

- 错误可操作性：失败文本仍需指出可用的定位手段。
- 工具 Schema、调用契约与失败分类不变。

## 测试与验证

- 定向测试：`bun run test:pkg @vetta/runtime-node`（或对应定向文件）
- 质量检查：`bun run test:impact -- <改动文件>`、`bun run check`

## 验收分层

- 工程验证：待执行
- 技术评审：自审
- 集成：与 frontmatter `integration_status` 一致
- 人工功能验收：待验收
- 发布：未授权

## 功能验收包

- 入口与前置条件：Desktop 会话中触发一次 PDF 或 OCR 工具失败。
- 操作步骤或 AI 任务输入：让 agent 转换一个不存在的 HTML 文件为 PDF。
- 预期行为与最终产物：失败提示可读、无遗留品牌名。
- 不通过表现与已知限制：提示仍写 Vetta Desktop。
- 验收反馈及回归案例：待回填

## 交付记录

- 实际修改：
  - `src/coding/host/vetta-desktop-command-port.ts`：定位失败的报错改为「Desktop app executable not found. Set VETTA_DESKTOP_EXE or start the Desktop app once to write vettaAppPath.」（保留 `VETTA_DESKTOP_EXE` 与 `vettaAppPath` 两个可操作线索）。
  - `src/coding/shared/ocr-document.ts`：两条解析失败文本改为 `Desktop OCR helper returned …`。
  - 三个工具描述（`html-to-pdf` / `extract-text-from-pdf` / `extract-text-from-image` 的 `description.ts`）：`Vetta Desktop's …` → `the Desktop app's …`，`This tool calls the Vetta Desktop executable … Vetta Desktop must be installed` → `the Desktop app executable … The Desktop app must be installed`；能力语义与字段说明不变。
  - 三个工具实现的失败文本：`Vetta Desktop PDF generation failed` / `Vetta Desktop OCR failed` / `Vetta Desktop returned …` → `Desktop PDF …` / `Desktop OCR …` / `Desktop PDF renderer …`。
  - 9 个改动文件补 `Modified by The Open Forge contributors.` 声明头。
  - 测试：`vetta-desktop-command-port.test.ts` 新增「定位失败报错不含遗留品牌名且保留 `VETTA_DESKTOP_EXE`」；新增 `test/coding-suite/desktop-tool-copy-brand.test.ts`（三个描述不含遗留品牌名 + 保留冻结标识、四个实现文件源码守卫）。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run test/coding-suite/vetta-desktop-command-port.test.ts test/coding-suite/desktop-tool-copy-brand.test.ts` → 2 文件 / 10 例通过。
  - `bun run test:pkg runtime-node` → 84 文件 / 529 例通过（52.4s）。
  - `bun run check:lint` / `bun run check:guards` / `bun run check:types` 的剩余红全部落在并行会话在途文件上（`apps/desktop/src/main/agent-teams/team-turn-coordinator.ts` 格式、`packages/runtime-core/{src,test}/**` 声明头与类型），与本任务路径无交集；本任务改动的 9 个文件 lint 与声明头均通过（guards `missing` 列表不含本任务文件）。
- 未运行及原因：未在真实 Desktop 上触发一次 PDF/OCR 失败做人工验收（需启动 dev 实例授权）。
- Worktree：不拆出（main 串行）
- 剩余风险：
  - 兜底可执行文件候选路径仍指向旧品牌安装位置（`vetta-desktop-command-port.ts:70-73`），属独立功能缺陷 `BUG-0111`，本任务未改。
  - `%APPDATA%\Vetta`（沙箱放行根）与 `X-Vetta-*` 头等冻结标识按约定保留不动；Windows 路径大小写不敏感，`APP_RUNTIME_NAME=vetta` 的实际目录仍能命中。
