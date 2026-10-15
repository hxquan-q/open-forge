---
id: BUG-0069
type: bug
status: verifying
priority: P1
owner: desktop
source: RESEARCH-0022; TASK-0188 regression
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0188]
related_issues: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 流式输出使历史回复用量引用不断变化

## 用户流程与最小复现

历史回复已有 usage，尾部回复继续流式追加文字；重新渲染消息列表。预期未变用量沿用引用、历史行 memo 不因 usage 失效；实际收集函数每次新建等值数组。

## 环境与失败证据

Windows / Open Forge 0.1.3 / 48b8e487f；通过 Node Vitest runner 运行 message-list-derived.test.ts 与 MessageListView.test.tsx，旧实现 2 失败、15 通过，均失败于相同内容的引用 toBe 断言。首次缺 dist 的环境收集错误不计为红测，构建 Desktop 的 workspace 依赖后获得上述有效失败。

## 根因与影响

collectAgentUsages 每次创建数组，MessageListView 每次 messages 变化都把新引用传入历史回复；影响无效渲染，不据此承诺具体 CPU 降幅。

## 回归与修复

覆盖尾部增长、placeholder 恢复、usage 新增/替换/清空和组件真实接线。修复和最终检查见 TASK-0188 / TASK-0187；未运行真实 Desktop。
