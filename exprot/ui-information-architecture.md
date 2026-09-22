# Desktop UI 信息架构

## 1. 总体骨架

```text
Desktop Shell
├── Mode Switcher: work / coding
├── Project / Workspace Selector
├── Conversation List
├── Main Chat + Composer
├── Task Activity Panel
│   ├── Plan
│   ├── Current Step
│   ├── Tool Execution
│   ├── Approval Request
│   └── Recovery / Review
└── Artifact / Domain Panel
```

采用 Chat-first + Task Activity Panel：聊天是入口，Task 是可观察和可恢复的执行对象。

## 2. work 入口

```text
左侧：Conversation / Task
中间：自然语言输入 + 流式响应
右侧：
  ├── Plan / Progress
  ├── Source Files / Research Evidence
  ├── Dataset Preview
  ├── Artifact Preview
  └── Review / Export
```

工作流状态：

- 用户目标；
- Agent 计划；
- 输入资料；
- 正在处理的文件；
- 生成中的 Artifact；
- 引用和来源；
- 用户 Review；
- 保存/导出结果。

## 3. coding 入口

```text
左侧：Project / File Explorer / Conversation
中间：Chat + Plan + Diff
右侧或底部：
  ├── Activity / Tool Trace
  ├── Approval
  ├── Terminal
  ├── Test Result
  └── Artifact / Patch Review
```

coding 的关键交互：

- 选择项目和允许访问的目录；
- 展示当前 Profile、Permission Mode 和 Trust 状态；
- Tool 调用前显示高风险操作摘要；
- 修改文件默认生成 Diff，而不是静默覆盖；
- 测试输出作为 `execution-result` Artifact；
- 用户可以暂停、取消、继续和要求 Agent 修改计划。

## 4. Task Activity Panel

Activity Panel 不直接读取 Agent 私有状态，而是消费 Runtime/Session observation：

```text
Session Event / Runtime Observation
  → main projection
  → IPC event subscription
  → renderer atom
  → Activity View Model
  → Task/Tool/Approval components
```

当前仓库已有 session 事件、execution observation、Tool timing、subagent observation 和 `subscribeById` 模式。新增 Task UI 应沿用这些事件路由，不在 Renderer 维护第二套执行状态机。

## 5. Approval 面板

Approval 卡片至少展示：

- Task 和 Turn；
- Tool 名称；
- 风险等级；
- 受影响资源；
- 参数摘要；
- 可能的外部副作用；
- 允许一次、允许本 Session、允许本 Project、拒绝；
- Trust scope、来源、过期时间。

UI 选择只产生 Approval Decision，不能直接调用 Tool。

## 6. Artifact 面板

核心 Renderer 支持：

- Markdown/Text；
- JSON/CSV/表格；
- Diff/Patch；
- 图片和引用；
- Execution Result；
- Research Evidence；
- Bundle 列表。

Plugin Renderer 通过 descriptor registry 注册，必须经过 capability/permission session，不允许随意读取绝对路径。

## 7. IPC 实施约束

新增 UI 行为时遵循现有 Desktop 分层：

1. `preload/api-types/<domain>.ts` 定义合同；
2. `preload/apis/<domain>.ts` 定义 channel 和 API；
3. `preload/index.ts` 暴露 API；
4. `main/ipc/<domain>.ts` 注册 handler/teardown；
5. 领域逻辑放 `main/<domain>/`，不得反向 import IPC；
6. 事件订阅复用 `subscribeById`；
7. renderer 状态放 Jotai domain atoms；
8. 用户文案进入 i18n；
9. 所有跨进程输入运行时校验。

## 8. UI 不变量

- Renderer 不拥有 Task/Approval 最终状态；
- 关闭面板不取消 Task；取消必须通过显式 Runtime Command；
- IPC 事件可重放/补快照，不能依赖事件永不丢失；
- UI 崩溃后重新打开仍可从 Session/Task projection 恢复；
- Tool details/card payload 不自动进入模型上下文；
- 高风险动作的审批信息必须可审计。
