---
id: ISSUE-0017
type: issue
status: draft
priority: P3
owner: packages/runtime-node/packages/capability-runtime
requirement: []
plan: []
source: RESEARCH-0010（PI-Desktop Rust host-core 特权下沉模型对照）
created: 2026-09-24
updated: 2026-09-24
related_tasks: []
depends_on: [RESEARCH-0010]
---
<!-- Copyright The Open Forge contributors. -->

# 特权执行宿主下沉评估（Rust / 强隔离子进程）

## 背景与已知事实

- RESEARCH-0010 §1 证实：PI-Desktop 三层隔离——React renderer 无特权、Node sidecar 只跑 agent loop 无系统 I/O、Rust host-core 独占文件工具/Bash/工作区沙箱/权限网关/SQLite/secrets。其最强性质：**`ToolsExecuteParams` 没有 workspace 字段**——sidecar 被 prompt injection 也无法指定根目录，workspace 由宿主从 session 持久 `project_path` 解析；路径解析双层防御（词法 `..` 归一 + deepest-ancestor canonicalize + dangling-link ≤32 跳），越界即 `PATH_OUTSIDE_WORKSPACE`。
- 本仓库现状：`packages/runtime-node/src/sandbox/` 已有 `workspace-path-access.ts`（realpath 边界检查、`..`/软链接/`~` 展开、Windows 大小写归一）+ `sandbox-permissions.ts` + `node-sandbox-host.ts`——**语义等价但运行在同一 Node 进程同一特权级**，隔离靠代码纪律而非进程/语言边界。
- 长期价值场景：外部非可信插件生态扩大、向跨平台原生微内核演进、或出现需要强隔离保证的安全事件。

## 未决问题

1. 隔离边界形态：Rust sidecar（对齐 PI）、沙箱化子进程（`utilityProcess`/受限 worker）、还是维持同进程但把合同固化到 capability 层？
2. 迁移面：`runtime-node` 的文件/进程/网络所有权如何逐片下沉而不打断现有工具合同；会话绑定 workspace 解析（参数面去除 workspace 字段）能否先在 TS 层落地。
3. secrets：是否随下沉引入加密文件库（PI 的 AES-256-GCM + machine-key）或 OS keychain。
4. 触发门槛：什么信号证明隔离收益 > 迁移成本。

## 候选方案及取舍

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A 维持现状 + 合同加固（推荐先行） | 把 session-bound workspace 解析、tool admission budget、权限评估顺序先在 TS/capability 层固化成可测合同；零架构变更 | 隔离强度不变（同进程） | prompt injection 突破的是逻辑不是边界 |
| B 沙箱化子进程宿主 | 进程级隔离，不引新语言 | IPC 面设计、生命周期/恢复语义重做 | 工程量中等但每类资源都要重接 |
| C Rust host-core（对齐 PI） | 最强边界（PI 已证收益真实）；可复用其设计 | 引入 Rust 工具链与全量工具面重写；架构级变更 | 周期长、双实现过渡期回归风险高 |

## 推荐方案

先 A（方向性必做且独立于最终形态）：把「session 绑定 workspace 解析」「参数面不允许调用方指定特权根」「tool 准入预算」固化为 capability-runtime 合同 + 合同测试；B/C 等触发信号出现再评估，届时 A 的合同正好是迁移的目标规范。

## 决策触发条件

- 外部非可信插件（社区 marketplace 全量开放）进入计划；或
- 出现沙箱逃逸/权限绕过类 BUG 或安全评审结论；或
- 跨平台微内核演进正式立项。

## 后续可能拆出

- Task（A 的一部分）：工具调用参数面审计——确认 session/workspace 根只能由宿主解析、调用方不可注入（低成本，可独立做）；
- Plan：capability 合同化（workspace 解析、准入预算、权限评估顺序）→ 视信号再评 B/C。
