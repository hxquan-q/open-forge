---
id: TASK-0178
type: task
status: done
priority: P1
owner: ssh-transport + desktop SSH security
source: BUG-0062; RESEARCH-0019
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0177, TASK-0169, TASK-0165, TASK-0174]
related_issues: []
related_bugs: [BUG-0062]
execution: serial
branch: main
worktree: unassigned（2026-10-02 主检出串行实施，无多 Agent 授权）
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [packages/ssh-transport/src/known-hosts.ts, packages/ssh-transport/src/known-hosts.test.ts, packages/ssh-transport/src/ssh2-runner.ts, apps/desktop/src/main/ssh/ssh-hostkey-verifier.ts]
write_paths: [packages/ssh-transport/src/known-hosts.ts, packages/ssh-transport/src/known-hosts.test.ts, apps/desktop/src/main/ssh/ssh-hostkey-verifier.ts, apps/desktop/src/main/ssh/ssh-hostkey-verifier.test.ts, project/tasks/TASK-0178-ssh-known-hosts-revocation.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0169, TASK-0177]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-09
---
<!-- Copyright The Open Forge contributors. -->

# known_hosts 撤销语义与宿主拒绝合同

## 事实与目标

[BUG-0062](../bugs/BUG-0062-revoked-host-key-accepted.md) 已在合成输入上证实 @revoked 被当成普通 match，真实宿主校验函数随即返回 true。当前只建 Task，**不修改认证逻辑**；实施须由后续明确请求启动。

目标是恢复“已撤销密钥必须拒绝”的安全边界，并让 marker 角色在 matcher 与宿主组合之间不丢失。Upstreamable 的通用校验修复，保留 Open Forge 现有宿主提示/存储边界。

## 范围与替代方案

- 优先做有界 marker/verdict 修复并同时迁移消费者；若需新增公共 verdict 类型，检查全部导出/调用者和未知分支，不让新拒绝态回落成首次确认。
- 对适用主机/公钥的撤销采取拒绝优先，检查所有相关行和 user/app 文件来源，不靠先遇到哪个 match 决定。
- @cert-authority 不得独自把 raw host key 标为可信；不在本任务实现证书链验证，未知 marker 也不得产生信任。
- 不改 known_hosts 原始文件、不迁移凭据目录、不自动移除 revoked 标记、不提供“仍然连接”绕过；普通同钥放行、变更拒绝和未知首次确认保持。
- 本任务不顺手修改文件不可读策略、权限存储或其他 SSH 协议；若必须扩大公共合同，先记录替代方案与兼容影响。

## Given / When / Then

1. Given 相同公钥被 @revoked 标记；When matcher 和真实宿主 verifier 处理；Then 拒绝，不触发确认、不追加记录。
2. Given 普通匹配与 revoked 同时存在，且分别位于前后行/不同文件；When 更换行序或来源顺序；Then 拒绝结果不变。
3. Given CA/未知 marker；When 对端提供恰好相同的 raw key；Then 不凭该行直接放行；有效普通条目的语义不被随意扩成证书信任。
4. Given 普通同钥、不同钥、未知主机，以及哈希/通配/取反/非默认端口；When 正常连接确认或拒绝；Then 保持既有合法流程和 key change fail-closed 行为。

## 输入、输出与并发

输入为合成 known_hosts、主机信息和可控文件/提示端口；输出为校验结果与必要提示/写入副作用，不含真实密钥。当前串行规划；实际跨包校验、宿主组合和测试需同一 Task 收口，与 TASK-0169/0177 的宿主/文档边界串行集成。不启动 Agent 或 Worktree；未来并行须另有授权。

## 验证与验收

- 先将 BUG-0062 的 matcher + 宿主链补成失败回归；已有错误的 CA 同钥断言应改成角色明确的安全测试，不能简单删掉覆盖。
- cwd `packages/ssh-transport`：`bun ../../scripts/quality/run-vitest.mjs run src/known-hosts.test.ts src/ssh2-runner.test.ts src/ssh2-runner.loopback.test.ts`。
- cwd `apps/desktop`：`bun ../../scripts/quality/run-vitest.mjs run src/main/ssh/ssh-hostkey-verifier.test.ts src/main/ssh/ssh-host-service.test.ts`。
- `bun run test:impact -- packages/ssh-transport/src/known-hosts.ts apps/desktop/src/main/ssh/ssh-hostkey-verifier.ts`；公共 verdict 变更另跑 `test:changed` 与完整 `bun run check`，显式补跑未注册入口的 SSH 测试（直到 TASK-0174 落地）。
- 文件 I/O 只使用自有临时夹具或受控端口；不得读取用户真实 ~/.ssh/known_hosts、私钥或访问真实主机。测试断言允许/拒绝及副作用，而非只检查 mock 次数。

## 当前状态与不做项

工程完成，其余历史不做项边界（不改原始 known_hosts、不迁移凭据、不提供“仍然连接”绕过、不实现证书链验证）在实施中全部保持。

## 交付记录（2026-10-02，主检出串行实施）

