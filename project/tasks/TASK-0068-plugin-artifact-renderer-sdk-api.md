---
id: TASK-0068
type: task
status: done
priority: P1
owner: packages/plugins/plugin-sdk
requirement: REQ-0001
plan: PLAN-0001
source: TASK-0027 public-contract prerequisite
execution: serial
branch: forge/dev
worktree: unassigned（共享工作区串行，不创建 Worktree）
base_commit: forge/dev
read_paths: [packages/plugins/AGENTS.md, packages/plugins/plugin-sdk, docs/plugin, apps/docs-site/content/docs/plugins, apps/docs-site/content/docs/en/plugins, apps/desktop/src/main/plugins/plugin-api-version.ts]
write_paths: [packages/plugins/plugin-sdk/src, packages/plugins/plugin-sdk/test, packages/plugins/plugin-sdk/package.json, packages/plugins/plugin-sdk/CHANGELOG.md, docs/plugin, apps/docs-site/content/docs/plugins, apps/docs-site/content/docs/en/plugins, apps/desktop/src/main/plugins/plugin-api-version.ts, project/tasks]
exclusive_paths: [packages/plugins/plugin-sdk/src/ui.ts, packages/plugins/plugin-sdk/src/permissions.ts, apps/desktop/src/main/plugins/plugin-api-version.ts]
depends_on: []
conflicts_with: [TASK-0027]
integration_status: integrated
created: 2026-09-23
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# Plugin Artifact Renderer SDK 合同

## 目标

为 Task Artifact Renderer 定义一个显式 Plugin SDK contribution API。每个贡献以 TypeBox schema 校验宿主投影出的安全 descriptor，并通过宿主绑定的只读 source 句柄读取对应 Artifact；Renderer 不接触原始 URI 或任意文件路径。

## 范围

### 并发评估

- 结论：不支持与 TASK-0027 并发；Desktop 集成依赖此公开合同并共享 contribution 类型。
- 执行方式：共享 `forge/dev` 工作区串行。
- 可并行 Task：无（与 TASK-0027 的强依赖链）。
- 前置依赖：无；此 Task 是 TASK-0027 的前置。
- 冲突文件/独占路径：Plugin SDK `ui.ts`、permissions catalog、Desktop `PLUGIN_API_VERSION`、插件公开手册。
- Branch：`forge/dev`。
- Worktree：共享工作区串行，不创建 Worktree。
- 集成负责人：主会话。
- 集成顺序：TASK-0068 SDK 合同 → TASK-0027 Desktop/Renderer 接线。

### 做

- 新增 `PluginArtifactRendererContribution<TSchema>`，包含全局唯一 `type`、TypeBox `schema` 和 `component`；组件输入类型由 schema 推导。
- 新增只读 `PluginArtifactRendererDescriptor` 投影和 `PluginArtifactSource`：descriptor 不含 `uri`/路径；source 提供宿主绑定到单个 Artifact 的文本/字节读取，不接受调用方路径参数。
- 在 `PluginUiApi` 新增 `registerArtifactRenderer()`；使用新权限 `ui.slot.artifact-renderer`。缺权限按可选 UI contribution 的 fail-closed warn+noop 处理；注册返回 `Disposable`，重复 type 不得覆盖先注册 Renderer。
- Renderer type 解析由宿主定义：descriptor 显式 `rendererType` 优先；缺省时用标准 Artifact `kind`，未知显式值不隐式改用其他 Renderer。
- 为新增公开能力推进 SDK patch 版本 `0.3.10` 与 Plugin API `2.8.0`；更新 SDK `CHANGELOG.md`、`docs/plugin/` 唯一真源及 docs-site zh/en 能力/权限说明，并构建生成的 SDK `dist`，不手工编辑生成文件。
- 不运行 `npm publish`；Desktop 首发版本尚未按 ISSUE-0007 切换时，不写继承的 Vetta Release Notes，候选说明留在关联 Task 交付记录。

### 不做

- 不增加 `ArtifactDescriptor` 持久化字段、不改 Runtime/JSONL schema。
- 不暴露 `uri`、本地路径、Storage blob id 或通用任意路径 read API 给 Renderer。
- 不改变现有 `registerFilePreview`、`registerCardRenderer` 的 props/语义或既有插件权限。
- 不发布 npm 包或更改 `plugin-vite` peer 范围。

## Given / When / Then

- Given：插件声明并获授 `ui.slot.artifact-renderer`，注册一个 type 与 schema；
- When：宿主对匹配 descriptor 进行校验并挂载组件；
- Then：组件仅收到 schema 校验后的 URI-free descriptor 与绑定该 Artifact 的只读 source；无权限、类型重复或 schema 无效时不覆盖其它 contribution，也不会读到资源。

## 必须保持

- TypeBox schema 是 Renderer 投影的验证合同，不是权限；实际内容读取始终经过 Main/Plugin capability 边界再次授权。
- API 兼容遵循 `pluginApiVersion` fail-closed：使用新权限/方法的插件要求 `^2.8.0`，旧插件与旧 UI contributions 不变。
- `Disposable`、Plugin activation teardown、permission revoke 和 capability session close 后不保留有效 Renderer/source。
- 插件共享 Renderer realm，不把权限宣称为恶意代码安全沙箱；仍按最小宿主 API 与资源投影暴露。

## 测试与验证

- 定向：SDK root exports、schema 泛型类型推断、新权限 catalog、API 类型合同；旧 `registerFilePreview`/`registerCardRenderer` 示例仍可编译。
- 插件合同：文档示例能通过 SDK 类型检查；使用缺权限 API 的插件声明 `^2.8.0`，不要求更改 `plugin.json` schema。
- 命令：`bun scripts/quality/run-vitest.mjs --run packages/plugins/plugin-sdk/test/public-api.test.ts`；`bun run --cwd packages/plugins/plugin-sdk build`；`bun run check:quick -- packages/plugins/plugin-sdk/src apps/desktop/src/main/plugins/plugin-api-version.ts`。
- 回滚：SDK API/权限/API 版本/文档在一个可独立回滚的 task 内；不发布包。

## 交付记录

- 实际修改：新增 URI-free Artifact Renderer contribution/schema/source API，注册权限和 Plugin API 版本升至 `2.8.0`，同步 SDK、中文/英文插件手册与 docs-site。
- 实际运行：`bun run --cwd packages/plugins/plugin-sdk ../../../scripts/quality/run-vitest.mjs --run test/public-api.test.ts`，3 项通过；`bun run --cwd packages/plugins/plugin-sdk build` 成功，生成的 SDK dist/docs 未手工编辑。
- 未运行及原因：`check:quick` 与完整 `bun run check` 尚未运行，待相关集成代码收口后统一执行。
- Release Notes：候选新增文案「插件可以注册经 schema 校验的 Artifact 渲染器，并通过宿主绑定的只读来源读取对应 Artifact。」留存于此；ISSUE-0007 首发版本切换前不修改继承的 Vetta v0.5.59。
- 剩余风险：TASK-0027 Desktop/Renderer 接线尚未完成；完整质量检查待运行。
