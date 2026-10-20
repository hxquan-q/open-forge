---
id: VERIFY-0019
type: verification
status: partial
owner: project/agent-workflow
source: REQ-0019; PLAN-0019; user request to run the complete flow
created: 2026-10-19
updated: 2026-10-20
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0322, TASK-0323, TASK-0324, TASK-0325, TASK-0326, TASK-0327, TASK-0328, TASK-0329, TASK-0330]
related_bugs: [BUG-0107, BUG-0132, BUG-0133]
---
<!-- Copyright The Open Forge contributors. -->

# 自主研发软件流程与真实运行条件审计

## 被验证的合同

目标以现有 REQ/PLAN/TASK、路由与经验回流为骨架，自动执行实现、独立评审、真实检查和合并重验；缺失身份、权限、执行、资源清理或监控时停止。软件、模型质量、真实隔离、远端服务与实际发布分别记录；目标 L4 不表示当前达到 L4。

## 环境与证据

- 实施基线 main `399fdf1ff`；来源链 `cf79dd504` → `47b1e8e86` → `c22ccc1c5` → `33992b0be` → `8e14b3bcd` → `ff408a28e` → `8846e7f30`。本地 main 按 WAIVER-0005 合并为 `80ad98655`；冻结候选树 `3e067fa1a2d62e6ac9b9599c8481cd0837c8efc9`，合并后代码/测试树未改变，仅集成管理记录订正。
- 组合验证日志 `open-forge-autonomy-integrated-test-changed-20261019.log`，位于系统临时目录；七个他人 `temp/` 文件仍原位未跟踪，未读取内容、暂存或提交。
- Windows 本机、Bun 1.4.2 / Node v26.3.1 / 仓库 Node Vitest runner；临时真实 Git、Worktree、文件、子进程与测试专用签名密钥。
- 未使用真实用户 Desktop/Agent 状态、Provider、签名私钥或生产服务；真实模型、发布器默认 disabled，doctor 实测 level=0、readyForModelExecution=false、publisherConfigured=false。

## 已验证的软件流程

| 范围 | 实际证据 | 限制 |
|---|---|---|
| 闭合合同、HMAC 状态、fencing、取消与进程树终止 | Task-0322/0323 的文件系统和受控进程测试；未知清理进入暂停 | 单机文件锁，必须另外部署控制面/Worker OS 隔离 |
| 实现→独立评审→实际断言→合并候选重验→main 前进拒绝→重建集成 | integrate 连续真实 Git 流程 | 模型由受控 Node 替身提供，未证明真实模型质量 |
| 七类人工闸门、未知分类与外部签名批准 | 累积 diff、移除检查、错误候选/过期/篡改回归 | 分类并非语义完备；真实操作者公钥尚未配置 |
| 反馈去重、可核实经验与三日期候选、摘要和用量 | feedback/usage/CLI 流程 | 仅调查建议；nightly 输出材料，不声称模型复盘已执行 |
| 发布→持有→推进→远端暂停回执→显式恢复 | 受控 Node 发布器、三平台测试签名和真实制品字节检查 | 不是生产签名、CI、遥测或实际稳定发布 |
| 响应丢失、版本/渠道预留、幂等对账、中断回收提升 generation | release/services 回归；旧结果隔离 | 操作者需部署可信发布/清理服务，缺失时拒绝执行 |
| 跨工具路由、LESSONS、D01–D11 源审计及质量接线 | TASK-0324 quality/impact 54 文件 / 597 例，完整 check exit 0 | UI 源审计不证明真实布局、交互、六套主题或独立视觉审查 |

## 全量测试与基线修复

