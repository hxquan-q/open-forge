# 本地 Desktop MVP 范围

## 1. 产品目标

构建一个本地优先的桌面 AI Agent 工作台，提供两个独立入口：

- `work`：文档工作、文件批处理、研究/知识库、数据分析。
- `coding`：代码读取和修改、Git、Shell、测试、MCP。

两种模式共享 Runtime、Task、Artifact、Permission、Review 和模型 Provider，但拥有独立 Profile、Prompt、Tool Catalog、Memory 和 UI 面板。

## 2. MVP 必须交付

### 2.1 统一运行骨架

- 复用 `RuntimeHost`、`AgentSession`、`TurnPipeline`、`RuntimeSnapshot`。
- 简单请求走 Conversation。
- 多步骤请求升级为 Task。
- Task 状态由固定状态机控制，Agent 只能提出转换建议。
- 每个 Turn 使用不可变 Snapshot generation。
- 取消、失败、恢复和关闭沿现有 `AbortSignal`/生命周期合同传播。

### 2.2 work 模式

第一阶段支持四类入口：

1. 文档：总结、改写、翻译、报告、会议纪要。
2. 文件批处理：分类、重命名、提取、转换、合并。
3. 研究/知识库：本地资料检索、引用、来源整理。
4. 数据分析：CSV/Excel/JSON 清洗、统计、图表和报告。

先通过主 Agent + Skill/专家能力实现；复杂任务可使用 Subagent，不为每个领域创建独立 Runtime。

### 2.3 coding 模式

- 文件树和项目上下文。
- Read/Search/Glob 等只读 Tool。
- Write/Edit 生成 Diff。
- Git 状态和测试结果。
- Shell、网络和 MCP 通过 Permission/Approval 控制。
- Project Trust 后可减少低风险重复审批，但 L4 操作仍然需要确认。

### 2.4 Artifact

第一阶段类型：

- `document`
- `dataset`
- `analysis`
- `code-change`
- `execution-result`
- `research-evidence`
- `bundle`

文件内容是事实源；Conversation/Runtime Event Log 保存 Artifact 生成、版本、来源、验证和引用关系。

### 2.5 权限和 Review

- `work` 默认 Balanced。
- `coding` 默认 Balanced，用户明确授予 Project Trust 后进入 Trusted Project。
- Task Review：审计划。
- Execution Approval：审高风险 Tool。
- Artifact Review：审最终产物。
- 自动重试只对可识别、有限、幂等的错误启用。
- 外部副作用失败时记录事实，不假设可自动回滚。

## 3. MVP 明确排除

- 云端 Tool/代码执行。
- 企业控制面、SSO、组织策略和云端审计。
- 多租户 SaaS。
- 云端 Session/Memory/文件同步。
- Pi 作为生产默认内核。
- Pi 全套 Harness 或 Pi Extension 兼容层。
- 实时团队协作和远程 Task 调度。
- 默认自动上传源码、文件或完整对话。

## 4. 用户验收流程

### work：文件处理到交付

```text
选择 work
  → 输入自然语言目标
  → Agent 形成 Task Plan
  → 用户确认计划（必要时）
  → 读取/分析本地资料
  → 生成 Document/Dataset/Analysis Artifact
  → 预览和 Review
  → 保存到用户指定目录
```

### coding：代码修改到验证

```text
选择 coding
  → 选择项目
  → 读取项目上下文
  → Agent 形成 Plan
  → 用户确认高风险范围
  → 读取/修改文件并生成 Diff
  → 运行测试或检查
  → 展示 Diff、Tool Trace、Test Result
  → 用户接受或要求修改
```

## 5. 完成标准

- 既有 Conversation/Turn 行为不回归。
- Task 不拥有第二套 Session/Turn 执行循环。
- Artifact 不把 UI-only details 注入模型 content。
- Tool Policy 在模型请求前和 Tool 执行前都有效。
- Project Trust 可撤销、可过期、可按 scope 限制。
- 取消、失败、恢复和重启后状态可由事件重建。
- work/coding 的 Tool Catalog 不会互相静默扩大。
