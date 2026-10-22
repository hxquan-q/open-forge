---
id: TASK-0363
type: task
status: verifying
priority: P2
owner: desktop
requirement: REQ-0027
plan: null
source: REQ-0027
related_requirement: [REQ-0024]
related_tasks: [TASK-0346]
related_issues: []
related_bugs: []
execution: serial
branch: task/TASK-0362-weknora-er-fixes
worktree: .
base_commit: 2a74e7fc1
read_paths: [apps/desktop, packages/theme-ui, docs/devflow]
write_paths:
  [
    packages/theme-ui/src/chat,
    apps/desktop/src/renderer/domains/conversation/components/ModelSelector.tsx,
    apps/desktop/src/renderer/domains/conversation/components/input-bar,
    apps/desktop/src/renderer/domains/conversation/lib/balance-value-format.ts,
    apps/desktop/src/shared/i18n/locales,
    .github/release-notes/v0.1.3.md,
    project/requirements/REQ-0027-balance-in-model-panel.md,
    project/tasks/TASK-0363-balance-in-model-panel.md,
  ]
exclusive_paths: [packages/theme-ui/src/chat]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# TASK-0363 · 余额显示移入选型面板（默认隐藏）

## 目标

把当前 provider 的余额从输入栏常驻小字移到选型面板的分组标题行，默认隐藏（闭眼图标），点击揭示金额 + 刷新；输入栏彻底移除余额。

## 来源与规格

- 需求：`project/requirements/REQ-0027-balance-in-model-panel.md`
- 流程产物：`docs/devflow/balance-in-model-panel/`（00~06，本地排除）
- 用户拍板：落点=当前 provider 分组标题行；输入栏彻底移除；只显示当前模型；每次打开都隐藏；隐藏态只显闭眼图标；与 ER 轮同一次 push。

## 范围与并发

- 串行两票：T01（theme-ui 共享视图可选 `balance` prop + 徽标独立文件）→ T02（桌面接线、删除 `InputBarBalance`、迁移 `formatBalanceValue`、i18n）。
- 写域与 `origin/dev@2a74e7fc1` 无重叠（dev 未触碰 `ModelSelector*` / `InputBar*` / theme-ui `chat/` / `common.json`）。
- 红线照旧：C1~C8；主进程/preload/IPC 零改动；theme-ui 合同纯加法。

## Given / When / Then 与最低验证

- **Given** 选中 DeepSeek/Kimi；**When** 打开选型面板；**Then** 当前 provider 分组标题行出现闭眼图标，不显示金额。
- **When** 点闭眼图标；**Then** 显示本地化金额 + 刷新 + 睁眼图标；再点收回；关闭重开仍隐藏。
- **Given** 不支持/失败/无选中模型；**Then** 零渲染。
- **Given** 输入栏；**Then** 无任何余额节点。
- 最低验证：视图级两态与重置（假计时器/开合序列）、接线级三态与取数计数（mock IPC）、金额格式化纯函数、i18n 键集合；`tsc` + 定向套件 + conversation 域回归。

## 验收与交付

规格 AC-1 ~ AC-13 全绿；独立 tester 用例矩阵 + OCR 审查；用户端到端验收后随 ER 轮一次 push。

## 交付记录

| 提交 | 票 | 内容 |
|---|---|---|
| `93ef8aa14` | T01 | theme-ui 视图可选 `balance` prop + 余额徽标（闭眼/睁眼、打开即重置） |
| `426dedf79` | T02 | 桌面接线：余额改挂选型面板，删除 `InputBarBalance`，`formatBalanceValue` 迁 `lib/`，i18n show/hide |
| `c97fdb2d5` | T03 | REQ-0027 / TASK-0363 立项与发布说明 |
| `e1b6e762e` | testing | AC-1~13 矩阵：4 个新测试文件 + i18n 更新（23 条） |
| `0ef2108d9` | CP3 | 余额区键盘可达（keydown 逃生口）、金额 `title`、`aria-pressed`、注释更正（#1/#4/#5/#6；#2/#3 记已知限制） |
| `f6b99490e` | CP3 复验 | 键盘路径 4 条用例 + 测试注释更正 |

**已知限制（CP3 裁定不修）**：面板打开时以程序化方式切换模型，可能有一帧旧金额/旧揭示态；正常选中模型会关闭面板，不可见。

**验证**：feature 用例 10 文件 51/51；`tsc` 0；OCR 原生模式（magpie → devin/claude-opus-5-5）8/8 文件 100%，无 critical/high。

推送回执：待用户授权后回填。
