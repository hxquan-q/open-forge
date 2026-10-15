---
id: TASK-0186
type: task
status: done
priority: P2
owner: packages/plugins/presets/office-viewer
requirement: ISSUE-0020
plan: none
source: user-request; ISSUE-0020
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0020]
related_bugs: []
execution: parallel
branch: task/TASK-0186-office-preview-on-demand
worktree: unassigned（已集成，待推送后清理）
base_commit: d065a6e10521c8df098097d14dae8fc2e92f9c34
read_paths: [apps/desktop/src/renderer/domains/plugins, packages/plugins, scripts/quality]
write_paths: [packages/plugins/presets/office-viewer, project/tasks/TASK-0186-office-preview-on-demand.md, project/tasks/README.md, project/issues/ISSUE-0020-desktop-memory-usage-baseline.md, project/issues/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/plugins/presets/office-viewer]
depends_on: []
conflicts_with: [TASK-0122, TASK-0123, TASK-0181]
integration_status: integrated
created: 2026-10-03
updated: 2026-10-07
---
<!-- Copyright The Open Forge contributors. -->

# Office 预览按格式加载与 Renderer 资源释放

## 目标与事实

续接 ISSUE-0020 的 Renderer 调查。当前 Office 插件注册预览入口时静态导入 PDF/Word/PPT/Excel 四套解析器，PDF 模块还在顶层创建未释放的 worker Blob URL。只聊天也会触发解析器模块加载；“工具渐进式发现”不等于 Renderer 代码按需加载。

## 范围

- 做：保留同步格式注册，以现有 OfficePreview Interface 为 Seam 延迟加载实际使用的格式；显示现有加载/错误状态，保持文件更新、格式切换及卸载语义；管理 PDF worker URL 的有效生命周期；增加模块加载与实际预览入口流程回归。
- 不做：重写插件激活/manifest、全插件休眠、改变开发服务器默认策略、改工具发现和 AI 协议、虚拟化整个 PDF、强制 GC 或压低堆上限。不以构建字节数推算或承诺 Renderer RAM 节省。
- 输入/输出：插件文件预览 props → 对应格式的预览 UI；外部重型解析器和文件能力保持原合同。
- 归属：Upstreamable，保留插件 SDK、权限、持久化和文件格式兼容。

### 并发评估

条件支持与主树 TASK-0185 并行；本 Agent 串行完成全部实现，不派子 Agent。Office 插件独占，使用 task/TASK-0186-office-preview-on-demand 独立 Worktree；主树的已有修改不复制/回退。共享 Project 索引、ISSUE-0020 与 Release Notes 由本 Agent 在协调阶段更新，集成前检查主树干净及他人修改归属。

## Given / When / Then

1. Given 插件启动但未预览文档，When 激活并注册所有格式，Then 入口可发现且四种重型解析器均未求值、没有 PDF worker Blob。
2. Given 已注册预览入口，When 打开一种格式并等待代码到达，Then 先显示加载状态，仅加载该格式；随后换格式、文件更新、关闭预览均保留正确输出和释放 watcher。
3. Given 不支持的文件或解析器加载失败，When 预览，Then 显示错误，不误加载其他格式；重新打开/重试应允许恢复。
4. Given 两个并存 PDF 预览或加载未完成即关闭，When 任一/最后一个加载任务销毁，Then 不提前撤销共享 worker URL，最后释放时撤销且重复清理幂等。

## 必须保持

插件格式与 UI 入口不减少；无新权限/依赖/协议；错误用户可见；文件变化刷新仍工作；不在渲染期启动解析器或创建 worker；不读取真实用户文档、状态或 Provider。

## 测试与验证

- RED：通过插件真实激活和预览入口验证未使用格式不求值，旧静态导入实现应失败；记录实际输出而非仅源码正则。
- GREEN：Node runner 的 React/jsdom 流程与生命周期测试；只替代文件能力、第三方解析器和浏览器 worker 外部边界。
- 构建：只构建 office-viewer，必要时先构建其本地 plugin-vite 依赖；比较同配置入口同步依赖与分块，验证重型库留在异步块。
- 定向：`bun scripts/quality/run-vitest.mjs run packages/plugins/presets/office-viewer/src`。
- 影响：`bun run test:impact -- <本 Task 源码文件>`；多包/影响不明确时 `test:changed`。
- 完整：完成后 `bun run check`，不替代行为测试。
- 不运行：未授权 `verify:ui:*`、真实 Electron 操作/堆快照、付费 Provider。OS 只读计数不等于受控 RAM 前后对照。

## 验收与交付记录

