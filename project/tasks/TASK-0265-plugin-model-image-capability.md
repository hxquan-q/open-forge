---
id: TASK-0265
type: task
status: ready
priority: P2
owner: packages/capability-sdk + packages/plugins
requirement: REQ-0008
plan: PLAN-0014
source: RESEARCH-0025; upstream c8fa6fbe2
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: 待实施时定（若与主树在途改动不相交则 main 串行）
base_commit: b687d6f00
read_paths: [project/research/RESEARCH-0025-upstream-0.5.60-0.5.64-sync-audit.md]
write_paths: [packages/capability-sdk/src/domain/model.ts, packages/plugins/src/domains/plugins/runtime/plugin-models-api.ts, apps/desktop/src/main/models, project/tasks/TASK-0265-plugin-model-image-capability.md]
exclusive_paths: []
depends_on: [TASK-0264]
conflicts_with: []
integration_status: pending
created: 2026-10-15
updated: 2026-10-15
---
<!-- Copyright The Open Forge contributors. -->

# 插件模型图像输入能力保留（对照上游 c8fa6fbe2）

## 目标

先证伪/证实：本仓插件注册与恢复模型的链路是否会在写入/读回时丢失图像输入能力（上游在模型写入合同与 SDK 输入类型声明上补齐）。证实则按上游形状适配并补合同测试；证伪则在交付记录写明证据并关闭。

## 范围

### 并发评估

- 结论：条件支持；capability-sdk/plugins 路径与在途 TASK-0260/0261/0262 不相交
- 执行方式：serial
- 前置依赖：TASK-0264（本批顺序）
- Branch：main；Worktree：不拆预期

### 做

- 对照上游 `c8fa6fbe2` 的 14 个文件（capability-sdk model 合同、plugin-models-api、model-settings-service 读回、coding-agent model-registry），逐一定位本仓对应面并写最小复现（旧实现丢能力即红）。
- 证实后适配：SDK 输入类型声明、写入/读回保留、合同测试。

### 不做

- 不动本仓模型输入能力投影（TASK-0163 成果）的既有语义；不升 SDK 大版本，按本仓版本线策略递增。
- 不做上游 bun.lock/docs/capabilities 目录的机械照搬，按本仓事实源对应处理。

## Given / When / Then

- Given：插件通过 models API 注册带图像输入能力的模型并持久化；When：宿主重启后读回模型目录；Then：图像输入能力保留，会话按能力投影继续可用（与注册时一致）。

## 必须保持

- 插件不可信边界：模型注册仍走结构校验，不因合同扩展放宽数据面。
- 既有模型配置兼容：历史无该字段的记录读回不报错。

## 测试与验证

- 定向：capability-sdk domain/model、plugin-models-api、model-settings-service 合同测试（含旧实现失败的红测）。
- 质量：`bun run test:impact`、批末 `bun run check`。

## 验收分层

- 工程验证：待执行。技术评审：自审。集成：pending。
- 人工功能验收：不适用预期（合同面）；若涉及插件目录 UI 再补。
- 发布：未授权；交付时补发布说明。

## 功能验收包

- 入口：插件注册图像输入模型 → 重启 → 会话发图。
- 预期：图像输入可用性保持。
- 不通过：重启后模型退化为纯文本。

## 交付记录

- 实际修改：待回填；实际运行：待回填；未运行及原因：待回填；Worktree：待回填；剩余风险：待回填
