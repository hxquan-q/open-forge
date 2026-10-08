---
id: ISSUE-0032
type: issue
status: draft
priority: P2
owner: packages/plugins/presets/allstar-coding
related_requirement: []
related_plan: []
related_tasks: [TASK-0219, TASK-0220]
related_issues: [ISSUE-0030]
related_bugs: []
source: user-report（TASK-0219 提交 22ebf3a69 人工审查的既有面观察）
created: 2026-10-05
updated: 2026-10-05
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# ac-fence 写域 glob 与 agent-browser 通道的词法匹配边界

## 背景

TASK-0219 审查确认黑盒新增的白名单/读域绕过（BUG-0082）后，同批观察到的两个**既有**边界未被本次修复覆盖：

1. **写域 glob 同为词法匹配，`..` 可逃逸**：`compileScope`（`scripts/scope-glob.mjs`）对 `src/dto/../../evil.ts` 会命中 `src/dto/**`——与 BUG-0082 问题 2 同构，但该路径自 v0.4 ac-fence 引入起就存在（`effectiveWriteScope` → `compileScope`），非 TASK-0219 新增。写域拦截还依赖 file-edit 调用带 path 字段；shell 重定向写文件围栏不可见（黑盒 shell 已被白名单收死，但其他角色的 shell 重定向写仍不受写域判定）。
2. **`agent-browser open file://...` 可绕读域**：黑盒读域管的是 `read` 工具的 path 边界，通道引擎内部能打开什么 URL（file://、任意 http）不在围栏判定面内。

## 编号说明

- 原立案编号 ISSUE-0031：2026-10-08 合并 origin/dev 时发现 dev 侧已并行立案同号 ISSUE-0031（qwen3.8 端点），按「dev 已有在前」顺延为 ISSUE-0032，引用同步更新。

## 未决问题

- 写域 `..` 逃逸是否值得统一修（在 `compileScope` 或其调用侧做 `..` 段 fail-safe）？影响面是全部角色而不只 blackbox，需评估既有契约测试的兼容成本。
- shell 重定向写是否应纳入写域判定（如对非黑盒角色的 `>`/`>>` 做 path 提取）？收益与误伤（合法构建产物重定向）如何取舍？
- 通道引擎可打开的 URL scheme 是否需要宿主侧约束（agent-browser / browser_tab 的 navigate/file 面）？这属于内核/宿主能力面，插师范畴只能记录。

## 候选方案

- 最小修：仅给 `compileScope` 匹配入口加 `..` 段拒绝（与 BUG-0082 修法同构，一处修全部角色受益）。
- 面修：写域判定统一走「规范化后相对根再匹配」，顺带覆盖 shell 重定向提取——成本高，需新合同测试批次。
- 不修：依赖任务书 path 由主控点名、越权事后审计双链兜底（现有 L1.5 语义）。

## 决策触发条件

- 出现真实的 `..` 写域逃逸审计事件，或下一次动 scope-glob / 写域判定的工作顺带统一。
- 宿主侧（内核）立项通道 URL scheme 约束时，同步评估插件侧配合面。

## 后续可能拆出

- 写域 `..` fail-safe 的实现 Task（含全角色合同测试）。
- shell 重定向写的写域判定调研 Research。
