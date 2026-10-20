---
id: TASK-0330
type: task
status: verifying
priority: P1
owner: scripts/agents; project/agent-workflow
requirement: REQ-0019
plan: PLAN-0019
source: user-request; open-forge-autonomous-dev-plan-v2.md; Magpie engineering review
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0325, TASK-0326, TASK-0327, TASK-0328, TASK-0329]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（readiness 文档与配置入口串行）
base_commit: 6c5e94d09
read_paths: [scripts/agents, schemas/agents, project, docs/dev/agent-rules, AGENTS.md]
write_paths: [scripts/agents/doctor.mjs, scripts/agents/cli.mjs, scripts/agents/doctor.test.mjs, scripts/agents/cli.test.mjs, project/tasks/TASK-0328-ui-runtime-verification.md, project/tasks/TASK-0329-readonly-signal-collection.md, project/tasks/TASK-0330-external-environment-readiness.md, project/tasks/README.md, project/plans/PLAN-0019-autonomous-development.md, project/verification/VERIFY-0019-autonomous-development-audit.md, scripts/agents/README.md, docs/dev/agent-rules/autonomy.md, .github/release-notes/v0.1.3.md, scripts/agents/execution-proof-fixture.mjs, scripts/agents/runner.mjs, scripts/agents/runner.test.mjs, scripts/agents/verify.mjs, docs/adr/0146-repository-autonomy-controller.md]
exclusive_paths: [scripts/agents/doctor.mjs]
depends_on: [TASK-0325, TASK-0326, TASK-0327, TASK-0328]
conflicts_with: [TASK-0322, TASK-0323, TASK-0324, TASK-0325, TASK-0326, TASK-0327, TASK-0328, TASK-0329]
integration_status: integrated
created: 2026-10-20
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 外部环境 Readiness 与真实 L4 闸门

## 2026-10-20 用户决策与本轮范围

- 用户选定现有 WSL2 作为当前执行环境，不要求新增机器或 Windows VM；真实 CI 等账号额度恢复后运行，真实 UI 验收也延后。本轮仅更新现有计划与环境合同，不实施 readiness、不启用模型或发布器。
- 续接 [PLAN-0019](../plans/PLAN-0019-autonomous-development.md) 的实施顺序与验收矩阵；将既有 TASK-0328/0329 合同补入同批规划记录并注明验收延期，核对任务索引。目标仍是完整 L4，软件完成、本地真实模型运行、跨平台/UI 验收和生产发布分别取证。延期不是跳过、豁免或通过。
- 当前 Windows 会话只读运行 `wsl.exe --list --verbose` 和 `wsl.exe --status`，退出码均为 1；正确解码后的信息为“未安装适用于 Linux 的 Windows 子系统”。这是当前会话所在机器的事实，不推断用户其他环境不存在 WSL2。WSL2 可用性、Linux 工具链与仓库副本尚未核验。
- readiness 要分别报告本地软件检查、真实模型执行和完整发布的条件，不能因远端 CI 延期阻止编写/测试代码，也不能因本地测试通过放行缺失的 UI 检查或发布检查。WSL2 的 Linux 能力不代表 Windows Worker 或已证明的安全沙箱。
- 当前隔离规则要求仍有效：无经过验证的执行边界时，自动模型执行保持关闭。将来若在 WSL2 上部署控制器/Worker，须证明 OS 身份、文件权限、凭据和进程回收边界；仅分目录、分发行版或关闭自动挂载不算证明。本轮不修改这些规则。
- 测试与验收：本轮核对文档路径、Task/Plan 索引、工作区差异和发布说明；不启动 CI/UI，不安装 WSL，不调用真实模型，不改 `project/autonomy-policy.json`。原有“工程待实施”结论保留。

## 目标

### 本次实施合同（2026-10-20）

用户已要求实施环境检查；外部问题采集先搁置，因此移除 TASK-0329 的执行依赖。WSL2 后续预检已确认 Ubuntu-26.04 Running / Version 2，可进入 Linux，初始工具仅 Git，Bun/Node 待准备。实现 doctor 的固定、只读工具探测和分项 readiness，分别报告本地软件、模型与完整发布条件；不得把 isolation 声明或配置文件当作 OS 证明。CLI 保持默认只读，不调用 adapter.doctorCommand（配置命令可能有副作用）；状态目录尚未初始化时不得创建它。现有真实模型入口必须拒绝缺失的可信隔离证明。测试覆盖正常工具、缺失工具、同家族评审、未授权和延期项目，使用临时状态与进程，付费 API、CI/UI/发布不运行。

把“配置存在”与“真实可执行”分开。实现只读 readiness 检查，逐项证明实现模型、异家族独立评审、隔离 runner/VM、UI 浏览器、CI、签名/发布、遥测与清理服务是否真正就绪；任何缺项都明确阻止真实自主执行和 L4 宣称。配置字符串、doctor 成功或模拟回执不能替代外部事实。

