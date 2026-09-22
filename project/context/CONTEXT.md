# Open Forge Project Context

## 产品

Open Forge/Open Vetta 是 local-first Desktop AI Agent 客户端，第一阶段包含 `work` 和 `coding` 两个入口，共享 Runtime、Session、TurnPipeline、Snapshot、Task、Artifact 和权限基础设施。

## 架构不变量

- 不创建第二套 Agent Loop、Session、Task Runner 或 Storage 事实源；
- Task 是已有 Session/Turn 的产品工作流投影；
- Artifact 文件内容是事实源，descriptor/event 是可重建索引；
- Approval 是 Runtime 状态，不是 Renderer 临时状态；
- Tool `content` 面向模型，`details` 面向 UI/Host；
- 动态 Tool/MCP/Skill/Plugin/Prompt 在 Turn generation 中冻结，更新下一 Turn 生效；
- Pi 只能通过 `TurnEnginePort` Adapter 评估。

## 当前管理规则

- 新二开管理文件写入 `project/`；
- `exprot/` 只作为历史研究归档；
- 架构决策正文写入 `docs/adr/`；
- Requirement → Plan → Task → Verification → Release Notes；
- Bug 必须有复现或证据、回归测试和验证记录；
- 任何新结论都必须绑定源码、类型、测试、日志或第一方资料。

## 当前重点

1. Provider 流协议和 Session 终态；
2. 取消、deadline、Compaction 和 Agent Team 长尾；
3. Main/Renderer/GPU/Heap/队列性能观测；
4. 长会话内存和历史读取边界；
5. Task/Artifact/Permission/Approval 合同；
6. Open Forge 品牌化决策冻结。
