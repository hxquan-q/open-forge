---
id: PLAN-0016
type: plan
status: in_progress
priority: P1
requirement: REQ-0005
owner: release/desktop
source: user-request；RESEARCH-0023
created: 2026-10-05
updated: 2026-10-05
related_requirement: [REQ-0005]
related_tasks: []
depends_on: [PLAN-0005]
---
<!-- Copyright The Open Forge contributors. -->

# 版本管理与发版重构

## 背景与目标

[RESEARCH-0023](../research/RESEARCH-0023-version-management-and-release-design.md) 对照了上游 Vetta 与业界做法，并核出本仓六处缺口。本计划把「版本号从哪来、说明怎么写、什么时候算已发布、谁能发布」四件事收敛成可机械校验的合同，同时清掉继承自上游的锁步发版残留。

目标：任何时刻都能从仓库判定一个版本是否已发布；版本号只有一个事实源；发布说明不再是被所有并行任务追加的单一热文件；发布授权停在平台层而不是约定层。

## 当前事实与约束

- 已冻结（[ISSUE-0007](../issues/ISSUE-0007-independent-desktop-version-baseline.md)）：独立 SemVer、纯 `X.Y.Z`（不引入预发布后缀）、首发 Win+Linux、GitHub Release 打 pre-release、上游基线行自动取 merge-base、publish 由用户亲自执行。
- 已冻结（[ISSUE-0009](../issues/ISSUE-0009-workspace-package-release-scope.md)）：不公开发布任何 workspace 包。
- `apps/desktop/package.json#version` 是发布版本唯一事实源；`scripts/release-desktop.mjs` 已实现 prepare 与 publish 及四处说明校验；`desktop-release.yml` 已有 tag 与 version 比对和两个 Environment。
- 约束：不改上游已发布的 Release Notes；薄壳 fork，改动应尽量避开上游热文件；不新增付费服务或外部依赖。

## 候选方案与取舍

1. **只加守卫、不改结构**：在 `check:guards` 里加「说明文件版本、标题、日期状态」断言。收益最小、风险最低；代价是并行任务的说明冲突仍在。
2. **说明改为碎片加汇编**：每个任务写自己的碎片文件，发布前汇编成 `v<版本>.md`。收益是彻底消除单文件冲突；代价是改动 delivery 规则（所有任务改为写碎片），需要汇编脚本与对既有文件的兼容路径。
3. **恢复上游的 pending 加 desktop-promote 上线门**：收益是「安装包已上传但客户端还看不到新版本」，并带降级拒绝与 sha512、公网复核；代价是新增一个工作流与一个脚本，且要靠人工记得跑上线。不恢复则须明确接受「发布作业成功即全量可见」。
4. **删除根目录继承的锁步发版脚本**：收益是消除误用面（`version:*` 会锁步改写含 desktop 在内的全部 manifest，还会 `rm -rf node_modules`）；代价是上游同步若带回来需要重复裁决。

取舍建议：1 必做；2 是本计划的核心结构性改动；3 由用户定方向（默认建议恢复，与本仓「更新源即 GitHub Release 与 R2」的现实配套）；4 一并做，作为清理。

## 阶段

1. **成文政策（前置）**（done，TASK-0209）：把「版本事实源、0.x 语义、发布日期只在发布时写、上游基线行只由脚本写、已发布版本文件只读」写进 `docs/dev/agent-rules/delivery.md` 与 `.github/release-notes/README.md`；同时明确各应用与包的版本归属（desktop、cli-host、mobile、kotlin、im-gateway、插件、docs-site、根）。
2. **状态可判定加守卫（核心）**（done，TASK-0209）：发布日期改由 publish 阶段写入，不接受 prepare 期手填；`check:guards` 增加断言——说明文件名版本等于 `apps/desktop/package.json#version` 等于标题版本；无对应 tag 时日期必须是「待定」；已有对应 tag 的版本，其说明文件不得被修改。
3. **说明碎片化**（done，TASK-0212）：引入碎片目录与汇编脚本，把「补写发布说明」从「改 `v<版本>.md`」改成「写一份碎片」；汇编产物仍是唯一 Release 正文；`check` 断言碎片可汇编且结构合法。取舍已定：既有条目不迁移，只对未来版本生效（加法式）；`project/` 内 102 处历史引用不回填。
4. **清理继承残留**（done，TASK-0210）：删除或收敛根 `version:*`、`release:*`、`publish*` 与 `scripts/release.mjs`、`scripts/release-windows.mjs`、`scripts/sync-versions.js`；把 workspace 发包的 fail-closed 守卫转为 `check` 断言。同时裁决 `0.55.3` 遗留（根、docs-site、runtime-knowledge）是冻结并注明，还是改中性值。
5. **上线门（已定：保留直发）**：结论：保留本仓的直发模型（各平台构建成功即上线更新清单），补偿控制写进 runbook——发布后 `verify published r2/github feed` 回公网复核，正式发布由责任人本地 `release:desktop:publish -- <版本> --confirm-publish` 发起。代价是发布作业一成功客户端即可见，且缺少上游清单上线时的降级拒绝与 sha512 复核；若要改回两步门，需移植上游 `desktop-promote.yml` 与 `promote-update-metadata-r2.mjs`，并把发布作业改为把清单写入 `pending/<版本>/`。
6. **平台侧加固**（已落地，TASK-0213）：`v*` tag 的删除与改写 ruleset 已加（仓库管理员 bypass），`desktop-test` 已创建；两个 Environment 的 required reviewers 被平台以 422 拒绝（当前计划不支持），因此可用的人工门是 tag ruleset 加本地 `publish --confirm-publish`，升级计划后再补配。

## 不做什么

- 不执行任何真实发布、tag、push 或 npm 发布；不改已发布版本的说明正文。
- 不改凭据运行名、持久化协议、更新源地址等已冻结兼容合同。
- 不为本计划引入付费服务或新外部依赖。

## 验证与回滚

- 验证：`bun run check`（含新增守卫）、`bun run test:quality`、扩展 `scripts/release-desktop.test.mjs` 用例（日期只在 publish 写、碎片汇编、文件名与标题与版本一致）；不调用真实 GitHub。
- 回滚：按阶段单独回退；阶段 2 与阶段 3 的守卫和汇编脚本可分别撤下，不影响现有 `v0.1.3.md`。
- 已发布版本不受影响（当前只有 `v0.1.2` 一个 Release）。

## 升级信号

- 桌面端进入 1.0，或引入 beta/canary 通道时，重审「纯 `X.Y.Z`」与通道命名。
- 若上游同步带回 `desktop-promote`，阶段 5 直接复用而不是重写。
- 说明碎片化后若仍有冲突，说明粒度或汇编时机需要再调。

## 需要的 ADR

阶段 2 与阶段 3 改变「发布说明的写入方式与发布状态的判定」，属跨模块合同；若同时恢复阶段 5 的上线门，应补一份 ADR 记录发布可见性模型（直发对暂存上线）。
