---
id: BUG-0059
type: bug
status: investigating
priority: P1
owner: cli-host tests
source: TASK-0162 changed-test validation
related_requirement: [REQ-0002, REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0170, TASK-0162, TASK-0173, TASK-0172]
related_issues: []
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# CLI 进程型测试并发执行时 RPC 超时

## 实际行为与证据

TASK-0162 隔离树的默认 CLI 全包回归有 9 项 RPC 超时；同一五文件集合以默认 2 worker 复跑为 16 failed / 15 passed。基线 TASK-0148 上单独的目标占用用例通过。只把本集合改为 --maxWorkers=1、保持所有断言和超时，5 文件 31 测试全部通过。

## 期望与影响

进程型测试需要可重复地验证 JSONL、会话所有权、取消与安装制品；独立文件的测试调度不应挤占每个子进程的既有期限。未证明 CLI 产品协议有缺陷，也不把单次单跑通过当成全面无回归。

## 根因与回归计划

证据表明失败与跨文件并发相关，底层具体资源/fixture 争用未完全定位。TASK-0170 为 CLI 标准测试入口采用单 worker，保留用例内部并发场景、全部断言、既有超时和测试集合，并运行完整 CLI 包与质量检查。若串行仍失败，继续调查，不通过延长超时或删除用例处理。

无真实 Provider、用户状态或 Desktop 访问。详细命令与结果留 Task；未关闭。

## 集成后新增证据（2026-10-02）

TASK-0171 的首轮全包测试在显式单 worker 下仍出现 installed-artifact-runtime 两例 RPC 超时；随后单文件 13/13、完整 CLI 226 项和最终整批均通过。并发相关性不是充分根因，单次成功不能关闭本 Bug。详细事实沿用 TASK-0171，本轮没有重跑 CLI。

新增 TASK-0173 专门建立分阶段、安全有界的诊断及可重复对照；不重复 TASK-0170 已完成的调度补丁。保持 investigating，未确认是首帧、资源、夹具还是生产协议问题。

## 诊断落地与对照（2026-10-03，TASK-0173）

`waitFor`/`request` 超时错误现已携带预期 id/command、子进程退出状态、启动/最近帧间隔与仅含 `type/id/command` 的有界最近帧摘要（帧正文不进入诊断），格式化为纯函数并配独立单测；安装制品套件含真实二进制上的永不匹配探针。同快照 6 组串行对照（安装制品 3 轮 + 源码入口 3 轮，均 `--maxWorkers=1`）全部通过，本轮未复现。根因仍未确认，保持 investigating；下次失败应凭新诊断字段直接归因阶段。证据见 [VERIFY-0015](../verification/VERIFY-0015-cli-rpc-timeout-diagnostics.md)。

## 追加证据：全批负载下的首次实测复现（2026-10-03，TASK-0176 全批运行）

41 包有序全批（cli-host 在 desktop 之后执行）中，installed-artifact 的**新诊断探针用例**超过 Vitest 默认 5s 测试期限失败（同会话单文件 4 次通过、单包全量通过；失败的是「起安装制品 + 一次 get_state + 750ms 探针」的整体用时，非 RPC 帧等待本身超时）。这首次在受控条件下实测到「全批负载会显著拖慢单用例墙钟」的现象，与 BUG-0059 的资源争用假设方向一致；已为该用例补显式 60s 期限（a96b6f0ea，断言与探针期限不变）。仍不构成根因结论：既有偶发 RPC 帧超时与本例的超时层级不同，保持 investigating。
