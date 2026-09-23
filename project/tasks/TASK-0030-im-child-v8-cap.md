---
id: TASK-0030
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P0-2
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/main/im-host]
write_paths: [apps/desktop/src/main/im-host, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# IM coding-agent 子进程 V8 老生代上限

## 目标

每个 IM 会话派生的 coding-agent 子进程无内存参数，默认老生代可膨胀至 ~4GB 才被系统压制。注入 2048MB 上限：超限抛 RangeError，由 sidecar 既有退避重启（5s/15s/60s ×5）接管，可诊断而非静默膨胀；会话事实在 JSONL，重启可恢复。

## 方案

`buildCodingAgentSpec` 按平台注入真实 argv：Windows（ELECTRON_RUN_AS_NODE）用 node 式 `--max-old-space-size=2048`（脚本前）；GUI Electron 形态（mac/linux/dev）用 Chromium `--js-flags=--max-old-space-size=2048`，置于 `--agent-rpc` 前由 Chromium 在 ContentMain init 解析（与 --no-sandbox 同理）。

## 验证

`coding-agent-spec.test.ts` 5/5（Windows 前缀更新 + mac/linux js-flags 用例新增）；`check:quick` 通过。发布说明 v0.5.59「改进」已补条目。

## 实施摘要（2026-09-23）

- `coding-agent-spec.ts`：`CHILD_MAX_OLD_SPACE_MB=2048` 常量 + 三平台 prefixArgs 注入。
- 测试：既有 Windows 断言更新（新前缀含上限标志），新增 GUI Electron 形态用例（darwin/linux 平台 mock）。

## 并发结论

支持（im-host 独立目录）；主会话串行执行。
