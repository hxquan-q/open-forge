# Open Forge 二开架构与源码分析

> 目标仓库：`C:\Users\xquan\Desktop\open-forge`
>
> 本目录保存从 `open-vetta-main` 同步的源码分析、当前会话记忆，以及面向本地桌面 `work/coding` 双模式产品的实施规划。当前已补充性能/可靠性调研记录，并完成星轨装饰球生产路径下线；未运行真实 Provider、没有提交 Git。

## 文档索引

### 既有源码分析

| 文档 | 内容 |
|---|---|
| [architecture-overview.md](architecture-overview.md) | 五层架构、三级能力编译、控制面/数据面、事件溯源、生命周期与多宿主 |
| [agent-loop.md](agent-loop.md) | Gen A/Gen B Agent Loop、TurnPipeline、Runtime Engine 桥接 |
| [composition.md](composition.md) | coding-agent Composition、Session 初始化事务、ModelCallFrame 编译 |
| [runtime-subsystems.md](runtime-subsystems.md) | MCP、Subagent、Capability、Agent Team |
| [secondary-development.md](secondary-development.md) | 技术栈、Desktop IPC、Plugin/Skill/Theme/MCP、持久化、RPC、二开入口 |
| [kernel-replacement-feasibility.md](kernel-replacement-feasibility.md) | pi/dsh 与 Open Vetta 的内核替换评估 |
| [previous-analysis.md](previous-analysis.md) | 前置分析主题、来源目录和本次规划的衔接说明 |

### 当前会话与实施规划

| 文档 | 内容 |
|---|---|
| [session-memory.md](session-memory.md) | 历史分析结论、已确认产品决策、当前工作边界和后续上下文 |
| [mvp-scope.md](mvp-scope.md) | 本地 Desktop `work/coding` MVP 范围、用户流程、排除项和验收标准 |
| [core-contracts.md](core-contracts.md) | Task、Artifact、风险、权限、审批合同的 TypeScript 草案 |
| [runtime-mapping.md](runtime-mapping.md) | Task/Artifact 如何映射到 Session、TurnPipeline、Snapshot 和 Repository |
| [data-layout-and-migration.md](data-layout-and-migration.md) | `.vetta/`、`.vetta-local/`、全局目录和迁移约定 |
| [ui-information-architecture.md](ui-information-architecture.md) | Desktop Chat/Task/Artifact/Approval/Coding 面板信息架构 |
| [differential-testing-observability.md](differential-testing-observability.md) | 行为合同测试、未来 Pi Adapter 差分门禁和观测基线 |
| [implementation-plan.md](implementation-plan.md) | 分阶段实施顺序、所有权、验证和升级信号 |

## 当前共识

```text
Desktop local-first product
  ├── work: 文档、文件批处理、研究/知识库、数据分析
  └── coding: 代码、Git、Shell、测试、MCP
        ↓
Task + Artifact + Permission + Review
        ↓
RuntimeHost + Session + TurnPipeline + Snapshot
        ↓
Vetta Agent Engine + @vetta/ai
```

- 文件、Tool 和 Session 执行留在本地；允许调用远程 LLM API；暂不做云端执行。
- `work` 与 `coding` 是独立 Agent Profile/入口，共享 Runtime、Task、Artifact 和权限基础设施。
- Pi 暂不作为生产内核；当前保留 Vetta Engine，未来只有出现明确能力缺口时才通过 `TurnEnginePort` Adapter 评估 Pi。
- 企业控制面、SSO、审计云、远程执行和多租户 SaaS 暂不进入当前 MVP。
