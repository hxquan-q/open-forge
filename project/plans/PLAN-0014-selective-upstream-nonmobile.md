---
id: PLAN-0014
type: plan
status: in_progress
priority: P1
owner: coordinator
source: user-request; openvetta/open-vetta@071ed323c
created: 2026-10-02
updated: 2026-10-02
related_requirement: [REQ-0008]
related_plan: [PLAN-0002, PLAN-0010, PLAN-0012, PLAN-0013]
related_tasks: [TASK-0169, TASK-0166, TASK-0167, TASK-0168, TASK-0148, TASK-0149, TASK-0150, TASK-0151, TASK-0152, TASK-0153, TASK-0154, TASK-0155, TASK-0156, TASK-0157, TASK-0158, TASK-0159, TASK-0160, TASK-0161, TASK-0162, TASK-0163, TASK-0170, TASK-0171, TASK-0172, TASK-0173, TASK-0174, TASK-0175, TASK-0177, TASK-0178]
---
<!-- Copyright The Open Forge contributors. -->

# 非手机上游更新的选择性适配

## 目标与固定证据

用户授权：除手机远程协作以外，结合现有修改择优适配，并按 Task 实施。对照固定为上游 dev `071ed323cda92cd7c1c37122b9ad68b3d642cfc5`（0.5.61 开发中）、main `a2d314a8521aa438c78dd51ed18c9e523a2cfab9`（已发布 0.5.60）；本仓共同祖先 `d217984c72ef7b5f66ce0a6fea1ae2375060d425`。稳定目标记录在 [REQ-0008](../requirements/REQ-0008-selective-upstream-nonmobile.md)；实施仍以本计划的择优矩阵为准。

不做整仓 merge、文件覆盖或整批 cherry-pick。提交号仅用于定位原意，每个 Task 都先对照 HEAD 与工作树、复现目标行为，再按本仓接口实施；祖先关系不代表本仓没有等价功能。

## 保护合同与取舍

- [VERIFY-0013](../verification/VERIFY-0013-upstream-protected-worktree.md) 固定 TASK-0147 新增主机 WIP；先完成验证基线，不回退、不删除、不夹带提交。
- 原子写保留 `asyncWriteTails` 的同路径队列与唯一临时路径（本仓 `a771f6c1f`）；上游只有占用重试，整文件替换会回退当前并发合同。
- MCP 保留 TASK-0053/0054 的空闲回收、延迟启动与工具目录缓存；作用域复用必须与之组合，不引入第二个生命周期所有者。
- 会话投影保留本仓窗口化历史、TranscriptItemSpan、缓冲限额、归档/恢复和重试预算；只补正在运行 turn 的身份接续。
- Team 接 PLAN-0013，保留让出/唤醒、审批、去重和阶段进度；目标模式接 PLAN-0012，不另建无人值守状态机。
- 保留 Open Forge 独立版本 0.1.3、品牌/分发档、凭据身份、状态目录、插件公开合同与发布权限。
- 保留仓库工程规则与质量门禁。拒绝上游移除 Expo、删除 UI 设计规则、削减平台验收/检查等无关变更；手机通知/配对/P2P/中继/远程桌面/移动端完全排除，混合提交只取非手机依赖片段。
- 不自动删除项目目录操作等既有用户功能。破坏性动作的产品语义若必须改变，单独说明并确认。
- 不直接引入上游发布端点、签名/制品上传和 desktop-promote；本批只适配本地质量/沙盒完整性，发布策略迁移另行授权。

## 任务与依赖

