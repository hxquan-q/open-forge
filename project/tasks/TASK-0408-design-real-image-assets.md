---
id: TASK-0408
type: task
status: verifying
priority: P2
owner: coordinator
requirement: REQ-0008
plan: PLAN-0025
source: user-request; openvetta/open-vetta@fba109edb
related_requirement: [REQ-0008]
related_plan: [PLAN-0025, PLAN-0014, PLAN-0018]
related_tasks: [TASK-0407, TASK-0409]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0408-design-real-image-assets
worktree: ../open-forge-wt/task-0408-design-real-image-assets
base_commit: 6ebd359b567da1ac46e37327c5178bc9c53fca50
read_paths: [packages/plugins/presets/vetta-ui-design, packages/plugins/AGENTS.md]
write_paths: [packages/plugins/presets/vetta-ui-design/src/assets, packages/plugins/presets/vetta-ui-design/src/tools.ts, packages/plugins/presets/vetta-ui-design/src/vetd/tool-gate.ts, packages/plugins/presets/vetta-ui-design/src/export, packages/plugins/presets/vetta-ui-design/src/history, packages/plugins/presets/vetta-ui-design/plugin.json, packages/plugins/presets/vetta-ui-design/locales, packages/plugins/presets/vetta-ui-design/agent, packages/plugins/presets/vetta-ui-design/test]
exclusive_paths: []
depends_on: [TASK-0407]
conflicts_with: [TASK-0407, TASK-0409]
integration_status: pending
created: 2026-10-28
updated: 2026-10-29
---
<!-- Copyright The Open Forge contributors. -->

# 设计画布真实图片搜索、导入与来源追溯

## 目标

设计稿能使用与内容匹配的真实图片，从检索、预览、落盘到重开/导出保留素材及来源。上游参照与全批边界见 [PLAN-0025](../plans/PLAN-0025-upstream-mcp-design-adaptation.md)。

## 范围

### 并发评估

- 结论：2026-10-28 用户明确要求隔离工作树实施 0408/0409；元数据 `parallel` 表示可隔离于主工作区，本轮实现仍按 0408 → 0409 串行，不派并行写入者。
- 前置依赖：0407 当前为 ready、未集成。源码确认资产逻辑不依赖其画布修复，可先交付隔离候选；最终 main 集成仍等待 0407，不冒充依赖完成。
- 冲突文件/独占路径：工具注册、manifest、agent 指引、导出/历史与测试；不与 0407/0409 共享目录写入。
- Branch：`task/TASK-0408-design-real-image-assets`；Worktree：`../open-forge-wt/task-0408-design-real-image-assets`；Coordinator 单人串行实现，完成后原生只读独立审查。
- 集成顺序仍为 0406 → 0407 → 0408 → 0409；主工作区存在其他任务修改，本轮不强行集成或推送。

### 做

- 适配 `vetd_assets` 的搜索、获取与 credits 流程，输入查询或已校验的来源引用，输出候选预览、设计内本地资源与署名记录；提供缩略图/联系表以供挑选。
- 以无需付费密钥的照片库、Openverse、Wikimedia、NASA 为候选来源逐个核查 API、域名和许可条件；首批只接入能明确限定网络权限与记录来源的适配器，未支持的来源/域名明确报错。
- 外部 JSON 从 `unknown` 校验；来源 API/CDN 域逐项声明，不引入全网通配。下载经宿主网络接口处理，校验协议、重定向、私网/本地地址、响应与文件类型、体积和图片尺寸；超时/来源局部失败可解释、可恢复。
- 图片落入设计的资源目录，避免仅引用临时远程链接；缩放/压缩保持合理画质，并防止失败留下损坏文件或覆盖已有资源。
- 记录 `CREDITS.json` 或兼容的来源清单，含标题、作者、原始页面/资源地址、许可及核验状态；许可未知明确标记，不自动当成发布可用。历史恢复与导出保留文件、路径和署名。
- 使用离线来源与图片样本完成端到端 fixture；实际来源可用性及最终许可核验单独记录，不能用 Mock 代替。