- 工程验证：通过；4 条回归、包内 TypeScript、test:impact、test:changed、定向构建与完整 bun run check 已通过。
- 技术评审：计划自审，无独立评审授权。
- 集成：pending；主树未清洁时保留 Task 分支，不强行合入。
- 人工验收：待验收；正常重启加载新构建后，聊天不加载 Office 解析器；首次打开 PDF/Word/PPT/Excel 出现加载后正常预览，文件修改刷新有效，多预览关闭无异常。（2026-10-07 已按用户「全程自动」授权在隔离实例完成，见文末「人工验收实测」；用户如不认可可回退 `verifying`。）
- 发布：未授权发布；集成时更新当前 0.1.3 Release Notes，不推未经验证的其他提交。
- 剩余风险：仅解决一个已确认的启动加载与资源持有路径，不代表已定位 1.4 GiB Renderer 全部占用或消除全部泄漏；ES 模块首次加载后不能保证卸载。

### 已执行基线与首轮实现

- 初始启动测试旧实现明确失败：实际求值 docx/pdf/pptx/spreadsheet 四套依赖，预期为空。修复后插件注册/按需 DOCX/切换 XLSX/文件更新/失败恢复流程通过。
- PDF 生命周期旧实现明确失败：仅 import PdfPreview 即创建 1 个 Blob URL，预期 0。修复后双预览共享、异步销毁成功/失败及重开场景通过。
- 旧版同配置构建：office-viewer build --manifest 成功；入口 chunk 约 3,421.31 kB，MF expose 同步 JS 总计 3488824 bytes。MF export analysis idle-timeout 使用完整共享导出回退，以及大 chunk 警告为旧版基线；后续不降低阈值。

- 并发合同补充：守卫把历史 TASK-0123 的 `packages/runtime-*/src` 保守视为整个 packages 前缀，与本 Task 的 office-viewer scope 报重叠；明确登记 conflicts_with，相关分支只串行集成，不改其代码或守卫。

### 验证与自审（进行中）

- 独立 Worktree 已创建并执行 `bun install --frozen-lockfile`（锁文件无改动），构建依赖走仓库 Turbo 缓存，无真实状态复制。
- 包内 test / check 与显式 test:impact 通过；新增 4 条流程/生命周期测试覆盖未使用格式不加载、延迟到达/取消、DOCX 刷新、XLSX、PPTX 错误、模块加载失败隔离、PDF 双持有/异步销毁失败/重开及重复 dispose。
- MF expose 同步 JS：旧版 3,488,824 bytes → 新版 72,338 bytes（-97.93%），四个格式预览均在 async 数组且不在 sync 中。该指标不是 RAM。最终构建复核为 72338 bytes，4 个解析器 async/sync 分组断言通过；构建无新警告，保留旧版 MF 分析超时回退和 PDF/PPT 大异步块警告。
- 首轮完整 check：所有类型检查和 lint 通过；guards 因本次新增/修改代码缺声明头及 TASK-0123 通配 scope 冲突失败。已添加声明头并登记串行集成冲突；最终完整 check 退出 0，所有规定 gate 通过。
- 根 Biome includes 不覆盖嵌套 preset；最初显式 Biome 命令无文件被处理。额外使用根配置的相同规则、仅扩展 includes 的临时配置检查本次 11 个 TS/TSX/JSON 文件；修复发现后通过，没有修改仓库规则或降低阈值。
- 自审：不改 SDK/manifest/权限；错误使用双语现有 ErrorState，加独立加载错误提示；共享 worker URL 在实际 PDF task 销毁 settle 后释放，失败同样释放，不改变 PDF 内容解析/缩放协议。首次 import 后 JS 模块仍可被浏览器缓存。
- 集成等待：主 main 有 TASK-0185 的未提交聊天修改，不能满足干净集成条件；不夹带或覆盖其修改。本次共享文档在 Task 分支内提交，回主树时仅更新本 Task/Issue 行，最终合并仍需协调。

- 共享发布说明另与 TASK-0122 / TASK-0181 交叠，已登记冲突；只串行协调合并 release note 条目。

### 最终交付证据（2026-10-03）

