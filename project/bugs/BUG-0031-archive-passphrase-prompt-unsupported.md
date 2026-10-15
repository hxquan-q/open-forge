---
id: BUG-0031
type: bug
status: done
priority: P1
owner: apps/desktop
source: agent-browser 现场测试（会话页「导出可迁移会话归档」点击后立即报错）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 会话归档导出/导入使用 window.prompt 收集口令，Electron 不支持导致功能必失败

## 用户操作流程

1. 打开任意已有会话；
2. 点击标题栏「导出可迁移会话归档」或「导入会话归档」。

## 实际行为与期望行为

- 实际：弹出原生提示框「导出会话归档失败：prompt() is not supported.」，
  功能完全不可用（导出与导入两条路径同样必败）。
- 期望：弹出应用内口令输入框（可留空），确认后进入保存/打开文件对话框并
  完成归档写出或导入。

## 环境与失败证据

- 应用版本：dev main；OS：Windows。
- agent-browser 实测：点击「导出可迁移会话归档」后出现 366×129 原生窗口
  （标题 `vetta`），UIAutomation 读得文本
  `导出会话归档失败：prompt() is not supported.`。

## 最小复现

1. 打开任意会话；
2. 点击「导出可迁移会话归档」；
3. 必现失败弹框。

## 影响

- 「导出可迁移会话归档」「导入会话归档」两个入口在桌面端 100% 不可用，
  归档迁移功能整体失效。
- `window.prompt`/`alert` 系 Electron 不支持/不推荐的原生调用；prompt 直接
  抛错，alert 虽能显示但是同步阻塞式原生框。

## 根因

`session-archive.ts` 在收集归档口令时直接调用 `window.prompt()`。Electron
不支持 `window.prompt`（同步弹窗 API 未实现，调用即抛
`prompt() is not supported`）。该缺陷自功能引入提交 `153f5c891` 起即存在，
此前没有覆盖该路径的实机/组件测试。

## 候选修复（已选 A）

- A. ✅ 复用共享确认对话框：给 `ConfirmDialogState` 增加可选 `input` 字段
  （label/placeholder/defaultValue/password），`onConfirm` 追加回传输入值；
  视图层 `ConfirmDialogView` 在 message 下方渲染单行输入（password 类型
  掩码、Enter 提交、自动聚焦）；`useConfirmDialogModel` 管理输入值并在
  每次打开时重置为 defaultValue；`useChatViewModel` 先弹对话框再调
  `window.vetta.sessionArchive.*`。取消对话框即放弃操作，不再继续走 IPC。
- B. 独立新增 promptDialogAtom + PromptDialogView（未选）：与确认对话框
  八成结构重复，违反优先复用既有模式的原则。

## 修复与验证

- 修复文件：
  - `apps/desktop/src/renderer/shared/store/ui-atoms.ts`
  - `apps/desktop/src/renderer/shared/hooks/useConfirmDialogModel.ts`
  - `packages/theme-ui/src/overlays/ConfirmDialogView.tsx`
  - `apps/desktop/src/renderer/domains/conversation/services/session-archive.ts`
  - `apps/desktop/src/renderer/domains/conversation/hooks/useChatViewModel.ts`
- 回归测试：`useChatViewModel.archive.test.tsx`——exportArchive 打开含
  input 的确认对话框、onConfirm 以用户输入的口令调 sessionArchive.export、
  importArchive 同理；取消路径不产生 IPC 调用。
- 实机验证：「导出可迁移会话归档」→ 应用内口令框 → 确认 → 原生保存对话框
  正常出现；「导入会话归档」→ 口令框 → 打开文件对话框正常出现。