| Task | 完整行为切片 | 上游证据（短 SHA） | 前置任务 |
|---|---|---|---|
| [TASK-0148](../tasks/TASK-0148-upstream-validation-baseline.md) | 验证入口与 Windows 并发适配 | 46df74190, 197a7645c | 无 |
| [TASK-0149](../tasks/TASK-0149-anthropic-gateway-thinking-compat.md) | Anthropic 兼容网关思考块校验 | 6a325e8b4 | 无 |
| [TASK-0150](../tasks/TASK-0150-atomic-write-lock-retry.md) | 原子写入占用重试与 fork 队列保留 | b936056f7, 93bfc01ad（仅 toolkit 增量） | 无 |
| [TASK-0151](../tasks/TASK-0151-desktop-config-transactions.md) | 桌面配置串行事务适配 | 93bfc01ad | TASK-0150 |
| [TASK-0152](../tasks/TASK-0152-reopened-turn-projection.md) | 恢复运行中会话的回复段身份 | 04ac47b67, 89f270e56, 2d744ff4a | TASK-0148 |
| [TASK-0153](../tasks/TASK-0153-ssh-selective-transport.md) | SSH 进程组取消适配（回环另拆 TASK-0168） | 896d80696 | 源码无；集成在 TASK-0148 后 |
| [TASK-0154](../tasks/TASK-0154-resource-mcp-team-startup.md) | 资源准备、MCP 作用域与团队首轮优化 | 027fba36a, d04645196, 887017560, fb5fb060d, 3f8ec3161 | TASK-0148 |
| [TASK-0155](../tasks/TASK-0155-prompt-precedence-adaptation.md) | 模式、人设、项目说明提示词适配 | fcde2f517 | TASK-0154 |
| [TASK-0156](../tasks/TASK-0156-session-goal-mode.md) | 持久化目标模式与输入栏适配 | 4f7cb6199, 685427410, b7b5e0b9f, 42c8a4c82 | TASK-0152, TASK-0155 |
| [TASK-0157](../tasks/TASK-0157-markdown-rich-content.md) | 富 Markdown 与批注能力适配 | ed8b1af40, a8029e94f, 093ce834b, 089a91a76 | TASK-0148 |
| [TASK-0158](../tasks/TASK-0158-scripts-panel-remote-discovery.md) | 脚本面板与远端文件名筛选 | 8c6872ac8, bb3a23ef8, 7a7af9cea, 1e7071c0e, 7fdc02a06, 7910ce57f | TASK-0153, TASK-0148 |
| [TASK-0159](../tasks/TASK-0159-windows-sandbox-packaging.md) | Windows 沙盒制品完整性适配 | f174cf914, cca02889c, 34a350058 | TASK-0148 |
| [TASK-0160](../tasks/TASK-0160-desktop-project-productivity.md) | Git 与项目工具体验适配 | 2dd10fc5b, d9cc3e003, b41710a19, b530b02ae, 2543c5aec, c496fb60d, 8ad2abdcb | TASK-0148 |
| [TASK-0161](../tasks/TASK-0161-desktop-notification-preferences.md) | Agent 通知与提示音适配 | 1794ef9db, 0afb42331 | TASK-0151 |
| [TASK-0162](../tasks/TASK-0162-knowledge-prompt-source.md) | 知识库加工提示词来源适配 | c419c6ef7 | 无 |

| [TASK-0163](../tasks/TASK-0163-model-input-modality.md) | 模型输入模态与工具结果图片 | 8b1ed7b2e | TASK-0149 |

各 Task 状态以 frontmatter 为准。较大 Task 内的子能力逐片 red/green，不先写完所有代码；开工前重新核对消费者，不把路径前缀视为无限清理授权。发现已有等价或更强实现时记录 retain/skip 理由，不制造无意义 diff。

## 顺序与并发

条件支持并发，但本轮没有多 Agent 授权，实际串行。在同一工作区不并发写。先 0148 验证基线，再 0149/0150/0162 小修复，继而 0152/0153；0151 配置事务先于通知，MCP/资源与 Prompt 先于目标模式，SSH 筛选先于脚本面板。较大 UI/安全能力逐个开工，不批量覆盖。

未来若获多 Agent 授权，0149（ai）、0150（toolkit）、0153（ssh runner）可用独立 Task Worktree 并行；配置/Prompt/目标/会话 UI 热文件与 release notes 串行集成，Worker 不推共享分支。当前主工作区不干净，禁止分支合并；只提交验证通过且路径归属清楚的原子 Task。

## 验证与回滚

每片优先 fixture/loopback/组件真实接线；运行 Node runner、test:impact（需要时 test:changed）与完整 check。上轮 Desktop 全量存在条件相关超时，0148 对资源并发做可验证适配，不删除/跳过用例、不放宽超时。真实 Provider、用户运行实例和真实 SSH 主机不用于测试。

源代码采用最小适配补丁，不改已发布 Vetta 文案。本仓当前开发版 release notes 按任务追加。回滚按原子提交，在同一功能合同内回退；配置/协议新增先定义旧数据路径，不能依赖回滚数据库。

## 完成与未完成

本计划不是“全部已实现”的声明。工程门禁、原子提交/集成、人工接受与发布分开记录；Task 建立本身不算完成。当前 UI 实机与真实模型验收未授权；源码/fixture 验证不能替代模型质量结论。

## 明确保留而非同步的非手机项

纯装饰性布局、侧栏头像/滚动速度等视觉微调不作为整页重做授权；按本仓 DESIGN.md 保留现有视觉，仅在相关 Task 中证明改善再引入。Apple App 内置插件移出市场、发布流程减门禁与版本号切换不照搬。模型模态过滤单独归 TASK-0163，不混进缺签名补丁。

