<!-- Copyright The Open Forge contributors. -->
# 自主研发执行工具

本目录服务于仓库开发协作，不属于产品 Runtime。完整范围与实际验收状态见 [PLAN-0019](../../project/plans/PLAN-0019-autonomous-development.md)。实现、独立评审、实际测试与集成/发布是不同事实，不能用前一项代替后一项。

## 权威入口

- [策略](../../project/autonomy-policy.json)：目标 L4，当前 level=0，模型与发布能力默认不启用。
- [执行器配置](../../project/agents.json)：示例默认 disabled，启用前固定实际可执行文件、模型与隔离方式。
- [JSON 合同](../../schemas/agents/)：边界采用闭合的 JSON Schema 子集；不支持的关键字报错，不静默略过约束。
- 任务继续使用 project/tasks；不增加 GOAL 状态机。运行进程、租约与尝试次数不写进 Task 心跳提交。

## 当前公开命令

```powershell
# 只读检查本地工具、配置和外部执行证明，不调用模型或启动 UI
node scripts/agents/cli.mjs doctor
node scripts/agents/cli.mjs queue

# 操作者指定独立、仅控制器可访问的状态目录；不要选真实用户状态目录
node scripts/agents/cli.mjs claim --task TASK-xxxx --holder <controller-id> --run-id <unique-id> --state-dir <controller-state>
node scripts/agents/cli.mjs prepare --run-id <unique-id> --test <test-file> --state-dir <controller-state>
# Coordinator 按既有入口把 Task / 索引推进到 in_progress 并准备已提交基线后，生成合同
node scripts/agents/cli.mjs plan --task TASK-xxxx --worktree <task-worktree> --test <test-file>
node scripts/agents/cli.mjs run --run-id <unique-id> --adapter <configured-adapter> --role implementer --contract <contract.json> --state-dir <controller-state>
node scripts/agents/cli.mjs run --run-id <unique-id> --adapter <independent-adapter> --role reviewer --contract <contract.json> --state-dir <controller-state>
node scripts/agents/cli.mjs verify --run-id <unique-id> --state-dir <controller-state>
node scripts/agents/cli.mjs evidence --run-id <unique-id> --state-dir <controller-state>
node scripts/agents/cli.mjs integration-preview --run-id <unique-id> --state-dir <controller-state>
# 对新的合并候选再次 review / verify 后，才能应用
node scripts/agents/cli.mjs integrate --run-id <unique-id> --state-dir <controller-state>
node scripts/agents/cli.mjs status --state-dir <controller-state>
node scripts/agents/cli.mjs pause --state-dir <controller-state>
node scripts/agents/cli.mjs resume --state-dir <controller-state>
node scripts/agents/cli.mjs release --run-id <unique-id> --state-dir <controller-state>
```

`doctor --state-dir <controller-state>` 分别返回 software、execution、release readiness；未提供状态目录时保持只读、不创建目录。只探测固定 `bun/node/git --version`，不会运行配置提供的任意 doctorCommand。配置启用不等于可启动：真实实现/评审和验证检查另需可信资源所有者签发的执行边界证明，模型语义质量仍单列 not-run。

执行证明位于仅控制器可访问的状态目录：`trusted-execution.json` 为 `{"version":1,"keys":[{"id":"owner","publicKey":"<Ed25519 PEM>"}]}`；`execution-proof.json` 为 `{keyId,payload,signature}`。payload 的闭合字段见 `doctor.mjs`：version=1、repository 为 Git common-dir 的规范绝对路径、policy/adapters 为配置 digest、issuedAt/expiresAt 毫秒时间（最长 15 分钟），以及 controllerProtected、credentialsProtected、gitProtected、processTreeCleanup=true 和 workerIdentity。签名为 payload canonical UTF-8 字节；签发者必须实际验证这些部署事实，私钥不能进入 Worker。控制器不提供签发命令；`execution-proof-fixture.mjs` 仅供合成测试，不是部署隔离证明。修改策略/执行器或证明过期即拒绝真实执行，WSL2 本身不构成隔离证明。

`plan` 将 JSON 输出到 stdout，不默认写文件。claim 可用于人工协作，模型执行另受 level、能力、Provider 白名单与执行器配置约束。`release` 是释放租约，不是发布软件。`recover` 仅在 writer.lock 对应进程已确认不存在时回收锁；不修复或清空损坏状态。

`cycle --task <ID> --holder <ID> --run-id <ID> --test <file> --state-dir <dir>` 自动续接同一 Task 的准备、实现、独立评审和验证；`--through integrate` 还需 integrate-dev 能力并对最终合并提交重验。它不推送或发布。控制器在准备时绑定仓库，准备失败保留所有源文件与中间 Git 状态，不能当空队列重跑。

## 需求级覆盖与 Requirement Run