- `bun run --cwd packages/plugins/presets/office-viewer test`：4/4 通过；全部新场景由真实 OfficePreview / PdfPreview 及 SDK 注册入口驱动，Mock 仅位于宿主能力、第三方解析器和浏览器能力。
- `bun run --cwd packages/plugins/presets/office-viewer check`：通过。
- `bun run test:impact -- packages/plugins/presets/office-viewer/src/OfficePreview.tsx packages/plugins/presets/office-viewer/src/components/PdfPreview.tsx packages/plugins/presets/office-viewer/src/components/pdf-worker-source.ts`：4/4 通过。
- `bun run test:changed -- packages/plugins/presets/office-viewer/package.json packages/plugins/presets/office-viewer/src/OfficePreview.tsx packages/plugins/presets/office-viewer/src/components/PdfPreview.tsx`：选中 office-viewer，4/4 通过。
- `bun run --cwd packages/plugins/presets/office-viewer build -- --manifest`：通过；MF expose sync JS 72,338 bytes（旧版 3,488,824，降低 97.93%）；PDF/DOCX/PPTX/Spreadsheet 四个解析器均在 async、不在 sync。构建仍有旧版已出现的 MF export analysis idle-timeout 完整导出回退及大异步 chunk 警告，未降低阈值。
- 临时扩域 Biome：复制仓库规则，仅将 includes 扩到明确指定的 11 个修改文件，check 通过；没有更改仓库规则。配置保存在 OS 临时目录，不进入产品或提交。
- `bun run check`：最终退出 0；lint / root、CLI、Desktop、docs、mobile 类型检查 / mobile lint / guards 全部通过。声明头守卫内部探测缺失的 `upstream/dev` 打印提示后仍按已记录固定 baseline 校验通过；本次没有调整 ref 或 waiver。
- `git diff --check`：通过。README、双语加载错误提示及当前 `v0.1.3` Release Notes 已更新。
- 工程完成、技术自审完成；人工预览体验和真实 Renderer RAM 前后对照未执行。没有启动/操作用户实例、读取真实会话/文档、调用 Provider、运行 verify:ui 或发布。
- 集成（2026-10-03）：主树待提交记录入库后以 `git merge --no-ff` 合入本地 main（冲突仅共享索引/发布说明/Issue 记录，按并集解决，产品代码无冲突）；集成后定向复验见下。原"主树不干净"前置由协调会话解决，TASK-0185 修改已由其 Owner 提交。

- 集成复验（2026-10-03，合并结果）：包内 test 与 test:impact 定向结果见提交记录；完整门禁随本轮集成批次统一执行。branch/worktree 保留至 origin/dev 推送成功后清理。

### 人工验收实测（2026-10-07，VERIFY-0017 组一）

方法：隔离实例内 `page.reload()` 冷启动 → `performance.clearResourceTimings()` 清空资源计时缓冲 → 在项目会话里打开活动面板「文件」页 → 观察解析器模块是否被请求；再点开真实文档预览。判据用 `performance.getEntriesByType('resource')` 的**模块 URL**（dev 下可分辨到源文件级），不用构建体积推算。

- **不预览就不加载**：冷启动 + 开会话 + 打开文件面板（`E:\demo` 项目，面板已列出 `质量日报_生产一部_一车间_260901.xlsx`）后清空计时缓冲，随后观察到的 Office 解析器请求为 **0 条**（`office|excel|xlsx|pdf|docx|pptx|sheet` 正则命中 0）。只聊天路径不触发任何解析器模块。
- **按格式加载（xlsx）**：点开该 xlsx 预览后新增 11 条资源，全部落在表格路径：`components/spreadsheet/{SpreadsheetPreview,parseWorkbook,SheetTabs,VirtualSheet,constants,cellKeys,SheetHeaders,sheetGeometry,VisibleCells}.tsx` 与 `.vite/deps/xlsx.js`；**无** pdf/docx/pptx 模块。预览真实渲染（可见工作表名「报表要求」「抽检返工明细表」等）。
- **按格式加载（pdf）**：切换到自建夹具 `preview-sample.pdf`（1 页最小 PDF）后新增模块为 `components/PdfPreview.tsx`、`deps/pdfjs-dist.js`、`components/pdf-worker-source.ts`、`build/pdf.worker.min.mjs?raw`——只有 PDF 一路；预览渲染出 1 个 canvas，且无 spreadsheet/docx/pptx 模块。
- **PDF worker Blob URL 生命周期**：在点击预览前替身 `URL.createObjectURL`/`revokeObjectURL` 记账。打开 PDF 预览时恰好 `createObjectURL` **1 次**（Blob `type=text/javascript`、`size=1375838`，即 `pdf.worker.min.mjs` 源文本）；把预览切到另一个文件（`renamed #2.txt`）后 canvas 数由 1 → 0，且 `revokeObjectURL` 以**逐字符相同**的 URL 被调用一次。即 worker URL 随预览挂载创建、随卸载释放，无遗留（对应本任务记录的「共享 worker URL 在实际 PDF task 销毁 settle 后释放」）。
- 未执行：真实 Renderer RAM 前后对照（本任务「不做」已声明不以构建字节数推算或承诺 RAM 节省，故不作为本条的通过条件）；PPTX/DOCX 两种格式的实机预览（夹具目录无该格式文档，路径与 xlsx/pdf 同构、未额外构造）。

按用户「全程自动」验收授权记为 `done`；用户如不认可按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 回退为 `verifying`。