### 不做

不接付费图片 API，不抓取任意站点或用户会话，不扩大到私网/全网请求，不把图片来源说明视为安全指令，不变更 Plugin SDK 公共能力；若必需变更先升级范围与兼容评估。

## Given / When / Then

- 需要真实图片的设计需求 → 搜索、预览、选取并导入 → 可见图片与内容相关，文件保存在设计内，来源信息与该文件关联。
- 设计已使用图片 → 保存、重开、恢复历史并导出 → 图片仍可显示，引用无断链，来源与许可记录一并保留。
- 来源超时/返回异常 JSON/下载伪装文件 → 执行对应步骤 → 有结构化错误或部分失败说明，无崩溃、越权请求、损坏资源及虚假成功。
- 图片缺失许可或要求署名 → 导入与导出检查 → 明确提示核验/署名条件，不宣称已获商用许可。
- 输入受限域、私网地址或跳转到受限目标 → 请求 → 在边界拒绝，不能依靠 URL 后缀或来源名称放行。

## 必须保持

最小网络权限、既有工具前缀及结果/错误/取消语义、路径限制、图片类型校验、AST/来源标记保护和用户已有资产不受损。导出与历史兼容旧设计；新增元数据可缺省读取。

## 本轮实施合同（2026-10-28）

- 归属：Open-Forge-only 适配；保留 vetd 前缀和旧分享包/历史兼容，不变更 Plugin SDK。
- 输入：受约束来源的查询或来源 ID；输出：带出处/许可状态的候选、本地预览、设计内图片及 CREDITS.json。外部返回全部视为不可信数据。
- 方案：直接复用宿主 network.request、设计级写队列/原子写及通用 assets 打包/历史路径；将来源解析、下载校验、credits 与工具装配隔离为局部模块，不向 tools.ts 累加业务逻辑。
- 来源：先核查无需密钥的 Wikimedia、Openverse、NASA 和照片库第一方文档；只有域/许可/宿主边界都可限定的适配器启用，其余显式 unsupported。
- 失败/取消/恢复：限时宿主请求，拒绝受限地址/伪文件/异常 JSON；下载完成并校验后才排队提交；失败不覆盖已有文件，credits 失败回滚本次新资源，可重新搜索/导入。
- 已有事实：图谱 2026-10-12 / 254796d 落后于当前 6ebd359；已回读工具、fs、manifest、导出、来源检查与渲染合同。主工作区已有其他 concern 修改，保留不动。
- 最低验证：正常注册工具搜索→预览→导入→保存/重开→历史→导出/离线资源；安全/部分失败 fixture；定向、impact、changed、插件 build、完整 check。真实来源可用性和许可核验单列，UI/真实模型未授权不运行。

## 测试与验证

- 新增 `test/assets-sources.test.ts`、`test/assets-tool.test.ts`，通过 `bun scripts/quality/run-vitest.mjs --run <新增测试路径>` 运行，覆盖来源校验、请求边界、失败清理与完整搜索/导入流程。
- 复用 `test/snapshot-assets.test.ts` 及相关导出/历史测试，覆盖“导入→保存→重开→恢复→导出”的资源与 credits 连续流程；网络全部使用 fixture。
- `bun run test:impact -- packages/plugins/presets/vetta-ui-design/src/assets packages/plugins/presets/vetta-ui-design/src/tools.ts`；涉及工具/manifest/持久化合同按政策运行 `test:changed`。
- 插件目录 `bun run build` 与根目录 `bun run check`；技术评审核对实际权限差异、来源条款和依赖许可，不绕过构建或 SDK 边界。

## 验收分层

