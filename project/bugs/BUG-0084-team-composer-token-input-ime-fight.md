---
id: BUG-0084
type: bug
status: verifying
priority: P1
owner: apps/desktop conversation (team composer / input editor)
source: 用户反馈（2026-10-10，team 模式下引用文件后输入框与用户抢键盘）
requirement:
plan:
related_requirement: []
related_plan: []
related_tasks: [TASK-0220]
related_issues: []
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# team 会话里引用文件后输入框反复重建内容：中文输入法组字被打断、光标闪烁无法输入

## 用户流程

- Given：team 模式会话（受控编辑器 + `ControlledValueBridgePlugin`），用户在输入框里粘贴/引用了文件（资源管理器复制文件 → 输入框粘贴，或 @ 面板/拖放引用），草稿里出现文件 token。
- When：随后继续输入（尤其中文输入法组字）。
- Then：输入应正常落地，token 与正文共存。

## 实际行为

- 每敲一次键（以及团队会话流式期间 model 每次变化）都会把编辑器内容**整体重建**：`$applySegments` → `root.clear()` + 重新 append + `paragraph.selectEnd()`。
- 中文输入法正在组字时被这次重建打断：候选/拼音被取消（表现为「一直弹英文」），已敲的字符不提交（「光标闪烁却无法输入」），光标还被 `selectEnd()` 拽到末尾（「和用户抢键盘」）。
- 同一输入框在没有 token 的纯文本草稿下不触发（实测每步 0 次投影重建），普通（非 team）会话走 `ValueBridgePlugin`，编辑器是真相源，不受影响。

## 期望行为

草稿文本（含 token 的 wire 文本）等价时，受控投影**不得**改写编辑器内容；token 的展示元数据（`isDirectory` / `label` / `iconUrl` / `alias` / `icon` / `avatar` / `meta`）由编辑器持有，解析回来的投影天然没有这些字段，不应因此判不等。只有真正的结构差异（文本不同、token 与纯文本互换、路径/名字不同、数量不同）才同步。

## 根因证据

1. `ControlledValueBridgePlugin.tsx` 的 `inputSegmentsEqual` 逐字段比较，file 分支要求 `segment.isDirectory === candidate.isDirectory`。
2. 但 team 的投影来自文本：`TeamComposerConnector.projectTeamDraftSegments` → `parseInputSegments(model.draft).segments`，而 `parseInputSegments` 的 `pushPath` 产出 `{ kind: "file", path }`，**从不带 `isDirectory`**；`$readSegments` 读编辑器时总是带布尔 `isDirectory`。`false === undefined` 恒为假 ⇒ 只要草稿里有文件 token，投影比较永远判不等。
3. 后果链：`model` 变化（流式每秒多次）或每次敲键触发 `setDraft` ⇒ `editorSegments` 变新引用 ⇒ effect 运行 ⇒ 判不等 ⇒ `editor.update(() => $applySegments(...), { tag })` 重建内容与选区 ⇒ 组字被取消（拼音字母以英文留在输入框、候选不再弹出）、光标被 `selectEnd()` 拽到末尾。
4. 第二处文本无法往返的差异：`serializeInputSegments` 会在 token 与紧跟的正文之间**合成**分隔空格（`@C:/a.md你` → `@C:/a.md 你`），编辑器节点里没有这个空格，解析回来的投影带前导空格，逐字符比较同样恒不等。只放宽元数据（第一版修复）后实测仍每步多一次投影重建（新回归测试报 `expected 2 to be 1`），两处必须一起处理。
5. 同类字段（`label` / `iconUrl` / `alias` / `icon` / `avatar` / `meta`）同样无法在文本里往返：带展示名的 connector / skill / member token 命中同一逻辑，修复一并覆盖。

## 最小复现

1. 进入 team 会话，在资源管理器复制一个文件，在输入框粘贴（出现文件 token）。
2. 切到中文输入法输入任意字符。
3. 观察：候选被反复取消、字符不落地、光标跳末尾；把该文件 token 删掉后输入恢复正常。

测试级复现（修复前必红）：受控 `InputEditor` + 文件 token 草稿，`insertPlainText("你")` 后断言投影重建次数不增加、编辑器文本保留 token 与输入字符。实测：修复前文件 token 每步 +2 次 `$applySegments`（其中 1 次为测试自身调用，另 1 次是投影重建），纯文本每步仅自身 1 次；只放宽元数据后仍每步 +1（分隔空格差异）；完整修复后 0 次额外重建。

## 影响

- team 会话在引用文件后基本无法输入（输入法完全不可用，英文直输也会被光标跳转干扰）；不丢数据、不影响其他会话形态。
- 严重度 P1：功能在该路径上不可用，且用户侧无绕行办法（唯一的绕行是删掉文件 token）。

## 回归测试

`apps/desktop/src/renderer/domains/conversation/components/input-bar/editor/ControlledValueBridge.test.tsx`（10 例）：文件/目录/图片/技能/场景/连接器/成员（team 形状 mention 投影）token 下打字不触发投影重建；流式形态连续 5 轮父渲染不重建；带展示名 token 在父渲染后不被重建；外部值变化（含移除 token）仍同步（防止把比较放宽成「永不同步」）；投影 mention 元数据变化不重建编辑器（编辑器保留自有 label）。

## 修复与验证

- 修复：见 [TASK-0220](../tasks/TASK-0220-team-composer-token-input-fight.md)：受控投影改为「规范序列化文本一致 + 结构（kind 与 wire 身份）一致」判等，token 展示元数据与序列化器合成分隔符不再参与；代码与回归测试提交 `c68ece72c`。
- 测试/检查：见 TASK-0220 交付记录。
