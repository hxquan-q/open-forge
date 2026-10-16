---
id: BUG-0114
type: bug
status: verifying
priority: P2
owner: skill-presets
requirement:
plan:
source: RESEARCH-0027; 全量保留日志巡检与现有 Schema 只读校验
related_requirement: []
related_plan: []
related_tasks: [TASK-0271]
related_issues: []
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# report-canvas 展示元数据使用 Schema 不支持的 canvas 枚举

## 用户流程

- Given：内置 report-canvas 已安装。
- When：用户打开能力页面，宿主构建本地能力展示索引。
- Then：期望载入内置展示；实际 Schema 拒绝该能力的 presentation，服务捕获异常后忽略展示。

## 实际行为与期望行为

`ability.json` 的默认及英文 showcase 均为 `canvas: "markdown"`。现行 showcaseSchema 只允许 design/code/docs/generic/browser/terminal/board。期望描述文件符合现行合同；不因此推断技能执行不可用。

## 环境与失败证据

Windows，源码 HEAD a4ccf2938；保留日志共 25 次，最近 dev/main/2026-10-15.log:3154，ZodError 明确包含 showcase.canvas 枚举错误。

## 最小复现

通过 Bun 导入 `apps/desktop/src/main/abilities/open-marketplace/marketplace-schema.ts` 的 marketplaceDetailBlockSchema，读取 `packages/skill-presets/report-canvas/ability.json` 后对 detail.blocks[0] safeParse。2026-10-16 实际执行：success=false，path 为 showcase.canvas；同脚本 architecture-canvas 对照 success=true。没有启动 Desktop 或调用模型。

## 影响与根因证据

P2，内置能力详情展示降级，启动/浏览能力时反复告警。源码描述与解析枚举直接不匹配，置信度高。引入描述的相关提交 `0d7605a87`（2026-09-24），未检索到后续纠正该字段的提交或专项记录。

## 回归测试

待修复 Task 从本地能力展示公开入口加载真实内置描述，断言 report-canvas 展示存在且默认/英文均能解析；旧字段会失败。避免只断言枚举常量。

## 修复与验证

- 修复：未实施；本轮只分析并立案，未创建实施 Task。
- 验证：现有 Schema 只读校验已确认失败，对照通过。
- 未运行：产品测试、完整 check、UI 与模型调用；没有实现变更。
- 关联调查：[RESEARCH-0027](../research/RESEARCH-0027-dev-log-audit.md)。
