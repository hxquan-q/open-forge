---
id: TASK-0267
type: task
status: ready
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
worktree: 待实施时定
base_commit: b687d6f00
read_paths: [project/research/RESEARCH-0025-upstream-0.5.60-0.5.64-sync-audit.md]
write_paths: [apps/desktop/src/main/models, apps/desktop/src/renderer/domains/settings/components, apps/desktop/src/shared/i18n/locales, project/tasks/TASK-0267-model-pull-param-backfill.md]
exclusive_paths: []
depends_on: [TASK-0266]
conflicts_with: []
integration_status: pending
created: 2026-10-15
updated: 2026-10-15
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

- 工程验证：待执行。技术评审：自审。集成：pending。
- 人工功能验收：待验收。发布：未授权；交付时补发布说明。

## 功能验收包

- 入口：设置 → 模型配置 → 从接口拉取。
- 预期：面板化选择 + 参数自动补齐。
- 不通过：参数缺失或手动值被覆盖。

## 交付记录

- 实际修改：待回填；实际运行：待回填；未运行及原因：待回填；Worktree：待回填；剩余风险：待回填