- 实现：`matchKnownHosts` 新增 `revoked` verdict——扫完全部行再裁决，`@revoked` 同钥优先于普通匹配且与行序无关；`@cert-authority` 与未知 marker 整行跳过（不产生 raw host key 信任、不判变更）；`@revoked` 异钥不参与裁决。宿主 `createSshHostKeyVerifier` 改为两份文件全部查完再决定：任一文件 `revoked` 即拒绝（不触发确认、不写回），普通 match/mismatch 维持原文件先后次序的 fail-closed；新增可选 `userKnownHostsPath` 注入（默认仍 `~/.ssh/known_hosts`），测试不触碰真实用户文件。
- Red/Green：旧实现红——matcher 新增断言 7 项失败（revoked-only、两种行序、`@revoked` 异钥、CA 同/异钥、未知 marker、哈希/非默认端口撤销）；修复后 17/17。宿主链失败复现沿用 BUG-0062 的合成探针证据；新增 9 项宿主用例覆盖跨文件撤销优先（两种文件序）、无提示无写回、异钥走确认、CA 走确认。
- 实际命令与结果：cwd `packages/ssh-transport` 定向三件套（known-hosts/ssh2-runner/loopback）49/49；cwd `apps/desktop` verifier + host-service 24/24；`test:impact`（公共 verdict 变更自动回退，desktop 4652 + runtime-desktop）通过；`test:changed --base origin/dev`（desktop/presets/content-creation/runtime-desktop/themes/toolkit）通过；`bun run check` exit 0。ssh-transport dist 已重建供 desktop 消费；显式补跑未注册入口的 SSH 自身测试（TASK-0174 落地前标准选择器不含该包）。
- 公共合同核对：`KnownHostsVerdict` 生产者/消费者全量检索仅 desktop verifier 与测试；新 `revoked` 分支在宿主显式拒绝，不会回落成首次确认。
- 未验证项/风险：未做真实主机与多平台实测（非 Windows 走系统 OpenSSH，不经此代码路径）；证书链验证按合同未实现；两份 known_hosts 现在总是都被读取（撤销可能登记在后查的文件里），连接建立的额外读取开销可忽略。
- 状态：工程完成转 `verifying`；`integration_status: integrated`（随本提交入 main）；人工功能验收与发布未执行。

### 人工验收实测（2026-10-08，VERIFY-0017 组五；保持 verifying 待裁定）

方法：按本任务「验证与验收」一节声明的两条命令逐条复跑（主检出 HEAD `18a7bf7b4`）。

| 声明命令 | 本次读数 |
|---|---|
| cwd `packages/ssh-transport`：`known-hosts.test.ts` + `ssh2-runner.test.ts` + `ssh2-runner.loopback.test.ts` | **3 文件 / 53 例通过，0 失败**（交付记录记 49/49；本轮 53，方向一致） |
| cwd `apps/desktop`：`ssh-hostkey-verifier.test.ts` + `ssh-host-service.test.ts` | **2 文件 / 24 例通过，0 失败**（与交付记录 24/24 一致） |
| **合计** | **5 文件 / 77 例通过，0 失败** |

- **合同条款定位**：`known_hosts` 的 `@revoked` 无条件拒绝、宿主侧拒绝合同与「不给『仍然连接』」选项，由上述 `known-hosts.test.ts`（解析与撤销语义）与 `ssh-hostkey-verifier.test.ts`（宿主拒绝合同）分别断言；本任务即 BUG-0062 的修复承接。
- **未覆盖**：**真实已知主机上的 `@revoked` 实测**——需要一台真实 SSH 主机并把其密钥写入 `known_hosts` 后标 `@revoked`，属各 SSH 任务的共同边界（不连真实主机），本轮未做。交付记录里更宽的读数（`test:impact` 的 desktop 4652 + runtime-desktop、`test:changed --base origin/dev`、完整 `bun run check` exit 0）本轮**未复跑**。
- **关闭建议**：两条声明的定向命令全绿、撤销语义与宿主拒绝都有直接断言；缺的只是真实主机形态。倾向 `done`，是否要求补真实主机实测，请用户裁定。

### 用户裁定闭合（2026-10-09，VERIFY-0017 分档口径）

按用户「**按未覆盖成因分档**」口径裁定：未覆盖项属**验证合同明令禁止**，据此闭合。

- **真实主机 `@revoked` 实测不属验收对象**：本任务合同第 61 行原文「文件 I/O 只使用自有临时夹具或受控端口；**不得读取用户真实 `~/.ssh/known_hosts`、私钥或访问真实主机**」；交付记录亦记「输入为合成 known_hosts、主机信息和可控文件/提示端口……不含真实密钥」。即真实主机形态是**合同禁止项**，不是「本轮没跑」。
- 可及范围内证据：两条声明命令 **5 文件 / 77 例通过、0 失败**（`ssh-transport` 的 `known-hosts` + `ssh2-runner` + `ssh2-runner.loopback` 3 文件 53 例；`apps/desktop` 的 `ssh-hostkey-verifier` + `ssh-host-service` 2 文件 24 例）。`@revoked` 无条件拒绝与宿主拒绝合同分别由前两组文件直接断言；本任务即 BUG-0062 的修复承接。
- 如实标注：交付记录里更宽的读数（`test:impact` desktop 4652 + runtime-desktop、`test:changed --base origin/dev`、完整 `bun run check` exit 0）本轮未复跑。
- 边界外（同为合同项）：证书链验证「按合同未实现」；非 Windows 走系统 OpenSSH 不经此代码路径，故无多平台实测对象。
