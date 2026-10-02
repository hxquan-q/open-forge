---
id: TASK-0181
type: task
status: in_progress
priority: P2
owner: frontend-apps
requirement: REQ-0009
source: user-request
related_requirement: [REQ-0009]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0181-desktop-font-preferences
worktree: unassigned（待标准工具创建）
base_commit: c593afdeeb763e1747717ccff6f7b01963624be2
read_paths: [apps/desktop, packages/theme-ui, packages/ui, docs/dev]
write_paths: [apps/desktop/src/renderer/shared/theme, apps/desktop/src/renderer/shared/store, apps/desktop/src/renderer/shared/i18n, apps/desktop/src/renderer/domains/settings, apps/desktop/src/renderer/domains/bottom-panel/terminal, apps/desktop/DESIGN.md, project/requirements/REQ-0009-desktop-font-preferences.md, project/research/RESEARCH-0020-desktop-font-preferences-and-licenses.md, project/tasks/TASK-0181-desktop-font-preferences.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/desktop/src/renderer/shared/theme, apps/desktop/src/renderer/domains/settings/components/AppearanceSettingsView.tsx, apps/desktop/src/renderer/domains/settings/components/useAppearanceSettingsModel.ts, apps/desktop/src/renderer/domains/bottom-panel/terminal/TerminalSurface.tsx]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 本机字体偏好

## 目标

实现 [REQ-0009](../requirements/REQ-0009-desktop-font-preferences.md)，依据 [RESEARCH-0020](../research/RESEARCH-0020-desktop-font-preferences-and-licenses.md) 提供界面/代码字体选择、预览、保存和恢复默认，终端跟随代码字体。归属 Open-Forge-only；不复制竞品代码，不分发字体文件。

## 范围与并发评估

- 条件支持与无交叉路径 Task 并发；本 Task 内状态、主题、设置和终端紧耦合，单 Agent 串行实现，不派额外 Agent。
- execution 为 parallel 以使用标准隔离 Worktree；先提交来源记录和合同，再由 main 建树。
- Branch：task/TASK-0181-desktop-font-preferences；Worktree：../open-forge-wt/task-0181-desktop-font-preferences。
- 独占上述主题、外观 model/view 和终端表面；共享 i18n/store/发布说明与导航逐路径核对归属。
- 集成负责人：本 Agent；顺序：定向/impact/check → Task 原子提交 → main 合并复验 → 审核待推批次。

### 做

- 界面与代码两项字体，保留现行默认栈；用户主动读取本机字体后可搜索、预览、选择和分别恢复默认。
- Chromium Local Font Access API：unknown 边界校验，只读 family 元数据，不读取字体二进制，不新增依赖、IPC 或权限。不可用/拒绝/失败有反馈和重试，默认始终可用。
- 等宽候选按实际字宽筛选，不靠名称；中英混排与易混代码字形预览。
- 偏好持久化、启动应用、主题切换保留覆盖优先级；写入失败不伪称保存成功。
- 活动终端更新字体、重新 fit/同步 PTY 尺寸；加载完成补测量，不重建 Shell、不丢输出。
- i18n、组件接线/生命周期测试、发布说明；保留系统字体设计基线，仅增加用户本机偏好例外。

### 不做

内置/下载/导入字体、字体上传、商店、跨机同步、独立终端字体、字号/行高/连字配置、原生菜单/外部网页字体、真实 Desktop/Provider 验证。

## Given / When / Then

1. 默认用户打开外观 → 主动读取、搜索、选择界面字体 → 预览与 UI 生效，代码仍等宽。
2. 活动终端存在 → 修改代码字体 → 终端字形/尺寸响应，实例、PTY 和已有输出保留。
3. 保存字体 → 切明暗/配色、模拟重启 → 偏好保留；分别重置恢复当前主题默认栈。
4. 枚举失败/不支持、字体缺失、偏好损坏或写入失败 → 明确反馈且能重试/恢复，不阻塞外观页。
5. 卸载或连续请求 → 不应用过期结果，释放订阅；终端隐藏期间变更能在恢复可见后重新 fit。

## 必须保持

默认视觉、主题/i18n、中文及等宽回退、终端会话和输出、包依赖方向、安全字体名处理，不增加网络/宿主权限或真实状态访问。

## 测试与验证

- 定向：bun scripts/quality/run-vitest.mjs --run 加实际测试路径；先 red 再 green。
- 用户流程：真实偏好存储/主题应用/设置组件，字体枚举/Canvas/PTY 为窄外部替身；证明活动终端不重建。
- 质量：test:impact、编辑轮 check:quick、最终 bun run check；公共影响不明时 test:changed。
- 不运行 verify:ui:*；字体观感、平台枚举与真实终端字符宽度列入人工验收。

## 验收分层

- 工程验证：待执行。
- 技术评审：计划自审，不宣称独立评审。
- 集成：pending。
- 人工功能验收：待验收，工程通过后保持 verifying。
- 发布：未授权；开发集成遵循已有 main:dev 合同。

## 功能验收包

设置 → 外观 → 字体：读取本机字体、搜索并分别选择；切换主题、重启、恢复默认。检查中英文字、代码对齐与活动终端输出；不可用平台可恢复默认并看到说明。

## 交付记录

- 前置：上一轮 4 个未提交管理文件属于本 Task 来源，本轮提交后作为工作树基线。
- 实际修改/命令/结果：实施中回填。
- Worktree：待创建。
- 未运行：真实 UI、Provider、发布。
- 剩余风险：浏览器 API 平台支持、等宽测量与中文回退的实机表现待验收。
