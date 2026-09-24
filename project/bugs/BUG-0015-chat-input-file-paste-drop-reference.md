---
id: BUG-0015
type: bug
status: investigating
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
updated: 2026-09-24
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

- 尚未补充。需分别覆盖普通对话输入的粘贴文件、文件拖入，以及侧边栏已有选择路径保持可用；必要时覆盖团队输入是否共享合同。

## 修复与验证

- 修复：待调查。
- 测试：待调查。
- 检查：待调查。
- 未运行及原因：尚未开始实现。
