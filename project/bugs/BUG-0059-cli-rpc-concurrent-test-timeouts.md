---
id: BUG-0059
type: bug
status: investigating
priority: P1
owner: cli-host tests
source: TASK-0162 changed-test validation
related_requirement: [REQ-0002, REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0170, TASK-0162]
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