- 工程验证：待执行；本轮未实现、未访问真实来源。
- 技术评审：未执行；必须审阅权限、输入边界与素材署名链。
- 集成：pending；无功能实现提交。
- 人工功能验收：待验收；图片选择质量与许可核验状态须显式呈现。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：未来候选版本，隔离设计和具备已声明权限的素材工具；来源状态与许可限制可查。
- 输入：“为旅行落地页寻找真实风景图，给出预览与来源，选中一张后加入首屏。”再重开、恢复并导出设计。
- 预期：得到真实本地图片、可工作的引用和 credits；离线导出可呈现，许可未知有明确提示。
- 不通过：占位图冒充真实素材、只存远程链接、署名丢失、导出缺图或越权请求。反馈写回本 Task，并加入对应 fixture。

## 交付记录（2026-10-29 隔离候选）

- 实际修改：新增 `src/assets/{sources,images,credits,tool}.ts`（`vetd_assets`：search / preview / import / credits）与 `test/assets-*.test.ts`、真实 Wikimedia JPEG fixture；注册工具与 `DESIGN_ONLY_TOOLS`，manifest 仅新增 5 个精确 host（无通配），导出改为在写队列内构建并在包含 CREDITS 时给出许可提醒；补 SKILL 与 `references/real-images.md`。
- 来源启用：Wikimedia Commons 与 NASA images-api；Openverse/Unsplash/任意站点显式 unsupported，不静默替换 URL。导入按 source/id 重新解析，不采信模型给出的 URL 或署名。
- 已运行：定向 `assets-{tool,sources,lifecycle}` 39 例；整包 `bun run test` 793 例、`test:changed`（presets/vetta-ui-design）793 例；插件 `tsc --noEmit`、`bun run build`（`release/vetta-ui-design-0.7.2.vettapkg`，45 个运行时文件）与根 `bun run check` 全通过。
- 独立只读审查（新上下文）指出的两项 P2 已处置：CREDITS 读写同用一个 4,000,000 字符上限并在写图片前拒绝超限（回归用例）；预览批次遇宿主取消立即中止、导入取消不落盘（回归用例）；另补 2048px 缩放/WebP 编码失败关闭解码、真实 Vite 构建下的资源改名与 snapshot 内联断言。
- 未运行：真实来源联网访问（付费/生产边界，未获授权）、Desktop 人工验收、`verify:ui:*`。测试用离线 fixture 与 stub 网络，真实性以下述限制为准。
- 剩余风险（保留限制，不当作已通过）：
  - 宿主 `PluginNetworkApi` 不暴露 redirect 目标、最终 URL、DNS 与 `AbortSignal`；跨域跳转/私网解析只能在 URL 前缀与宿主网关层约束，排队等待写队列或已进入预览循环后的用户取消无法观测。已在 `references/real-images.md` 明示，需宿主侧能力才能消除。
  - 图片解码依赖 `createImageBitmap`/`OffscreenCanvas`；不可用时按失败处理、不落盘，但该分支仅在测试 stub 下覆盖。
  - 许可状态为 `source-reported` / `unknown`，不构成法律许可结论；含 CREDITS 的导出只给警告。
- 集成：未被要求集成，也未推送；`integration_status: pending`，最终顺序 0406 → 0407 → 0408 → 0409，0407 未完成前不合并入库。
- 发布说明：`apps/desktop/package.json` 当前为 0.1.3，但 v0.1.3 已有发布 tag，正文不得再改（`release-notes.mjs --check` 拒绝），碎片也因此不归入该版本。候选文案暂记于本 Task，首发 Open Forge 版本确定（ISSUE-0007）后归入自己的 Release Notes：

  > 设计画布新增真实图片素材工具（`vetd_assets`）：按关键词从 Wikimedia Commons 或 NASA 图片库检索候选、生成联系表挑选，选中后下载到设计资源目录并写入 `CREDITS.json`（标题、作者、原始页面、许可、SHA-256）；重开、历史恢复与离线导出保留图片与署名。仅启用这两个免密钥来源，Openverse/Unsplash/任意站点明确报不支持；许可仅按来源上报，导入与导出提示自行核验署名与商用条件。