## SSH 专项续接（2026-10-02）

本次仅继续 SSH 相关，不将全计划其他领域自动作为本轮范围。TASK-0153 先移植并改进本地进程组取消，保留 Windows ssh2、认证降级、helper 品牌和 TASK-0147 WIP；独立工作树与显式单 worker 使其源码实施不必等待 0148，最终集成仍在质量基线之后。d643c881f 的共享夹具拆至 TASK-0168，避免整文件覆盖本仓 setsid 与 ssh2 语义。

- [TASK-0169](../tasks/TASK-0169-ssh-connection-lifecycle.md)：SSH 配置失效与实时连接状态。
- [TASK-0166](../tasks/TASK-0166-ssh-helper-recovery-measurement.md)：SSH helper 可恢复失败与首次可用测量。
- [TASK-0167](../tasks/TASK-0167-ssh-remote-file-filtering.md)：远端文件名筛选与完整调用链接线。
- [TASK-0168](../tasks/TASK-0168-ssh-windows-loopback-parity.md)：Windows SSH 回环夹具与 Desktop 流程适配。

远端筛选从 TASK-0158 拆至 TASK-0167；0158 保留脚本面板消费范围并等待筛选合同，二者不重复写底层。连接生命周期与恢复先用隔离测试建立基线，不以调大超时、弱化认证或自动重放命令替代修复。

### 验证发现的独立前置项

[TASK-0170](../tasks/TASK-0170-cli-process-test-isolation.md) / BUG-0059：CLI 进程测试调度隔离，是 TASK-0162 的工程门禁前置；不扩大手机或产品协议范围。

## 首批隔离阶段历史记录

TASK-0148（1020b7c59）、0149（7a2a5ce50）、0150（222de8813）、0163（3dda219e9）与验证前置 0170（769f31bc3）已产生各自独立提交；不等于已合入主树。TASK-0162 已完成隔离工程验证并提交 6cb373dde。SSH 专项由其他执行流接手，继续以其 Task 状态为准，本执行流不重复写入。主工作区仍有多个所有者的 WIP，禁止整体覆盖或夹带集成。

### 本阶段结论

共形成 0148、0149、0150、0162、0163、0170 六个隔离提交。功能 Task 保持 verifying 等待集成/用户接受；测试基础设施 Task 的 done 仅表示其内部工程合同完成。主树仍有其他所有者的修改，没有做 merge/push，不宣称整批计划完成。下一批按既有依赖推进配置事务、会话恢复投影、MCP/资源与团队初始化，再进入提示词/目标模式和剩余 UI 能力。

## 集成后的当前状态与后续队列（2026-10-02）

上述“主树 WIP / 尚未 merge”的内容是隔离阶段历史；TASK-0171 已将七个分支与主树候选集成并推送 origin/dev，最新交付 c8dc167f0。不能继续把这些工程依赖当作未集成，功能人工接受仍以各 Task 的 verifying 为准，整份计划仍 in_progress。

本轮用户仅要求继续审查并建立 Task：见 [RESEARCH-0019](../research/RESEARCH-0019-post-integration-optimization-audit.md)。优先 TASK-0178 撤销主机密钥拒绝、TASK-0175 原子写入完整性、已有 TASK-0169 的失效代次；再收口 TASK-0173 的偶发诊断、0168→0174 平台测试注册。TASK-0177 只更新当前平台文档，不改变协议。通用验证成本研究 TASK-0176 不属于上游功能移植。

这些是新规划/旧合同细化，不是新增实施授权；配置事务、会话投影、MCP/资源、提示词/目标模式和其他 UI 草案继续保留，不标记完成，不扩大手机/发布范围。

## 2026-10-03 最新增量的首批实施

固定最新上游 dev 为 26048167cdf59b332678d693463bceb7bad5232c，研究见 [RESEARCH-0022](../research/RESEARCH-0022-upstream-nonmobile-gap-audit.md)。用户授权一个专用工作树，内部串行执行；TASK-0187 为集成记录，0188–0193 与既有 0151 分别负责 usage 引用、工具阶段、恢复终态、滚动记忆、dev 缓存、Git 路径及配置事务。每片独立红绿测试与提交，最终通过影响面测试和完整检查后由 Coordinator 按本次明确授权先推 dev 再集成 main，不允许 force 或夹带其他工作。

目标模式、富内容/批注、MCP 应用作用域、feed/attach 迁移、沙盒制品来源和其他产品扩展仍属原任务队列，不标为本批已完成。