- TASK-0322 全量 test:changed 完成 46 工作区，43 通过，3 失败（runtime-node/CLI/Desktop），日志 `open-forge-task-0322-test-changed-v2-20261019.log`；不是整仓通过。runtime-node 原失败文件单独复验 2 例通过，未调整原超时。
- BUG-0132：Photon 实际依赖归 runtime-node，旧独立入口仍从 coding-agent/node_modules 导入。生成入口实际文件回归先红后绿，CLI 2 文件 / 3 例通过；首轮真实制品 14 例中 13 通过，剩余暴露临时项目缺信任前置条件。
- BUG-0107：新实际 window-manager 导入回归在旧代码精确复现 resourcesPath 未定义；延迟打包分支求值后原四个失败文件与新增/相邻合同共 6 文件 / 29 例通过。
- CLI bootstrap 的非交互未授信告警属于预期安全行为；现在精确断言 warning/路径/原因。正向动态项目 Skill 夹具只对临时项目通过既有 TrustStore 授信，产品默认拒绝策略不变。
- installed-artifact 最终复验 14 例全通过（95.85 秒），日志 `open-forge-task-0325-artifact-v2-20261019.log`。
- BUG-0133：自审发现发布回执使用请求发起时刻校验的时钟错误。改用真实子进程签发时间后 8 例中 4 例先红；接收时刻验签后同一 8 例通过，未来/过期/篡改仍拒绝，未放宽安全约束。
- 公开 CLI 对实际仓库运行 nightly/lesson/lessons-report：当天 22 个提交成为复盘材料，明确 reviewPerformed=false；同一 BUG-0133 来源提交重放仍 Seen=1，已按 Task 沉淀 LESSONS 候选，没有制造三日期或硬规则晋升。
- verify:runtime-contract 首轮 27 文件 / 137 例中 135 通过，runtime-selection 两例触发原 5 秒超时；该入口强制 4 worker 覆盖了既有普通 CLI test 的 1 worker。正在原超时下复验，不把测试超时改大或失败记为通过。
- 同一失败文件单 worker 9/9 通过后，公开合同入口复用现有 test 的单 worker 策略；最终 27 文件 / 137 例全通过，465.74 秒（`open-forge-task-0325-runtime-contract-v2-20261019.log`），原超时/断言/范围不变。
- TASK-0325 控制器补丁经 impact 实际重跑质量 54 文件 / 597 例，通过；完整 check exit 0（`open-forge-task-0325-check-20261019.log`），实际 UI、模型与发布仍未执行。
- 最终组合 test:changed 已通过：46/46 包，2077.1 秒。CLI 51 文件通过 / 1 跳过，238 例通过 / 14 跳过；Desktop 973 文件通过 / 4 跳过，5278 例通过 / 17 例跳过；未新增 skip，未修改断言或超时。
- 管理记录订正后的合并前完整 `bun run check` exit 0，39.8 秒，日志 `open-forge-autonomy-integrated-final-check-20261020.log`；`80ad98655` 的合并后记录完整 check 再次 exit 0，日志 `open-forge-autonomy-post-merge-check-20261020.log`；lint、类型、守卫、移动端 lint 与自主入口检查通过，未放宽基线。

## 未运行与恢复条件

| 项 | 当前事实 | 恢复条件 |
|---|---|---|
| 真实实现模型与异家族评审模型 | 用户答复没有配置，未调用 | 明确允许的模型/版本/Provider 与受限凭据，真实独立性/质量验收 |
| OS/VM sandbox 与故障回收 | 用户没有 VM/runner；目录和配置字符串不算证明 | 提供 Worker 无法接触控制器、签名和真实状态的已验证执行边界 |
| 实际 UI/视觉运行 | 仅增量源检查，verify 的 UI 运行适配尚未接入 | 明确可执行的隔离 GUI/浏览器环境、运行适配与独立视觉证据；不得拿截图或普通单测代替 |
| 外部信号采集与每日模型复盘 | 输入/去重/材料/候选接口已测，未部署主动采集/模型循环 | 确认只读采集凭据、平台范围、真实模型及运行环境，再部署并验收循环 |
| 三平台 CI | 最近核实 run 39235716508 / job 118004157996 因 Actions 预算未启动 | 恢复可用配额/runner 后取得同一最终提交的实际三平台/packaged 检查；不擅自修改预算 |
| 签名/发布器/遥测及稳定晋升 | 用户没有这些环境，未执行实际发布 | 可信服务、最小角色公钥/凭据托管、真实制品与遥测，以及符合现行规则的明确发布授权 |

上述未完成项保留，不通过提高自治等级、模型自述、测试密钥或模拟回执填平。Task/Plan 不标记全目标完成。

## 当前接入范围与依赖语义

`ecfe01f17` 已补齐 planner/triage/lessons/ui-reviewer 的闭合角色执行路径，`94560c460` 增加有界多 Task 编排；本轮之前的 5 文件 / 34 例定向复验通过。分析角色目前只产生建议，尚不能据此宣称分诊→调查→Task 或 nightly→真实模型复盘已完整接通。nightly 仍是可核实材料；UI 草稿未完成，真实 UI 证据未取得。后续接入工程和实际模型质量仍需分别验收，不是填写一个模型 ID 即达到全流程。

调度前置条件沿用当前合同：只有 done 且 integrated 的 Task 才算完成依赖；verifying 不会被静默视为人工接受。未来提升自治等级时，须明确工程依赖就绪与产品接受的关系并通过治理，当前没有改写该合同。

本地组合集成已按 WAIVER-0005 完成，不清理七个他人 temp 文件。这次例外不豁免 main:dev 推送前干净工作区、推送授权或任何发布条件；因此本地集成不等于 dev 推送或真实部署。最终状态为 **partial**：软件闭环和组合验证已取得证据，缺失外部环境与真实运行验收，不能宣称达到 L4。

## 2026-10-20 环境选择与延期验收

用户选择只使用 WSL2，不新增机器/Windows VM；真实 CI 等账号额度恢复，真实 UI 验收也延期。执行路线已回写 [PLAN-0019](../plans/PLAN-0019-autonomous-development.md)：先完成仓库软件和本地测试，再核验实际 WSL2/模型/隔离条件，最后补跨平台、UI、签名发布与遥测证据。该决定不授予安装、真实 Provider 调用、调高自治等级或生产发布权限。

