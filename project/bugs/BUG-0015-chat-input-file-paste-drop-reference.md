---
id: BUG-0015
type: bug
status: done
priority: P2
owner: apps/desktop
source: user-report
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-24
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 对话输入框无法通过粘贴或拖放引用文件

## 用户流程

- Given：用户正在编辑对话输入，目标文件可从操作系统剪贴板或文件拖放来源取得。
- When：用户把文件复制后粘贴，或将文件拖入输入区域。
- Then：输入区应将文件作为引用/附件加入草稿，发送后会话应收到对应文件引用。

## 实际行为

用户报告通过复制粘贴或拖放文件无法形成引用；但从应用侧边栏的文件入口直接操作可以。报告未细分复制来源、拖放来源、文件类型及目标区域，因此这些交互需要在调查时分别确认。

## 期望行为

支持范围内的文件来源应能通过粘贴或拖放加入对话草稿，并与侧边栏选择文件的引用行为一致；不支持的输入应保持原有文本编辑行为且给出明确反馈。

## 最小复现

1. 打开项目的新会话或现有会话输入框。
2. 从用户报告中的文件来源复制文件并粘贴，或将文件拖入输入区域。
3. 检查草稿中的文件引用及发送后的消息附件；以应用侧边栏选择同一文件作对照。

## 影响

用户无法使用常见的复制粘贴/拖放流程补充上下文；目前已有侧边栏文件选择作为替代路径。

## 根因证据

- 对话输入的拖放处理由 `apps/desktop/src/renderer/domains/conversation/hooks/useSessionDropZoneModel.ts` 提供；聊天输入组件在 `apps/desktop/src/renderer/domains/conversation/components/input-bar/DefaultInputBarConnector.tsx:48` 接入。
- `apps/desktop/src/renderer/domains/conversation/connectors/team/TeamComposerConnector.tsx:260` 存在另一条团队输入拖放实现，需确认用户报告是否也覆盖团队会话。
- `apps/desktop/src/renderer/domains/conversation/components/input-bar/editor/plugins/StructuredClipboardPlugin.tsx:54` 处理结构化剪贴板内容；当前搜索到的剪贴板逻辑不能证明普通文件对象粘贴路径已实现。
- 用户报告侧边栏路径可用，指向输入来源/事件接线差异的调查方向；尚未通过复现确定故障边界。

根因置信度：低；不支持行为由用户报告确认，具体平台 API 或事件接线问题待复现。

## 回归测试

- 已补充（先红后绿）：`apps/desktop/src/renderer/domains/conversation/components/input-bar/InputBarFileReference.test.tsx` 从真实入口断言——原生 `paste` 事件打在真实 `[contenteditable]`、`drop`/`dragover` 打在真实 `[data-vetta-drop-scope="input"]`、侧边栏点真实工具栏按钮，结果断言 `mentionedFilesAtom`（发送链路读取的草稿投影）与 `inputValueAtom`。
- 红测实证：回退实现到基线后 1 失败/4 通过（4 条为拖放、侧边栏、图片粘贴、纯文本不接管的防护断言，修复前即绿，精确锁定唯一缺口）。

## 修复与验证

- 根因：**粘贴路径**未接线（拖放路径本就完整）。`PasteImagePlugin` 只认 `image/*` 剪贴板项，`StructuredClipboardPlugin` 只认应用私有 MIME；从资源管理器复制的 pdf/md/代码文件是 `kind:"file"` 且非图片，两个插件均不接管，最终落到 `@lexical/plain-text` 把文件当纯文本插入。
- 修复：新增 `PasteFilePlugin.tsx`（只认非图片文件项，与图片落盘路径互斥），`clipboard-images.ts` 增加 `readClipboardReferenceFiles`，在 `InputEditor.tsx` 两个分支挂载。团队输入无需单独接线：`TeamComposerConnector` → `InputBar` → `InputBarView` → `InputEditor` 全仓唯一挂载点，拖放共用同一 `dropZone`。
- 提交：`69bdf2702`（分支 `worktree-agent-af2e44ff2e986a335`，待集成）。
- 测试：目标用例 5/5；input-bar 全目录 + `InputBar.test.tsx` + `message-input/` 共 28 文件 99/99 通过。
- 检查：7 个变更文件 `check:quick` 全绿。
- 未运行及原因：未实机验证 Windows 资源管理器粘贴——未获 UI 验证授权；`webUtils.getPathForFile` 对粘贴 File 的路径解析在 jsdom 无法证明（preload 与拖放共用同一实现，解析失败按设计静默跳过），建议随下次实机验证顺带确认。
