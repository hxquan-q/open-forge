---
id: TASK-0267
type: task
status: verifying
priority: P3
owner: apps/desktop
requirement: REQ-0008
plan: PLAN-0014
source: RESEARCH-0025; upstream 0.5.63 模型配置系列
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: 主工作区（串行，不拆出）
base_commit: 3cfcf8b17
read_paths: [project/research/RESEARCH-0025-upstream-0.5.60-0.5.64-sync-audit.md]
write_paths: [apps/desktop/src/main/models, apps/desktop/src/renderer/domains/settings/components, packages/theme-ui/src/settings, apps/desktop/src/shared/i18n/locales, project/tasks/TASK-0267-model-pull-param-backfill.md]
exclusive_paths: []
depends_on: [TASK-0266]
conflicts_with: []
integration_status: integrated
created: 2026-10-15
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 模型拉取参数回填与选择体验（同步上游 0.5.63）

## 目标

本仓已有「从接口拉取 + 测试连通 + 手动勾选」（2026-09-29）。补齐上游 0.5.63 的参数面：拉取列表改为右侧滑出面板（搜索、全选/全不选作用于当前筛选、逐个测试连通），勾选时把接口返回的参数（上下文窗口、最大输出、图片输入、思考档位）一并写入；网关只回 id 时按 models.dev 目录回填空字段（网关自报字段优先、目录查不到保持留空不猜测）；聚合网关命名空间前缀逐层剥离后匹配；推理档位拖拽排序。

## 范围

### 并发评估

- 结论：条件支持；apps/desktop models 路径与在途任务不相交
- 执行方式：serial
- 前置依赖：TASK-0266（本批顺序，避免 settings 面交叉）
- Branch：main；Worktree：不拆预期

### 做

- 拉取抽屉面板 + 参数写入 + models.dev 回填（含命名空间剥离）+ 档位拖拽排序 + 「清空模型」（二次确认）。
- 已添加模型标注不重复写入；手动填过的值不被目录覆盖。

### 不做

- 不做服务商/模型编辑弹窗化的整体布局重design（纯 UI，按本仓设计口径另行评估）；不引入对 models.dev 的强依赖（目录不可达时退化为现行为）。

## Given / When / Then

- Given：聚合网关只返回 `cline-pass/deepseek-v4.1-flash` 形态的 id；When：用户打开拉取面板并勾选；Then：模型写入时参数经命名空间剥离匹配 models.dev 回填空字段，网关自报字段优先，查不到的留空。
- Given：已手动填写某模型上下文窗口；When：再次拉取覆盖选择；Then：手动值不被覆盖。

## 必须保持

- 现有拉取/测试连通/勾选行为与持久化兼容；不猜测参数值。

## 测试与验证

- 定向：fetch-models/provider-request 参数回填与剥离匹配单测、设置面板组件测试。
- 质量：`bun run test:impact`、批末 `bun run check`。

## 验收分层

- 工程验证：通过——定向 124 例全绿（组件 29 + 主进程/表单 42 + preset 53）；`bun --cwd apps/desktop typecheck` 0 错误；`test:impact`（953 文件）5073 用例全过 / 0 失败（4 个收集期失败文件为 BUG-0107 存量红，栈签名与上轮单文件复现一致）；`check:lint` / `check:guards`（声明头 new=0）/ 完整 `bun run check` 全绿。
- 技术评审：自审；数据面与上游 06b834d06 逐字一致（快照仅多一行声明头），UI 面差异集中在适配本仓 provider-request/服务商级测试。
- 集成：与 frontmatter `integration_status` 一致（integrated）。
- 人工功能验收：待验收（设置 → 模型配置 → 从接口拉取，预期面板化选择 + 参数自动补齐 + 档位拖拽 + 清空模型）。
- 发布：未授权；发布说明已按 v0.1.3 补写。

## 功能验收包

- 入口：设置 → 模型配置 → 从接口拉取。
- 预期：面板化选择 + 参数自动补齐。
- 不通过：参数缺失或手动值被覆盖。

## 交付记录

- 实际修改：
  - 数据面（与上游 06b834d06 逐字平移）：新增 `parse-provider-models.ts`（/models 参数解析）与 `enrich-fetched-models.ts`（目录回填，只填接口没给的字段）；`models-dev.ts` 增目录查找投影（`lookup` + `resolveCatalogLookup` 命名空间逐层剥离 + openrouter 尾缀匹配，CATALOG_VERSION 7→8）与只读缓存出口；`fetch-models.ts` 返回 `FetchedProviderModel[]`（保留本仓 `resolveProviderModelsRequest` 共用出口）；快照取上游 10-13 版（仅前置一行声明头，生成器同步带头）。
  - UI 面（适配本仓）：拉取面板替换为右侧抽屉（`ModelsFetchedModelsDrawer` + theme-ui `ModelsFetchedModelsDrawerView`，搜索/全选只作用可见项/逐模型测试走本仓既有 `models.probe` IPC）；hook 的拉取态升级（loading/ready/error + search/tests，UI-first 等绘制再拉取）；勾选写入参数（`fetchedModelToDefinition`，input 按 vision 推导、默认档位不写）；推理档位 HTML5 拖拽排序（`reasoning-levels.ts` + 表单 DropLine/落点半区）；服务商行「清空模型」（confirmDialogAtom 二次确认，默认模型属该服务商时一并取消）；删除旧 `ModelsFetchedModelsPanel`；i18n zh/en 补 10 键（清掉无消费方的 `selectAllModels` 旧键）；本仓服务商级「测试可用性」全链保留。
  - 有意不搬：上游 `test-impact.mjs` 的 EXPLICIT_SOURCE_TESTS 映射（本仓脚本无该表）；服务商/模型编辑弹窗化重设（3cfafb896，任务「不做」项）。
- 实际运行：见验收分层；含抽屉断言按本仓 radix 版本行为适配（关闭即卸载 vs data-state=closed）与 jsdom 假 DataTransfer 拖拽测试。
- 未运行及原因：真实网关拉取回合（规则：真实 Provider 默认不可用，以单测 + 组件测试为准）；UI 实机走查待用户验收。
- Worktree：主工作区串行，未拆出（无并行写需求）。
- 剩余风险：models.dev 目录不可达时回填退化为纯网关自报（符合任务「不强依赖」约定）；上游后续若改抽屉视图，本仓 theme-ui 副本需对照更新。