```powershell
# 只读：不创建状态目录，不领取 Task
node scripts/agents/cli.mjs requirement-check --repo <repo> --requirement REQ-xxxx --plan PLAN-xxxx --coverage <coverage.json>
# 串行执行 manifest 内的 Task；默认 --through verify
node scripts/agents/cli.mjs requirement-run --repo <repo> --state-dir <controller-state> --holder <id> --requirement REQ-xxxx --plan PLAN-xxxx --coverage <coverage.json> [--through verify|integrate] [--limit N] [--max-stalls N] [--test <file>] [--report <file>]
```

coverage manifest 由协调者/Agent 拆解产生，结构见 `schemas/agents/requirement-run.schema.json`：每个条款 R1..Rn 至少绑定一个本 REQ/PLAN 内的 Task，每个 Task 至少一条仓库相对证据文件。`requirement-check` 只做结构、归属与证据路径存在性检查（`evidenceCheck: presence-only`、`semanticReview: not-performed`），输出覆盖矩阵；不证明证据语义正确。

`requirement-run` 是现有 `cycle` 之上的选择与报告层，不是新的状态机：每轮只从 manifest 内选择 `ready`、依赖已完成、无租约或路径冲突的 Task，串行调用 `cycle`；不领取 manifest 外 Task，不绕过 `depends_on`，不把 `verifying` 当依赖完成。停止原因包括 `engineering-complete`、`coverage-gap`、`blocked`、`stalled`、`needs-human`、`failed`、`limit`、`paused`、`cancelled`。`--through integrate` 需要 L2 `integrate-dev`，L0/L1 在 claim 前返回 `needs-human`。

`engineering-complete` 只表示 manifest 内所有条款绑定的 Task 都已 `integration_status: integrated` 且状态为 `verifying`/`done`，并且证据路径存在；它不是用户接受，也不授权发布。报告中的 `humanAcceptance` 仅在全部绑定 Task 为 `done` 时为 `accepted`，否则为 `pending`；`release` 恒为 `not-authorized`。默认 `--through verify` 会在验证后停下，需要集成时显式使用 `--through integrate`（或在既有 run 上继续 `cycle`）。`--limit` 默认 10，`--max-stalls` 默认 2。

`approval --run-id <ID> --approval <signed.json> --state-dir <dir>` 导入 Schema 定义的 Ed25519 外部批准。操作者把公钥写入独立状态目录的 `trusted-humans.json`（`{"version":1,"keys":[{"id":"operator","publicKey":"<PEM>"}]}`）；私钥不进入仓库或控制器 Worker。签名原文是 payload 的 `canonical()` UTF-8 字节，最多 24 小时；代码/合同变化后重签。工具不提供 human 自签按钮。

## 信任与恢复

状态使用单机文件锁、fsync/原子替换与 HMAC 完整性校验；控制器密钥不能放入 Git 或挂载给 Worker。它不是分布式锁，运行目录也不是安全沙箱。真实执行必须有经过验证的 OS/VM/沙箱边界，令 Worker 与测试代码均不能访问控制器状态和发布凭据。配置里的 isolation 是执行要求，不是隔离证明。

租约使用 task/run/holder/generation 四元组。过期结果拒绝；旧进程仍存活或生存状态未知时拒绝回收。暂停后心跳会中止本控制器正在管理的子进程，不根据陈旧 PID 随意杀死其他进程。重启后的进程确认、资源回收与部署演练仍需按父计划验证。

运行器记录配置固定的身份和实际子进程结果，模型文本只能输出有限结果 Schema，不能声明自己是 human。身份元数据不等于厂商独立性或模型质量的数学证明；用量拿不到时记录 null，不能写成 0。

验证使用仓库 Node runner、完整 check 和 impact 入口。必需检查缺失、无实际通过断言、候选代码/策略/执行器配置变化时拒绝沿用旧证据。UI 和 packaged 检查需要明确能力；UI 使用下述显式授权接口，不以普通单测代替。cycle 仅在实际检查非零退出、进入 verification-failed 且清理确认后，沿既有实现/评审轮数限制尝试修复；空报告、超时、证据变化、审批、隔离、清理或租约前置失败直接停止。

## 延期 UI 验收的接线

本次只完成接口与合同测试，按用户决定不运行真实 UI。未来明确授权后，可在 `plan` 原参数中加入 `--ui-plan <repo-relative.json> --authorize-ui true`，生成带计划摘要与 `ui` 检查的合同；命令本身不启动 UI。计划遵循 `schemas/agents/ui-plan.schema.json`，只允许 visible/click/fill/text，至少包含一次交互，禁止传入模型生成的 JS。控制器在核对 verify-ui 能力及候选绑定后，使用固定 `scripts/agents/ui-verification.mjs` 启动专属 fresh 实例、执行六主题操作/布局断言并记录实际截图摘要。截图不是视觉验收通过。

真实运行成功且资源清理确认后，缺少独立视觉评审会进入 `awaiting-ui-review`，不能集成。对该 run 使用 `ui-reviewer` 角色，结合 controller artifacts 中实际六主题截图与 DESIGN.md 进行独立评审；输出需要 artifactDigest=digest(report.checks)、六主题 coverage 和 approve 且无 gaps/中高风险 findings。再执行 verify 会重新检查其他必要项、复核原截图字节及评审身份，复用同一候选的运行证据。候选变更使缓存失效，无法确认清理会全局暂停。未配置或未运行视觉模型仍记为未验收。

