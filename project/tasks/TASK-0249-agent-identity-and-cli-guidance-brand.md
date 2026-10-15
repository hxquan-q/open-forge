---
id: TASK-0249
type: task
status: in_progress
priority: P1
owner: coding-agent / Desktop 会话装配
requirement: REQ-0013
plan:
source: REQ-0013；根因见本文件「当前事实」
related_requirement: [REQ-0013]
related_plan: []
related_tasks: [TASK-0250, TASK-0251, TASK-0252]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（main 串行实施）
base_commit: 2d17d66af
read_paths: [packages/coding-agent/src/model-context/system-prompt-policy.ts, packages/coding-agent/src/model-context/system-prompt-sources.ts, packages/coding-agent/src/model-context/prompt-runtime.ts, packages/coding-agent/src/composition/turn/capability-session-assembly.ts, packages/coding-agent/src/public-api/cli-guidance.ts, packages/coding-agent/test/system-prompt.test.ts, packages/coding-agent/test/personalization-prompt.test.ts, apps/desktop/src/main/conversations/resolve-session-config.ts, apps/desktop/src/main/dev-cli-shim.ts, apps/desktop/src/shared/desktop-brand.ts]
write_paths: [packages/coding-agent/src/model-context/system-prompt-policy.ts, packages/coding-agent/src/model-context/system-prompt-sources.ts, packages/coding-agent/src/public-api/cli-guidance.ts, packages/coding-agent/test/system-prompt.test.ts, packages/coding-agent/test/system-prompt-brand.test.ts, apps/desktop/src/main/conversations/resolve-session-config.ts, project/tasks/TASK-0249-agent-identity-and-cli-guidance-brand.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# agent 身份行与 CLI 指引按品牌档位渲染

## 目标

让 agent 自称与它对自己宿主的称呼来自当前品牌档位，而不是包内硬编码的 Vetta。

## 当前事实（证据）

- `packages/coding-agent/src/model-context/system-prompt-policy.ts:16`：`SUBCONSCIOUS = "**Your name is Vetta. You are an AI assistant.**"`，在 `:419` 无条件作为 `core.subconscious`（优先级 100）注入每个会话。
- 同文件 `:54`：`VETTA_CLI_GUIDANCE = "# Vetta Desktop CLI ..."`，正文含 "Vetta Desktop" 与 "Vetta CLI"；`:39/:41/:43` 三个内置工具描述写 "Vetta Desktop's ..."。
- 指引由 `apps/desktop/src/main/conversations/resolve-session-config.ts:185-190` 追加进会话 `appendSystemPrompt`，开关 `experimental.vettaCli` 默认开（`apps/desktop/src/main/agent-settings/agent-settings-service.ts:25`）。
- 指引文本写 `use \`vetta action\``，但 `apps/desktop/src/main/dev-cli-shim.ts:15-17` 只安装 `openforge`，并把 `vetta` / `vetta.cmd` / `vetta.exe` 作为旧品牌名清理、不保留别名。指引里的命令名与实现不一致，需在实施时确认打包态安装的命令名后对齐。
- 宿主 options 接缝已存在：`BuildSystemPromptOptions`（`system-prompt-policy.ts:154`）与 `SystemPromptSourceDependencies`（`system-prompt-sources.ts:31`），无需新架构。

## 范围

### 并发评估

- 结论：不支持并发（同一接缝的连续改动 + 一个测试面）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：无；TASK-0250/0251/0252 的写路径与本任务不相交
- Branch：main（沿用当前主检出）
- Worktree：不拆出（单线小改，主检出串行）
- 集成负责人：本轮 Agent
- 集成顺序：本任务先做，随后 0250 → 0251 → 0252

### 做

- `BuildSystemPromptOptions` 与 `SystemPromptSourceDependencies` 增 `productName?: string`，缺省为开源口径 `Open Forge`（与 `packages/runtime-storage` 既有包级品牌用法一致）。
- 身份行按 `productName` 渲染；`VETTA_CLI_GUIDANCE` 常量改为按产品名构造的工厂函数，`@vetta/coding-agent/cli-guidance` 公共导出同步改名，语义与段落顺序不变。
- 内置工具描述里的 "Vetta Desktop's ..." 改中性表述（工具描述描述能力，不承担产品身份）。
- `apps/desktop` 在装配会话时注入 `resolveDesktopBrandName(界面语言)`，使默认档得到小爱ai / Allstr ai、`self` 档得到 Open Forge。
- 对齐 CLI 指引里的命令名与实际安装的命令名。
- 新增回归测试：装配后的会话系统提示词不含 `Vetta` / `Vetta Desktop`；两档身份词各自正确。

### 不做

- 不改 runtime-node 报错与工具描述（TASK-0250）。
- 不改系统插件文案（TASK-0251）。
- 不改 Desktop i18n 组合词与门禁（TASK-0252）。
- 不改角色、工具路由规则文本、prompt block 顺序与缓存边界语义。

## Given / When / Then

- Given 未设置 `VETTA_BRAND_PROFILE`，When 装配 Desktop 会话系统提示词，Then 身份行与 CLI 指引出现「小爱ai」（中文界面）/「Allstr ai」（英文界面），且全文无 `Vetta` / `Vetta Desktop`。
- Given 显式 `VETTA_BRAND_PROFILE=self`，When 同一装配，Then 出现 `Open Forge`。
- Given 宿主未注入 `productName`（CLI / SDK 直用），When 构造提示词，Then 身份词为 `Open Forge` 且构造不失败。

## 必须保持

- prompt block 顺序、`core.subconscious` 的优先级与缓存可缓存性不变。
- CLI 指引的语义段落与工具路由规则文本不变（只换产品词与命令名）。
- 工具调用、错误、取消、usage、stop 语义不变。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/coding-agent/test/system-prompt.test.ts packages/coding-agent/test/system-prompt-brand.test.ts`
- 用户流程：Desktop 会话装配产出的提示词文本断言（不启动真实模型）。
- 质量检查：`bun run test:impact -- <改动文件>`、`bun run check`

## 验收分层

- 工程验证：待执行
- 技术评审：自审
- 集成：与 frontmatter `integration_status` 一致
- 人工功能验收：待验收（需真实 dev 会话问一次「你是谁」）
- 发布：未授权

## 功能验收包

- 入口与前置条件：dev 启动 Desktop（默认档），新建会话。
- 操作步骤或 AI 任务输入：问「你是谁 / 你叫什么名字」。
- 预期行为与最终产物：回答使用界面品牌名，不出现 Vetta / Vetta Desktop。
- 不通过表现与已知限制：仍自称 Vetta；或提示词装配报错。
- 验收反馈及回归案例：待回填

## 交付记录

- 实际修改：
  - `packages/coding-agent/src/model-context/system-prompt-policy.ts`：身份行改为按 `productName` 渲染（新增 `DEFAULT_PRODUCT_NAME = "Open Forge"` 与 `identityLine()`）；`VETTA_CLI_GUIDANCE` 常量改为 `buildDesktopCliGuidance(productName)` 工厂（`{{product}}` 占位替换）；三个内置工具描述里的 "Vetta Desktop's …" 改中性表述 "the Desktop app's …"。
  - 品牌名沿既有宿主接缝注入：`CodingAgentPromptRuntimeSources.productName`（`composition/contracts/runtime-composition-options.ts`）→ `capability-session-assembly.ts` 的 `runtimeSourceFactory` 返回类型与 `CodingAgentPromptRuntime` 构造 → `prompt-runtime.ts` → `system-prompt-sources.ts` → `BuildSystemPromptOptions.productName`。
  - `packages/coding-agent/src/public-api/cli-guidance.ts`：导出改为 `buildDesktopCliGuidance`。
  - `apps/desktop/src/main/agent-runtime/resource-runtime.ts`：`createDesktopPromptRuntimeSources` 返回 `productName: resolveDesktopBrandName(getAppLanguage())`。
  - `apps/desktop/src/main/conversations/resolve-session-config.ts`：CLI 指引改用 `buildDesktopCliGuidance(品牌名)`。
  - 命令名对齐：指引内 `vetta action` / `vetta action -h` / `vetta action search` 改为 `openforge action`（dev 与打包实际安装的命令名，见 `dev-cli-shim.ts:15-17` 明确不保留旧名别名）。这是行为变化，验收需单独确认。
  - 测试：`system-prompt.test.ts` 改按工厂与新命令名断言；`public-api-subpaths.test.ts` 同步；`personalization-prompt.test.ts` 注释；新增 `test/system-prompt-brand.test.ts`（身份行默认档与注入档、指引品牌词、冻结命令名与 `.vetta` 路径保留、提示词事实源文件无遗留品牌名）。
  - `docs/agent/tool-routing-evaluation.md`：符号引用同步为重命名后的 `buildDesktopCliGuidance`。
  - 命名口径：实现层标识一律用 `brandName` / `{{brand}}`，不用 `productName`——coding-agent 架构守卫（`check-coding-agent-architecture`）把 ASCII `product` 列为退役架构层术语，实现层不得再出现。
  - 补声明头：4 个相对 `upstream/dev` 改动的文件加 `// Modified by The Open Forge contributors.`（`resource-runtime.ts`、`model-context/prompt-runtime.ts`、`public-api/cli-guidance.ts`、`test/public-api-subpaths.test.ts`）。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run packages/coding-agent/test/system-prompt.test.ts packages/coding-agent/test/system-prompt-brand.test.ts packages/coding-agent/test/public-api-subpaths.test.ts packages/coding-agent/test/personalization-prompt.test.ts` → 4 文件 / 45 例通过。
  - `apps/desktop` 包内定向：`resolve-session-config.test.ts`、`resource-runtime.remote.test.ts`、`runtime-host-contract.test.ts`、`runtime-host-capabilities.test.ts`、`session-model-restore.test.ts` → 通过。
  - `bun run test:impact -- <改动文件>`：coding-agent 124s 通过、cli-host 385s 通过、runtime-desktop 14s 通过；desktop 包 830s 报 4 failed tests / 7 failed files。
  - 全量 desktop 复跑（完整输出）：4 个失败为收集期崩溃（`process.resourcesPath` 未定义，0 用例），另 3 个为负载超时。单跑对照：`open-marketplace-*` 两文件 36/36 通过（假红）；`plugin-official-models.test.ts` 稳定失败，根因是品牌档位断言未随默认档翻转，与本任务无依赖关系（`useModelOptions.ts:122` 的 `DESKTOP_BRAND.displayName`），已另立 `BUG-0106` 并在 `TASK-0259` 修复（默认档与 self 档各 4/4 通过）；收集期崩溃经「回退本任务改动后仍原样失败」对照确认为存量红，登记 `BUG-0107`。
  - `bun run check:lint` → 4811 文件 0 错误（首轮 3 处 import 顺序/格式，已修）。
  - `bun run check` → exit 0（lint / types / guards / mobile-lint 全绿；声明头 ratchet `new=0`；coding-agent 架构守卫 ok）。
- 未运行及原因：
  - 未运行真实模型回合：改身份行与指引会改变模型行为，路由评估需模型授权（未获授权），已记入剩余风险。
  - 未运行 `verify:ui:*`：本任务未获启动 dev 实例的授权。
- 提交与共享文件：本次提交只带本任务作者路径。`project/tasks/README.md`、`project/bugs/README.md` 与 `.github/release-notes/v0.1.3.md` 当前同时含并行会话（BUG-0108/0109/0110、TASK-0260/0261/0262）未提交的行与条目，为避免夹带他人未完成工作未纳入本次提交；本任务的焦点行与发布说明条目已写入磁盘，随共享文件的下一次提交一并入库。`project/requirements/README.md` 只有本任务的行，已纳入提交。
- Worktree：不拆出（main 串行）
- 剩余风险：
  - 身份行与指引改动改变模型行为，`docs/agent/tool-routing-evaluation.md` 的路由评估与人格化提示合同需同步复核，必要时重跑评估（未获模型授权前不执行）。
  - 品牌名在会话创建时固化（`createDesktopPromptRuntimeSources` 每会话调用一次）；会话进行中切换界面语言不会改写既有会话的提示词，新会话生效。
  - 存量 stale 引用未在本任务处理：`apps/desktop/src/main/app-actions/AGENTS.md:37`、`docs/actions/README.md:3` 仍写 `vetta action`（属文档面，TASK-0047/0048 线）。
