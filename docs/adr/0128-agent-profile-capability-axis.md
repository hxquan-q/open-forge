# ADR-0128：WorkspaceMode、agentMode 与 agentProfileId 三轴分离

## 状态

已接受（ISSUE-0005 于 2026-09-23 裁决采用方案 C）

## 背景

历史 MVP（`exprot/mvp-scope.md`）把 Work/Coding 描述为拥有独立 Profile、Prompt、
Tool Catalog 与 Memory 的两个入口。ADR-0071 已裁决 `agentMode` 只是任务解释的提示词
偏向，禁止对能力面做硬过滤。TASK-0023/0024 又引入了按项目保存的 `WorkspaceMode`，
它只切换界面布局、不重建当前 Session。三个"模式"若共用一个字段，会出现布局与
Agent 行为不一致、或把界面偏好误当安全边界的问题（ISSUE-0005）。

## 决策

1. 三轴分层，各自独立持久化、互不改写：
   - `WorkspaceMode`（项目级）：只决定项目界面布局（Work 工作面板 / Coding 界面），
     切换不中断、不重配任何运行中的 Session；
   - `agentMode`（会话级，创建时固化）：保持 ADR-0071 的提示词偏向，不改变能力面；
   - `agentProfileId`（会话级，创建时固化）：能力**默认值**轴——决定新会话的默认
     工具集合与 Memory 默认开关，由 `packages/coding-agent/src/profiles/agent-profiles.ts`
     定义内置 `work` / `coding` 两档。
2. Profile 只是默认，不是边界：用户或项目配置的显式工具选择永远优先
   （`applyAgentProfileDefaults` 只在无显式选择时应用默认子集）；不按模式隐藏
   Tool/Skill/Plugin/MCP，ADR-0071 语义保持不变。
3. 能力可见性不替代执行授权：无论哪个 Profile，写入、网络、Shell 等副作用的放行
   一律走 Tool Policy 与 Approval（TASK-0016 的 L0-L4 逐次审批与 Project Trust）。
   Prompt 与 Profile 都不是权限边界。
4. 新 Session 从当前工作区选择派生默认 Profile（Work 布局 → 默认 `work` Profile），
   由 Desktop 在创建会话时传入；已创建的 Session 保留自己的 Profile，切换布局不
   静默重配。

## 备选方案

- 单字段同时控制布局、Prompt、工具与 Memory：被否决——直接推翻 ADR-0071，且把
  体验偏好与安全边界耦合，隐藏工具会被误当授权。
- 只保留布局与提示词两层（方案 B）：被否决——无法表达 Work/Coding 不同的默认
  工具与 Memory 承诺，需要先修订 REQ-0001。

## 后果与边界

`work` Profile 默认不含 `bash`/`shell`（用户可显式开启）；执行授权不受 Profile
影响。三轴各自演进时（如新增 Profile 档位）只需扩展 Profile 注册表，不触碰
ADR-0071 的模式合同与 TASK-0016 的审批链路。