## 范围

### 并发评估

- 结论：不支持并行写入
- 执行方式：serial
- 可并行 Task：无；共享配置与 doctor 入口
- 前置依赖：TASK-0325–0329
- 冲突文件/独占路径：见 frontmatter
- Branch：`main`
- Worktree：无；串行
- 集成负责人：当前 Agent
- 集成顺序：schema → doctor → CLI → 真实演练（外部条件满足时）

### 做

- 设计只读 readiness 输出：每项状态 `proven|failed|not-run|unavailable`、原因、证据摘要和恢复动作；不返回凭据值。
- 检查已启用 adapter 的可执行文件、角色、模型、隔离声明与独立家族；检查 runner 的实际隔离证明文件和 UI 引擎/浏览器状态。
- 合并现有 doctor 与配置校验，提供 `doctor --readiness` 或等价公开入口；默认只读、不启动模型、不发布。
- 实现时选择已有 `doctor` 默认输出分项 readiness，不新增重复布尔参数；执行边界由独立状态目录的可信 Ed25519 外部证明校验，合成测试签名仅用于测试。关联的 runner/verify 入口和测试夹具随合同接线，共享路径串行修改。
- 让控制器在真实执行前检查 readiness；仅 software contract 测试可以绕过，并在 evidence `notRun` 中保留。
- 测试各项缺失、过期证据、伪造“已证明”、策略等级与真实外部状态分离。

### 不做

- 不购买服务、不启动付费模型、不读取真实私钥、不修改 CI 预算或发布。
- 不把本机路径/配置字符串、模拟签名或 pytest-green 当 sandbox/CI/生产证据。
- 不自动提升 policy.level；L4 只在全部外部验收证据齐备后由操作者显式升级。

## Given / When / Then

- Given 仅配置了 model id 与 command，When readiness，Then 对应项仍为 `not-run`/`unavailable`，不显示 ready。
- Given 两个已启用 adapter 属于同一家族，When readiness，Then 独立评审项失败，真实执行拒绝。
- Given runner 未提供隔离证明或 UI 浏览器缺失，When readiness，Then 对应项阻断，doctor 总结明确。
- Given 所有必需项有真实、未过期的证据，When doctor，Then 可显示 software ready，但发布仍要求独立授权；不自动改 level 或推送/发布。

## 必须保持

readiness 只读、凭据最小暴露、配置校验不冒充真实证明、人为闸门、策略升级显式、发布授权不变；当前 level=0 和默认 disabled 保持，直到真实环境与证据满足。

## 测试与验证

- 定向：`bun scripts/quality/run-vitest.mjs --run scripts/agents/doctor.test.mjs scripts/agents/cli.test.mjs`
- 用户流程：公开 doctor 展示每项状态、原因与未执行项；缺任一关键能力时退出/标记为不可真实运行。
- 质量检查：`bun run check:quick` 后完整 `bun run check`。

## 验收分层

- 工程验证：分项检查、可信证明拒绝/有效期/绑定与调用接线已验证；WSL2 控制器 107 例、Windows 质量 635 例及完整 check 通过。实际 OS 隔离部署与模型质量尚未验收。
- 技术评审：当前 Agent 自审；独立模型未配置。
- 集成：已随 `a2e846e70` 原子提交到本地 main；未 push，实际部署条件仍未验收。
- 人工功能验收：待验收。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：本机只读 doctor，不启用 adapter、不启动 UI。
- 操作步骤或 AI 任务输入：检查模型、评审、runner、浏览器、CI、签名、遥测、清理。
- 预期行为与最终产物：每项有状态/原因/证据摘要；未满足项阻断真实执行。
- 不通过表现与已知限制：doctor 绿、配置文件存在或模拟回执被当成真实隔离/发布证明均不接受。
- 验收反馈及回归案例：待收集。

## 交付记录

- 实际修改：doctor 增加固定工具只读探测、software/execution/release 分项及模型质量未运行项；真实 adapter 执行和验证前核验受信外部签名、仓库/策略/执行器绑定及最长 15 分钟有效期。不提供生产签发接口，测试夹具只在临时目录生成合成签名。当前实现落在 doctor/cli/runner/verify 及相应测试，不改变 policy.level 或启用 adapter。
- 实际运行：先前仅规划的检查保留为历史记录；本次已在 WSL2 的专用验证副本运行控制器、真实临时 Git 与进程合同测试，详细最终数字与完整检查见 VERIFY-0019。Ubuntu-26.04 已可用，Linux Bun/Node 位于任务临时目录；未调用真实模型。
- 未运行及原因：用户已明确没有隔离 VM/runner、实现与独立评审模型、签名/监控环境；未读取任何凭据值。
- Worktree：main 串行。
- 剩余风险：readiness 只能反映实际可核验事实，不会替你创建外部基础设施。
