---
id: TASK-0069
type: task
status: blocked
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0006
source_issue:
execution: serial
branch: task/TASK-0069-workspace-integration-polish
worktree: unassigned（共享工作区串行，待 lane 合入后开工）
base_commit: forge/dev
read_paths: [apps/desktop/src, packages/coding-agent/src, packages/theme-ui/src, packages/plugins/presets/vetta-ui-design]
write_paths: [apps/desktop/src, packages/theme-ui/src, apps/desktop/src/shared/i18n/locales, .github/release-notes]
exclusive_paths: [apps/desktop/src/renderer/domains/activity-panel/builtins/index.ts, apps/desktop/src/main/agent-runtime/composition.ts, apps/desktop/src/main/agent-runtime/function-extension-source.ts]
depends_on: [TASK-0060, TASK-0062, TASK-0064]
conflicts_with: [TASK-0027]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# PLAN-0006 集成收口与 UI 一致性完善

## 目标

各 lane（0060 Canvas 服务+UI、0062 Browser 点选+会话控制器、0064 Terminal tab）合入 `forge/dev` 后做集成收口：消解共享文件冲突、补齐 lane 间接缝（`browser_tab` host function、未读徽标、插件类型兜底）、统一新 UI 与既有设计体系的一致性，并完成「Agent Workspace v1」五条演示流程的验收准备。

## 范围

### 并发评估

- 结论：不支持并行——共享工作区串行，由 coordinator 直接执行；各 lane 合入是本任务的前置。
- 前置依赖：TASK-0060、TASK-0062、TASK-0064 合入 `forge/dev`；TASK-0063 的 host function 残余作为本任务范围并入（0062 lane 已建会话控制器，未接工具 host function）。
- 冲突文件/独占路径：`builtins/index.ts`（canvas/terminal 注册行）、`composition.ts`（0060 × 0053）、`function-extension-source.ts`（artifact fn 已在、browser_tab fn 待加）、`ipc/canvas-browser-tab.test.ts`（0060 × 0062 均改）。
- 集成顺序：先 0064（独立面）→ 0060（Canvas 服务+UI）→ 0062（picker+控制器）→ 本任务接缝代码。
- 与 TASK-0027 互斥：同一 IPC/Activity Panel 改动面，串行。

### 做

- **集成消解**：`builtins/index.ts` 同时落 `canvas`（0060）与 `terminal`（0064）注册行；`composition.ts` 合并 MCP 与 Canvas 装配；`canvas-browser-tab.test.ts` 两边断言并集。
- **`browser_tab` host function**：在 `function-extension-source.ts` 按 `attach_artifact` 同款模式接 WebView 会话控制器；写类动作过 Tool Approval，读类直通；`stale_reference` 错误形状按 0059 合同。
- **Canvas 缺口补齐**（0061 追加项，0060 lane 未实现）：新产出未读徽标/选中提示（不抢焦点，artifact 事件驱动）；插件类型 artifact 兜底元信息卡 + 已知类型（`.vetd`）跳已注册 surface。
- **UI 一致性审查与修正**（用户硬性要求）：
  - 新增 UI（Canvas tab 面板/列表/预览/空态、picker 工具栏与 overlay、terminal tab、`TaskArtifactPreview`）复用既有组件与设计系统，无手写按钮/自定义 shadow/厚边框（`apps/desktop/DESIGN.md`）。
  - 全部用户可见文案走 i18n zh/en；图标走 iconify；键盘可达与 aria 语义合规。
  - picker overlay 的视觉风格与应用内既有高亮/选中语义一致。
- **端到端接缝验证**：capsule→草稿 attachment 全链路（picker 生成→附件→发送）；`artifact` 工具 create→Canvas 列表→徽标出现。
- **v1 演示准备**：按 PLAN-0006 验证节五条流程整理演示 checklist；本地 fixture 页备好。
- 候选发布说明按首发门禁留在交付记录（manifest 未切入 `0.1.0` 前不写 `v*.md`）。

### 不做

- 不重做各 lane 已完成部分；集成冲突按「两边并集」原则消解，不改语义。
- 不做 PLAN-0007 范围（console/network、HTML 内点选、操作可见指示、renderer registry 消费）。
- 不动 0028/0053/0068 等仍在 lane/共享工作区进行中的改动。

## Given / When / Then

- Given：0060 与 0064 均已合入；When：打开 Activity Panel「+」；Then：`canvas` 与 `terminal` 两个内置 tab 同时可挂载，互不覆盖。
- Given：Agent 调 `browser_tab` click；When：页面存在且 ref 未过期；Then：操作落在用户正看的 WebView 上；页面变更后旧 ref 返回 `stale_reference`。
- Given：Agent `create` artifact 后用户未打开 Canvas；When：事件到达；Then：Canvas tab 出现未读提示，不抢焦点。
- Given：workspace 有 `.vetd` artifact；When：Canvas 列表点击；Then：跳「设计画布」tab；未知类型显示元信息卡。
- Given：新 UI 全套；When：对照 DESIGN.md 与 i18n 检查；Then：无硬编码文案、无手写按钮/越界样式，键盘可达。

## 必须保持

- 各 lane 已交付行为不回退；冲突消解只做并集不做取舍。
- `browser_tab` 不暴露任意 JS、cookie、token；读/写审批分类与 0059 合同一致。
- 主工作区他人未提交改动（0068、transcript-window、subscriber-queue 等）原样保留。

## 测试与验证

- 集成后 `bun run test:impact -- <变更文件>`、`check:quick`、收尾 `check`。
- `browser_tab` host function 合同测试（能力驱动挂载/缺 WebView 不注册/审批分类/stale_reference）。
- Canvas 徽标与兜底卡组件测试；picker→draft 链路测试。
- UI 一致性：对照 DESIGN.md 走查 + i18n key 全量解析检查。
- 演示 checklist 就绪即移交 v1 人工验收（PLAN-0006 判据）。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
