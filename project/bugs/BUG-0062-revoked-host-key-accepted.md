---
id: BUG-0062
type: bug
status: verifying
priority: P1
owner: ssh-transport + desktop SSH security
source: TASK-0172 synthetic known_hosts verifier experiment
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0178, TASK-0177, TASK-0172]
related_issues: []
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# ssh2 宿主校验接受已撤销的主机公钥

## 用户流程与期望

Given：known_hosts 中某主机公钥已有匹配的 `@revoked` 标记；When：Windows ssh2 路径校验该公钥；Then：必须拒绝，不能被普通匹配、文件顺序或确认提示放行。CA marker 也不能当成普通 host key 的直接信任。

权威合同核对（2026-10-02 只读获取）：[OpenBSD sshd(8) 的 SSH_KNOWN_HOSTS_FILE](https://man.openbsd.org/sshd.8#SSH_KNOWN_HOSTS_FILE) 明确 @revoked 密钥不得用于认证或 CA 信任，@cert-authority 表示 CA 而非普通主机密钥。本任务的拒绝目标不是自行发明的策略。

## 威胁与影响范围

资产是用户对远端主机身份的信任；不可信输入是网络对端提交的公钥，撤销条目是本地信任约束。当前决策路径可能让持有被撤销旧密钥的对端越过预期拒绝边界。受影响的是使用本仓 matcher/verifier 的进程内 ssh2 路径；不推断系统 OpenSSH 也有此问题，不宣称存在真实入侵或已泄漏凭据。P1 安全修复优先于性能优化。

## 环境与实际证据

2026-10-02，Windows / Node v26.3.1，基线 `c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa`。Node VM 执行 TypeScript 转译后的真实 known-hosts.ts 和 ssh-hostkey-verifier.ts；使用 `probe.invalid` 与 `fixture-public-key` 占位字符串，所有宿主文件 API、homedir、应用目录和日志端口均替换为受控值。占位串不是可用的 SSH 登录材料，只用于比较/marker 决策，不发起网络连接。

```json
{"marker":"@revoked","verdict":"match"}
{"marker":"@cert-authority","verdict":"match"}
{"hostVerifierAllowsRevoked":true,"prompts":0,"usedRealKnownHosts":false,"networkRequests":0}
```

## 最小复现

1. 调用真实 `matchKnownHosts(["@revoked probe.invalid ssh-ed25519 fixture-public-key"], "probe.invalid", 22, "fixture-public-key")`，实际为 match。
2. 宿主探针中用 Map 模拟 user/app 两份 known_hosts，user 文件含上述条目、app 文件为空；对未登记文件访问和任何写入直接抛错，确保不读真实文件。
3. 用同一真实 matcher 装配真实 createSshHostKeyVerifier；ask 设置为返回 `{ok:false}` 并计数。
4. 传入对应 host info，实际返回 true，ask 次数为 0。用 @cert-authority 替换 marker 的 matcher 层同样返回 match。

## 根因与待核验边界

parseKnownHostsLine 保留 marker，但 matchKnownHosts 只比较主机模式和 keyBase64，遇同钥立即 match。宿主遇首个文件 match 立即放行，未保留撤销或证书角色。已有测试把 @cert-authority 同钥当作普通 match，回归时须用正确安全合同替换该断言，而不是删除测试。

“多行/多文件正匹配不能盖过撤销”的更多顺序组合是必须新增的回归，本轮未穷举。文件不可读的处理和存储位置属于其他合同，不在本记录推断为同一根因。

## 回归、修复与验证

归入 [TASK-0178](../tasks/TASK-0178-ssh-known-hosts-revocation.md)。至少覆盖 revoked-only、普通/撤销两种行序、user/app 两种文件序、普通同钥/变更/未知、CA/未知 marker 和既有哈希/通配/非默认端口。

2026-10-02 修复（TASK-0178）：`matchKnownHosts` 新增 `revoked` verdict——扫完全部行再裁决，`@revoked` 同钥优先于普通匹配，CA/未知 marker 整行跳过既不产生信任也不判变更，`@revoked` 异钥不参与裁决；宿主 `createSshHostKeyVerifier` 两份文件查完才放行，任一文件撤销即拒绝（不触发确认、不追加登记），普通 match/mismatch 保持原文件序 fail-closed 语义。旧实现红证据：matcher 新增 7 例断言失败（revoked-only、两种行序、异钥、CA 同/异钥、未知 marker、哈希/非默认端口撤销）；宿主链失败复现即本记录 2026-10-02 合成探针。真实用户 known_hosts 未被读取。

本轮未做真实主机联调与多平台实测（Windows 外平台走系统 OpenSSH，不经此代码路径）；修复后定向 73 例、impact/changed 门禁见 TASK-0178 交付记录。人工功能验收与发布另行处理。