本轮只读执行 `wsl.exe --list --verbose` 与 `wsl.exe --status` 均 exit 1，返回未安装 WSL。未进入任何 Linux 发行版，未运行 Linux 测试；这是当前会话机器的结果，不推断其他机器状态。未运行 CI、UI、真实模型或发布，既有测试结果的候选范围保持原记录。最终 L4 状态仍为 partial，不因验收延期而改成通过。

## 2026-10-20 TASK-0328/0330/0331 实施验证

以上未安装 WSL 是先前规划时的历史结果。用户安装后，实际预检确认 Ubuntu-26.04 Running / Version 2；当前执行请求收敛为 UI 接口、分项环境检查和明确任务的本地闭环，TASK-0329 外部采集搁置。

### 软件修改与连续流程

- 修正 UI 草稿语法/缺模块，增加显式授权的闭合操作计划和 fresh 实例驱动；固定回调执行六主题的交互、可见性/文本/输入、布局断言及截图。运行失败尝试清理，不确认清理则暂停。
- 控制器校验计划、候选和实际截图字节；runtime 通过后仍停在 awaiting-ui-review，直到不同家族的视觉结果绑定同一候选、截图摘要和六主题覆盖。公开 run 的 ui-reviewer 请求包含确切材料清单并要求只读图片通道；图片不可访问必须返回证据不足，不能凭元数据通过。当前未部署真实图片/模型通道。
- doctor 分开报告本地软件、执行与发布条件；只调用固定工具版本检查，既有未初始化状态保持只读。runner/verify 核验外部可信执行证明、配置/仓库绑定和有效期；配置标签不是 OS 隔离证明，测试签名不是部署证据。
- cycle 只对实际非零检查失败且已确认清理的结果执行有界修复。空报告、超时、证据变化、权限或清理问题停止。真实 Git 回归先复现旧版本 needs-action，再证明实现→评审→断言失败→再实现/评审/验证→合并候选重验；目标 main 前进仍拒绝旧证据。扩展的双轮进程用例给出单例 15 秒时限，产品上限与既有其他用例未改。

### 实际命令与结果

| 环境/检查 | 结果 | 证据与边界 |
|---|---|---|
| WSL2 定向 Node runner | 7 文件 / 45 例通过 | 专用 Linux 副本，真实临时 Git 与受控进程；不调用真实模型 |
| WSL2 `bun scripts/quality/run-vitest.mjs --run scripts/agents apps/desktop/scripts/ui-verification-acceptance.test.ts --maxWorkers=2` | 20 文件 / 107 例通过，4.45 秒 | Linux Bun 1.4.2 / Node 22.14.0；日志 `/tmp/open-forge-wsl-validation-pxj9vq31/all-agents.log` |
| Windows `test:impact` 首轮 | 58 文件中 56 通过；632 例中 630 通过 | 原发布进程用例 5 秒超时，且安装 WSL 后 `bash` 优先命中系统 WSL shim；未把失败算通过 |
| Windows 质量集合复验 | 明确 Git Bash PATH、`bun run test:quality -- --maxWorkers=1`：58 文件 / 635 例通过，87.82 秒 | 包含新增空报告不可自动修复回归；后续损坏 UI 清理报告的暂停断言由 WSL2 全套复验覆盖。不修改既有断言或发布用例时限。日志 `open-forge-local-autonomy-quality-final-20261020.log` |
| Desktop 直接测试及同一影响计划的 related 检查 | 各 1 文件 / 3 例通过 | 固定 UI 程序与输入/结果边界测试，没有打开 Electron/浏览器 |
| 完整 `bun run check` | 最终代码复验 exit 0 | 首轮发现 Desktop 不可 import 根控制器及缺类型声明，已改为 Desktop 独立消费校验；最终日志 `open-forge-local-autonomy-check-final-20261020.log` |
| 实际 Windows doctor | softwareReady=true，level=0、readyForModelExecution=false、publisherConfigured=false | 不创建控制器状态、不调用模型 |

Linux 工具和最小验证依赖仅置于 `/tmp/open-forge-wsl-validation-pxj9vq31`；没有复用 Windows node_modules、修改全局 PATH、运行完整产品 Linux 构建或部署常驻服务。Windows 质量日志在系统临时目录 `open-forge-local-autonomy-quality-20261020.log`，首轮影响测试日志为 `open-forge-local-autonomy-impact-20261020.log`。影响计划后续的 Desktop direct/related 已单独执行，不能把原 impact 失败日志改写成 exit 0。

### 未运行与验收状态

真实 CI、UI 交互/六主题视觉、真实 Provider、OS 隔离部署证明、签名发布和遥测均未运行。UI 的测试图片和模型/发布替身只验证软件合同。当前三个 Task 保持 verifying；已随 `a2e846e70` 提交到本地 main，integration_status=integrated；后续仅订正集成记录。七个他人 temp 文件未读取内容、未改动或提交；没有 push、发布、创建定时任务或改变自治等级。全目标仍为 partial。