当前明确 Task 的 cycle/loop 不依赖外部采集；TASK-0329 暂停。真实 CI 和 UI 验收延期不会把缺失结果改为通过，也不改变稳定发布授权。

DESIGN 源审计随完整 check 执行，只拦截新增可检测违规；模板表达式、输入基元例外、布局、交互及六套主题组合仍列作覆盖空白。测试日志有上限并保存到控制器 artifacts；对外证据使用摘要，排查时仅读取当前任务所需日志。

## 反馈、复盘与摘要

```powershell
node scripts/agents/cli.mjs signal --input <signal.json> --state-dir <dir>
node scripts/agents/cli.mjs nightly --date 2026-10-19 --state-dir <dir>
node scripts/agents/cli.mjs lesson --input <lesson.json> --state-dir <dir>
node scripts/agents/cli.mjs lessons-report --state-dir <dir>
node scripts/agents/cli.mjs digest --state-dir <dir>
```

信号和经验输入见对应 Schema。signal 仅产生去重后的调查建议；nightly 生成实际 Git/运行记录组成的材料，未调用模型评审。lesson 依据可达 commit 的提交时间或真实失败运行计数，至少三日期才形成候选。lessons-report 导出的 Markdown 经调查后通过普通 Task 维护到 LESSONS.md；没有直接修改权威规则的后门。

digest 聚合实际状态；CLI 用量只作为 reported 记录。未报告费用或部分尝试缺少用量时 totalCostUsd 为 null，不能拿部分 token 数推算完整账单。错误轮次、停滞、总时间和输出上限仍生效，不增加金额硬上限。

## 发布器与服务回执

默认 `publisher.enabled=false`。启用要由操作者配置绝对 command/queryCommand、制品根目录和发布公钥；受信命令从 stdin 读取固定 JSON，返回 service-proof Schema 的签名 JSON。它在可信控制面实现实际发布与幂等查询，接入现有 release/更新入口；本仓不会仅凭配置字符串建立真实发布服务。命令环境不继承宿主凭据，需要可信服务自行通过受限凭据代理完成操作。

操作者在独立状态目录提供 `trusted-services.json`：`{"version":1,"keys":[{"id":"service","publicKey":"<Ed25519 PEM>","roles":["ci","artifact","publication","telemetry","cleanup"]}]}`。实际部署应按最小角色分离密钥。签名原文是 payload 的 canonical UTF-8；subject 绑定发布仓库、最终代码/策略/合同、版本、渠道和全部制品。每种 data 的闭合结构由 services.mjs 校验。私钥不进入仓库、Worker 或控制器接口。

```powershell
node scripts/agents/cli.mjs publish --input <release-request.json> --proof <ci.json> --proof <windows.json> --proof <macos.json> --proof <linux.json> --state-dir <dir>
node scripts/agents/cli.mjs reconcile --release-id <id> --state-dir <dir>
node scripts/agents/cli.mjs rollout --release-id <id> --proof <windows-telemetry.json> --proof <macos-telemetry.json> --proof <linux-telemetry.json> --state-dir <dir>
node scripts/agents/cli.mjs resume-rollout --release-id <id> --proof <windows-telemetry.json> --proof <macos-telemetry.json> --proof <linux-telemetry.json> --state-dir <dir>
```

制品先核对实际 SHA-256/大小，CI 必须覆盖所需检查、tests/windows、tests/macos、tests/linux 和 desktop-packaged。签名回执证明受信服务报告的事实；不能替代密钥托管、代码签名有效性与远端执行的部署审计。publish 的重复请求返回既有意图；响应不确定时只允许 reconcile，不自动重发。查询确认尚未发布也保留现场，由操作者排查，不自动重试。未配置/未授权时这些命令拒绝执行。

每个灰度阶段独立计算观察期和样本；监控丢失要求暂停，只有发布器确认才显示 paused。resume-rollout 是明确的操作者动作，需完整健康观察证据，恢复后重新开始观察。暂停不能撤回已安装制品；Windows 更新回退继续采用现有更新器合同。真实三平台 CI、签名、发布器、遥测和稳定分支晋升仍需部署环境验证。

中断或失联后，先 `cleanup-subject --resource run|release --resource-id <id>` 取得资源摘要。资源所有者确认整个 job/VM 已撤销后提供 cleanup 回执，`cleanup-proof --input <proof.json>` 才清除阻断并增加 generation，拒绝旧执行结果。全局仍暂停；核对实际 Git、资源及未知发布对账后再显式 resume。损坏控制器状态继续拒绝初始化，不能用恢复命令清空。

## 验证

```powershell
bun scripts/quality/run-vitest.mjs --run scripts/agents
```

测试用真实临时 Git 仓库、文件系统和受控子进程覆盖软件合同，不调用真实 Provider、不读取用户会话，不证明远端 CI、真实模型质量或稳定发布已完成。
