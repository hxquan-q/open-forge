---
id: TASK-0330
type: task
status: done
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
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 外部环境 Readiness 与真实 L4 闸门

## WSL 工作目录与基础环境准备（2026-10-20 续接）

- 用户明确要求在已安装的 WSL2 中准备正式开发目录和环境。本轮串行续接本 Task（Open-Forge-only），不改控制器行为、权限策略或适配器；既有软件已集成事实保留，新增环境交付单独取证。
- 输入：Windows 本地 main 已提交代码、根 packageManager/engines 与锁文件。输出：`/home/xquan/projects/open-forge` 独立 Git 副本、用户级 Linux Bun 1.3.14 与 Node 22、Linux 工作区依赖和可复用启动说明/验证日志。工作目录不存在才创建，不覆盖已有文件；不复制 Windows node_modules、未跟踪文件、Git 凭据、登录态或应用数据。
- 读写范围：读取 Windows 仓库已提交历史及依赖声明；写入 WSL 用户目录下本次新建的 projects/open-forge、.local 工具目录、缓存与环境说明，以及本 Task、任务索引和 VERIFY-0019。修改 shell 环境时仅追加可识别的用户工具入口；保留原配置。不启用 Worker、模型、发布器或定时任务。
- Given 干净的 Linux 目标路径，When 从已提交 main 建独立副本并按锁文件安装，Then Git HEAD 可对照、Linux Bun/Node 可执行、锁文件不变且自主控制器定向测试与只读 doctor 能运行。Given 目标已存在，Then 先核对归属而不重置覆盖；安装失败保留日志与现场，报告未完成项。
- 验证：Git HEAD/status、工具版本/真实路径、冻结锁文件安装、仓库 Node runner 的控制器测试与 doctor；不构建或启动 Desktop，不运行真实 CI/UI/API，不将目录准备描述为 OS 沙箱验收。本轮仅环境与管理记录，无新增产品行为，不补镜像实现测试。
- 并发：serial，无子 Agent、无并行代码 Worktree；Windows main 只记账，WSL 副本独立 Git，未集成新代码前不承接产品开发。
- 回滚：保留现有 Windows 环境；仅本轮新建路径可在明确核实后单独移除，不自动执行删除。真实隔离和模型配置继续待验，CI/UI 继续延期。
- Linux 基础包：通过 Ubuntu 官方软件源补齐 build-essential、pkg-config、ripgrep、unzip、jq、ca-certificates、xz-utils，供原生依赖编译与日常检索；不运行系统升级、不安装 GUI 或改变 WSL 网络/挂载配置。与用户级工具安装串行执行，记录包安装结果。

### 本轮环境交付结果

- 已创建 `/home/xquan/projects/open-forge`，从 Windows 已提交 `main` 的 Git bundle 建立独立 Git 数据库，源代码基线 `20a88b57d09aa3147b030c754e9c70324f5b5b22`；未复制原工作区七个 temp 文件、Windows node_modules、Git 认证或应用数据。origin 使用仓库公开地址，未联网拉取或推送；仅从既有 Git 配置复制作者 name/email 到该副本 local 配置。
- 用户级工具：Bun 1.3.14、Node 22.23.3 官方 Linux x64 二进制，分别校验 GitHub release asset digest 与 Node 官方 SHASUMS256。位于 `~/.local/share/open-forge/toolchains`，经 `~/.config/open-forge/development.env` 加入 PATH；.profile/.bashrc 追加唯一入口，原文件备份保留在 setup 缓存。登录 shell 与交互 shell 均已实测解析到 Linux 二进制。
- 官方 Ubuntu 源基础包安装 exit 0；Git 2.53.0、rg/gcc/make/pkg-config/jq/unzip 均解析到 `/usr/bin`。`bun install --frozen-lockfile` exit 0：6192 packages / 97.51 秒，bun.lock/package.json 无变化，副本 Git status 为空。
- 在完整副本执行仓库 Node runner：20 文件 / 107 例通过，4.33 秒；未启动 UI。公开 `bun run agent:doctor` exit 0、readiness.software.ready=true、level=0、readyForModelExecution=false、publisherConfigured=false。Windows Task/Plan 索引和 324 Task 合同检查通过，无警告。
- 使用说明：`/home/xquan/.config/open-forge/WSL-DEVELOPMENT.md`；日志、下载摘要和 shell 备份：`/home/xquan/.cache/open-forge/setup-20261020`；apt 日志：`/tmp/open-forge-apt-{update,install}-20261020.log`。Windows 主工作区仅新增本轮管理记录，现有源码不变。
- 未运行：完整产品构建/全仓测试、真实 CI/UI/API、模型/Worker、签名/发布与 OS 隔离验收；Go/Kotlin/Android 与 GUI 工具链本轮未安装。原有 WSL localhost 代理提示保留，实际官方下载与官方源安装已成功，不擅改网络配置。实际模型与完整 L4 仍待后续部署验收。

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
- 人工验收（2026-10-21）：用户在会话中确认本批次验收完成，据用户结论闭合；批次记录见 TASK-0342。
