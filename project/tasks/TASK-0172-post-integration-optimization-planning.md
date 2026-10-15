---
id: TASK-0172
type: task
status: done
priority: P1
owner: coordinator
source: user-request-2026-10-02; TASK-0171
related_requirement: [REQ-0002, REQ-0004]
related_plan: [PLAN-0014]
related_tasks: [TASK-0171, TASK-0168, TASK-0169, TASK-0173, TASK-0174, TASK-0175, TASK-0176, TASK-0177, TASK-0178]
related_issues: []
related_bugs: [BUG-0059, BUG-0060, BUG-0061, BUG-0062]
execution: serial
branch: main
worktree: unassigned（仅调查与规划文档）
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [project, packages/ssh-transport, packages/toolkit, apps/cli-host, apps/desktop/src/main/ssh, scripts/quality, .github/workflows]
write_paths: [project/tasks, project/research, project/bugs, project/plans, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 集成后的优化调查与后续 Task 规划

## 目标与授权范围

Open-Forge-only。按用户“继续看哪些地方值得优化和修改，建立 task”调查当前已集成快照，给出有源码/执行证据、无重复项且可执行的优先队列。本轮仅交付规划文档，不实施产品、测试工具或 CI 改动，不把建议当作已完成修复。

## 范围、输入输出与并发

- 输入：TASK-0171 的通过/失败记录、已有 draft/verifying Task、当前源码和包测试入口。
- 输出：最小研究记录、必要的新 Task、已有相关 Task 的证据/范围补充与导航索引；现成 REQ-0002/REQ-0004 足够承载目标，不另造产品需求或重复 Plan。
- 串行调查与写文档；没有多 Agent 授权、不创建代码 Worktree。仅只读命令及隔离临时夹具允许作为事实核验，不访问真实 SSH/Provider/用户状态。
- 共享路径为 Task/研究/缺陷索引与当前版本 release notes。后续代码 Task 的潜在并发与冲突单独登记，不等于现在派工。

## Given / When / Then

1. Given 已有规划；When 对照实现与索引；Then 同一 concern 续接，独立边界才新增 Task，不把历史 done 全部重开。
2. Given 潜在风险；When 源码或隔离探针只能证明部分；Then 明确事实、假设、证据置信度与未执行项，不伪造生产事故或根因。
3. Given 本轮仅要求建 Task；When 交付；Then 无产品/测试/流水线实现 diff，每项有目标、不做项、Owner、依赖、验收与具体验证命令。

## 验证与交付标准

核对编号、来源、链接、索引/frontmatter、任务依赖与写路径；运行 Project/Worktree/文档链接门禁和 git diff --check。可复用此前日志但明确是历史证据，不为建档重跑所有包或真实 UI。只读测试选择计划和必要的自有临时目录故障注入可新增调查证据。

人工产品验收不适用；完成标准为规划文件实际存在且合同/链接检查通过。后续功能 Task 保持 ready/draft，未获得本轮实施授权。立项时工程调查进行中、集成 pending；技术评审为自审；本轮不发布、不操作稳定分支、不清理原 Worktree。

## 调查产物与自审

新增 RESEARCH-0019、后续 TASK-0173～0178 六项和 BUG-0060/0061/0062；细化既有 TASK-0168/0169 并补 BUG-0059 的单 worker 历史反例，纠正 PLAN-0014 把已集成首批仍当作 WIP 的当前描述。

已执行：只读 SSH 测试选择计划；原子写入五种自有临时目录 I/O 注入；manager 成功迟到状态探针；纯合成 known_hosts 与真实宿主校验决策探针。上述探针未读取任何真实 SSH 文件或访问网络/Provider；另只读获取 OpenBSD 公开 sshd(8) 手册核对撤销语义。源码自审纠正了 known-hosts.ts 的职责归属：它是纯解析，文件读写在宿主；包内真实本地读取是 IdentityFile/helper 二进制。

没有修改产品/测试/CI 实现，没有新建代码 Worktree。六个后续 Task 与两个续接 Task 的 ready/draft 是计划状态，不是工程完成或用户授权实施。下一步只验证文档/索引并提交本轮规划。

## 规划交付与验证（2026-10-02）

- 已交付：六个后续 Task（0173～0178）、两个既有 Task（0168/0169）的合同细化、一份研究 RESEARCH-0019、三个隔离复现 Bug（0060～0062），同步 BUG-0059 与 PLAN-0014 的当前事实。
- 优先顺序：0178 撤销主机密钥拒绝 → 0175 写入完整性 → 0169 失效代次；随后 0173 时序诊断与 0168→0174 测试注册，0176 测量后提速，0177 文档与实际支持面保持一致。
- 实际文档检查：20 个变更 Markdown 的文件目标链接 0 错误；check-project-indexes、check-task-worktrees（178 Task、0 warning）、check-agent-guide、workflow-skills 与 git diff --check 均通过。链接检查不覆盖标题锚点。已回读各新增 Task 与索引的状态/依赖，运行时、测试源码和 CI 配置改动为 0。
- 实验：只读 test:changed 计划与 test:impact dry-run；五种原子写入 I/O 模式；manager 的失效后迟到成功；合成 known_hosts + 真实宿主校验链。探针全部只使用源码、自有临时文件或完全受控 I/O，没有读取真实用户 SSH 数据、访问 Provider/主机或改认证逻辑。
- 未运行：产品全量测试、类型检查/完整 check、构建、跨平台实机与真实 UI/Provider；本次无运行时变更，按文档政策执行专项验证。TASK-0171 的重型测试结果和耗时仅作为历史证据，不计作本轮实跑。
- 技术评审为源码/文档自审，没有独立 Agent 评审；规划文件归入本记录所在的本地 main 文档提交。未推送、未发布、未清理 Worktree。完成的是建档工作，各未来功能 Task 未实施、未验收。

补充验证：`bun run check:quick -- <本轮20个Markdown路径>` 退出 0（Biome 与全套 guards）；其中 upstream/dev ref 不存在时沿用既有固定基线，未更改基线/豁免。公开手册只作为规范证据，不包含用户数据或新的开发指令。
