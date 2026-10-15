---
id: BUG-0101
type: bug
status: verifying
priority: P1
owner: apps/desktop conversation（team 会话渲染）
requirement:
plan:
source: 用户 dev 运行日志 temp/log/2026-10-13.log（2026-10-13）
related_requirement: [REQ-0001]
related_plan: []
related_tasks: [TASK-0241]
related_issues: []
related_bugs: [BUG-0085]
created: 2026-10-13
updated: 2026-10-13
---
<!-- Copyright The Open Forge contributors. -->

# 团队会话流式事件驱动成员胶囊条测量循环：Maximum update depth exceeded 整页崩为路由错误页

## 用户流程

- Given：用户在团队会话页（`/agent-teams/$teamId/sessions/$sessionId`）发送消息，回合进入流式（成员工作、事件高频回灌）。
- When：流式事件持续到达（或事故形态：连接死掉数分钟后，停滞级联收尾的终态事件突发一次性回灌）。
- Then：页面应持续稳定呈现会话；实际 React 抛 `Maximum update depth exceeded`，整页被路由错误边界替换为「当前页面遇到问题」。

## 实际行为

- 原始证据（2026-10-13 dev 日志 temp/log/2026-10-13.log，另一检出）：09:15:10 发送、send IPC 悬挂；09:22:02（≈2×180s 停滞看门狗级联收尾，终态事件突发回灌）`Error in route match` + 两条 `Maximum update depth exceeded`，错误页替换整页。
- 实机复现（2026-10-13，Debug Profile 隔离实例）：同一会话在 **qwen3.8-27b 正常流式开始后 ~78 秒**崩溃——高频流事件即可触发，无需失败终态；第一轮夹具停滞（368s 后正常完成）反而未崩。**触发条件修正为「流事件高频 + 真实浏览器布局」，事故中的 7 分钟间隔是停滞级联的静默期，崩溃落在终态突发。**
- 复现栈（完整证据存 `<artifactDir>/debug/bug-0101/renderer-console-crash.log`）：

  ```text
  Error: Maximum update depth exceeded ...
    at getRootForUpdatedFiber (react-dom)
    at enqueueConcurrentHookUpdate / dispatchSetStateInternal / dispatchSetState
    at updateLabelWidths (TeamMemberRoster.tsx:84:7)   ← rAF 测量回调里的 setLabelWidths
    at TeamMemberRoster.tsx:90:9
  ```

## 期望行为

- 任何流事件频率下团队会话页稳定；测量回路必须收敛，不得自驱动重渲。

## 环境与失败证据

- React 19.2.8 dev（`nestedUpdateCount > 50` 同步嵌套更新守卫 throw）。
- jsdom 组件级真实接线测试（真实 Router + TeamChatPage + composer/Lexical + 聊天壳 + 成员胶囊条）**不能**复现：崩溃依赖真实布局测量（jsdom 布局为 0，Virtuoso/胶囊条测量不产生反馈）——这解释了它逃过既有全部测试。

## 最小复现

1. Debug Profile + 真实可流式 provider，团队会话页发送消息。
2. 流式 ~1-2 分钟（成员状态随事件翻转）。
3. 控制台出现 `Maximum update depth exceeded`（旧实现）。

## 影响

- P1：流式团队会话整页崩溃为错误页，用户丢失会话上下文；正常使用路径（非故障路径）即可触发。

## 根因证据

`TeamMemberRoster`（成员胶囊条「窄窗名称收缩」）测量回路两处缺陷叠加：

1. 测量 effect 依赖 `members` **数组身份**——`useTeamChatModel` 每个流事件都产出新 `members` 数组，于是每个事件都 disconnect/重建 ResizeObserver 并重排一次 rAF 测量（复现轮实测 60 个事件 → 61 个 observer 实例）。
2. `setLabelWidths` 每次写入 `Object.fromEntries(...)` **新对象**，即使每个成员宽度都未变——真实布局的亚像素抖动（浮点测量 ↔ 应用宽度反馈）使「测量→setState→重测」永不收敛，高频流事件下级联撞穿 React 50 次同步嵌套更新上限。

## 回归测试

- `TeamMemberRoster.test.tsx` 新增三例（旧实现红）：
  - 「亚像素抖动收敛」：测量端 ±0.2px 振荡下宽度样式必须稳定（旧实现每帧翻转）。
  - 「流事件身份churn 不重排」：60 次新数组 rerender 后 ResizeObserver 实例数与 rAF 排队数不增（旧实现 61/递增）。
  - 「真名变更仍重排」：队长角标变化必须重新测量（防过度缓存）。
- `TeamChatFailureTerminalLoop.test.tsx`（新增）：真实 Router/TeamChatPage/composer/Lexical/聊天壳/胶囊条 + 终态事件突发的整树稳定性契约。

## 修复与验证

- 修复：`TeamMemberRoster.tsx`
  - `setLabelWidths` 改为函数式更新 + `sameTeamMemberLabelWidths`（键集合一致且每格差 ≤0.5px 判等价）等价即保持原引用，切断「每测量必新对象」。
  - 测量 effect 依赖改为 `measurementKey`（成员 id:名 + 队长角标签名字串），成员经 `membersRef` 读取——流事件的身份 churn 不再重挂观察器/重排测量。
- 测试：team 目录 155 例全绿（含上述回归）；desktop `typecheck:incremental`、biome 通过。
- 实机验证（Debug Profile，用户授权）：修复后同一会话 qwen3.8 流式 31.7s 回合 + 委派回合 4 分钟+（成员状态翻转、超出原崩溃窗口 3 倍），`Maximum update depth` 计数保持 2（均为修复前旧记录），页面完好、输入区未卸载。
- 检查：`check:quick` 仍红，归因为 21 条**基线外缺声明头的已提交文件**（TASK-0235-0239 批次等他人工作，非本任务引入）；本任务三个文件已带声明头且不在缺失清单。
- 未运行及原因：完整 `bun run check` 因上述既有红不可判绿，其余 stage（agent-guide/glossary/workflow-skills/task-worktrees/turbo-config）通过。
