---
id: VERIFY-0001
type: verification
status: done
owner: runtime-core/desktop/ai
source: C:\Users\xquan\.vetta
created: 2026-09-22
updated: 2026-09-22
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
related_bug: [BUG-0001, BUG-0002, BUG-0003]
---
<!-- Copyright The Open Forge contributors. -->

# 本地 Vetta 性能/可靠性基线

## 证据

- 原版 EXE：Vetta `0.5.58`、Electron `34.5.8`、Windows x64；
- DeepSeek Responses 流协议错误；
- Agent Team 成员 Turn 约 248 秒；
- Compaction 约 34–43 秒并出现失败；
- App Monitor 汇总与主日志不一致；
- 一次 GPU 快照：RTX 3060 Laptop 6GB，GPU 使用约 2.4GB/25%；
- 一次 Vetta 五进程 Working Set 合计约 768MiB。

## 限制

这是本地日志和即时采样基线，不是完整最小复现，也不是跨机器 Benchmark；未读取 auth/models/mcp 凭据文件，未运行真实 Provider。

## 下一步

转入 `TASK-0002`、`TASK-0003`、`TASK-0004`，用 fake Provider/Tool/Runtime fixture 建立可重复验证。
