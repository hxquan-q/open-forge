---
id: TASK-0048
type: task
status: in_progress
priority: P0
owner: apps/docs-site
requirement: REQ-0003
plan: PLAN-0003
source_issue: ISSUE-0001
execution: serial
branch: forge/dev
worktree: unassigned（等待 D 阶段和社区目标确认）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [apps/docs-site/README.md, apps/docs-site/lib, apps/docs-site/content/docs, project/requirements/PRODUCT.md, project/issues/ISSUE-0001-rebrand-infrastructure-decisions.md]
write_paths: [apps/docs-site/lib/site.ts, apps/docs-site/content/docs, apps/docs-site/public, apps/docs-site/test, .github/release-notes]
exclusive_paths: [apps/docs-site/lib/site.ts, apps/docs-site/content/docs, apps/docs-site/public, .github/release-notes]
depends_on: [TASK-0044, TASK-0045, TASK-0049]
conflicts_with: [TASK-0047]
integration_status: pending
created: 2026-09-23
updated: 2026-10-06
---
<!-- Copyright The Open Forge contributors. -->

# 公开文档站品牌、正文与发现入口迁移

## 目标

让公开文档站的站点元数据、中文/英文内容和 SEO/LLM 发现入口准确反映 Open Forge，并保持文档路由和语言合同有效。

## 范围

### 并发评估

- 结论：不支持与 TASK-0047 并发；文档身份、链接和 Release Notes 需要统一集成。
- 执行方式：serial，共享工作区串行。
- 可并行 Task：无。
- 前置依赖：Desktop 与生态品牌映射完成；`TASK-0049` 的社区目标确认完成。
- 冲突文件/独占路径：`apps/docs-site/lib/site.ts`、中英文 `content/docs`、站点发现元数据和 Release Notes。
- Branch：`forge/dev`；Worktree：实施前按当前协作状态确认。
- 集成负责人：coordinator。
- 集成顺序：TASK-0044 / TASK-0045 → TASK-0049 → 本任务；与 TASK-0047 串行集成。

### 做

- 更新站点名称、页面标题、canonical/SEO/OG 元数据与已冻结的公开目标链接。
- 清查公开文档正文中的产品名、安装命令、数据路径和旧仓库坐标；中文页及 `content/docs/en/` 镜像保持页面集合和链接合同一致。
- 更新文档发现入口并确认 sitemap、`llms.txt`、`llms-full.txt` 和搜索索引仍由公开内容正确生成。

### 不做

- 不创建或部署新域名，不修改 Vercel 项目，不向外部服务发布内容。
- 不把内部 `project/`、ADR 或私有服务端资料复制到公开站点。
- 不改未确认的社区目标或冻结的技术兼容标识。

## Given / When / Then

- Given：用户从 Open Forge 的公开文档站选择中文或英文内容；When：浏览指南、搜索文档或使用 LLM 索引；Then：品牌、页面元数据、语言镜像和链接一致，所有被收录页面均可构建并访问。

## 必须保持

- 中文默认目录与 `content/docs/en/` 页面集合保持同步。
- canonical、sitemap 和无语言前缀路由遵守 docs-site 既有合同。
- 公开文档不包含内部验证记录、凭据或无法确认的产品承诺。

## 测试与验证

- 定向检查：双语页面集合、站内链接、canonical/sitemap/LLM 索引输出。
- 用户流程：从语言切换器进入一个公开指南，使用搜索/Markdown 索引并检查页面元数据。
- 质量检查：在 `apps/docs-site` 运行 `bun run check` 与 `bun run build`；核对 README 规定的构建后搜索索引。

## 阻塞

- 阻塞已解除（2026-10-06，TASK-0217 复核）：`TASK-0045` 与 `TASK-0049` 的 frontmatter 均为 done，原阻塞条件（等 0045 收口、随 0049 关闭）已满足。但**本任务尚未实施**——交付记录的四条（实际修改、实际运行、未运行及原因、剩余风险）全为空。状态转 ready，等待实施。原有约束保持不变：冻结技术标识（`.vettapkg`、`@vetta/*`、`VETTA_*`）不改；社区继续使用已冻结的现有入口。

## 交付记录（第一片，2026-10-06）

- 实际修改：`apps/docs-site/lib/site.ts` 的站点元数据——`site.name`、`site.title`、两语言的 title 与 description、以及兜底分区标签前缀（`VETTA /` 改为 `OPEN FORGE /`）里的产品称呼由 Vetta 改为 Open Forge。
- 刻意未改（待用户定）：`logoPath` 仍指 `/images/vetta-app-icon.webp`——改名需要新增或重命名公开图标资产，属坐标与资产决策；`marketingUrl`/`githubUrl` 已指向 fork，`discordUrl` 与 `docs.openvetta.com` 属 TASK-0049 冻结的现有入口，保持不动。
- 验证：grep 复核该文件后只剩 `logoPath` 一处旧品牌字样。
- 未运行及原因：未跑 docs-site 构建（本轮为文案改动，构建按本任务合同在收口时跑）；未部署。
- 剩余风险：本任务覆盖站点元数据、双语内容与 SEO/LLM 发现入口，本条只做了站点元数据；84 个内容文件与 canonical/sitemap/LLM 索引待后续切片。

## 交付记录（第二片：内容与组件，2026-10-06）

- 实际修改：中文内容树 70 个文件里 65 个、合计 249 处把独立出现的产品称呼 Vetta 改为 Open Forge（含正文、frontmatter 的 title 与 description、图片 alt、`<Entry>` 标题与表格文字）；中英两版安装文档里的 `./Vetta-${VERSION}.AppImage` 改为 `./Open Forge-${VERSION}.AppImage`；`components/brand-mark.tsx` 与 `components/reading.tsx` 的用户可见品牌字样同步改名。
- 保护规则（不是普通替换）：先把上游署名 `Open Vetta` 换成哨兵，再用带前后视的正则只替换独立出现的 Vetta；`@vetta/*`、`VETTA_*`、`.vetta`、`~/.vetta`、`openvetta`、`vetta-plugin-cli`、`install:vetta`、`vetta-app-icon`、`vetta-coral` 等一律不动。
- AppImage 文件名依据：`apps/desktop/scripts/desktop-upgrade-e2e.mjs:93` 与 `packaged-e2e-binary.mjs:33` 及其合同测试都断言产物名为 `Open Forge-<版本>.AppImage`，文档原写的 Vetta 名属陈旧。
- 验证：改名后 `bun run --cwd apps/docs-site build` 通过（编译成功、113 个静态页）；内容树复核已无非冻结、非署名的旧品牌行。
- 刻意未改（待用户定）：`logoPath` 仍指 `/images/vetta-app-icon.webp`，需要一个公开图标资产才算真改；`app/layout.tsx` 与组件里的 `vetta-coral`/`vetta-ink`/`vetta-binding` 是样式 token 名，不进用户可见文案，属本任务范围之外，记录在此以免被当成遗漏。
- 未运行及原因：未部署（本仓不触发部署）；SEO、sitemap、canonical 与 LLM 索引输出未逐项核对。
- 剩余风险：样式 token 名与图标资产路径仍是旧名，要统一需一次专门的资产与 token 改名切片。

## 交付记录（第三片：CLI 示例，2026-10-06）

- 实际修改：`developers/cli-and-settings.mdx` 中英两版共 18 处命令示例由 `vetta` 改为 `openforge`（4 处调用形式 + 10 处资源包命令）。
- 核实依据（这一步不做无法核实的改名）：调用形式与选项取自 `apps/cli-host/src/run-cli.ts` 的 usage 与 `agent-help.ts`（`--model`、`--mode`、`--continue` 都真实存在）；资源包命令取自 `apps/cli-host/src/package-command.ts`（`install` | `remove` | `update` | `list`）与 `agent-cli-intent.ts` 的 PACKAGE_COMMANDS。
- 排除的一类误判：`@vetta-org/plugin-cli` 的子命令是 `add / reload / docs / init / watch / uninstall / sync`，与资源包命令不是同一套；没有把文档里的资源包命令改成插件 CLI 的命令。
- 验证：改名后 `bun run --cwd apps/docs-site build` 通过（编译成功、113 个静态页）；内容树复核已无「以小写 vetta 当命令用」的行。
- 未运行及原因：未真机执行这些 CLI 命令（需要本机安装与真实 Provider 配置，不在本任务范围）。
- 剩余风险：文档给出的命令名与选项已核实为真实存在，但命令的完整行为与边界未逐条实跑。

## 记录（2026-10-06）：一次过度改名与它的更正

- 本轮一度把 `docs/plugin/`、`docs/glossary/`、`docs/user-facing-copy.md` 也按同一套受保护替换改名（13 文件 / 43 处），随后**整体撤回**。原因写清以免再犯：
  1. `docs/glossary/` 里的 `### .vetd（Vetta Design 文件）`、`### Vetta Go / Token Plan` 是**术语名**，被双链与根 `CONTEXT.md` 索引一一对应引用，改名当场打破术语索引（`check-glossary` 报红）；而 `Vetta Go`、`Vetta Zen` 是**商业订阅品牌**，不属本仓产品称呼，改成 Open Forge 等于替上游另起品牌名。
  2. `Vetta UI Design` 是**插件名**，不是产品称呼。
- 结论：`docs/` 树不能按模式替换——里面混着产品称呼、插件名、商业品牌名与上游沿革记录（ADR、greenfield 实施日志、适配研究）。要做需要先有一份术语与品牌对照表，范围交用户决定。
- 另：docs-site 内容改名使 65 个文件从「与上游逐字相同」变成 fork 修改文件，按仓库规则必须带声明头；已为 72 个文件补上，并把声明头基线快照收缩到 652 条。这是我的疏漏——第一次提交 docs-site 内容时只跑了索引守卫，没跑声明头 ratchet。
