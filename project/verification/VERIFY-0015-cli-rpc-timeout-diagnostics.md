---
id: VERIFY-0015
type: verification
status: done
priority: P1
owner: cli-host tests
source: TASK-0173; BUG-0059
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0173, TASK-0170, TASK-0176]
related_issues: []
related_bugs: [BUG-0059]
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# CLI RPC 等待超时的分阶段诊断与复现对照

## 被验证合同

[BUG-0059](../bugs/BUG-0059-cli-rpc-concurrent-test-timeouts.md) 的偶发 RPC 超时需要不泄密的分阶段证据：`request()`/`waitFor()` 期限到点后，错误必须能定位预期 request id/command、子进程退出状态、启动/最近帧间隔与有界最近帧摘要（仅 `type/id/command`）；帧正文（Prompt、工具参数、凭据）不得进入诊断。诊断格式化是纯函数并有独立单测。

## 实现与合同测试

- `apps/cli-host/test/support/agent-rpc-test-process.ts`：`waitFor` 增加可选 `expectation`（`request()` 自动携带 id/command）；超时错误改由导出的纯函数 `formatRpcWaitTimeout` 生成——含预期身份、`child: pid/exit/signal`、`phase: ageMs/frames/sinceFirstFrame/sinceLastFrame`、`recentFrames(≤12)`（仅 type/id/command）与 `stderr(tail)`（2 KiB 有界，收敛原先无界的整段 stderr）。新增 `RECENT_FRAME_SUMMARY_LIMIT=12`、`DIAGNOSTIC_STDERR_TAIL_CHARACTERS=2048`。
- 单测 `test/agent-rpc-test-process.test.ts` 新增 3 例：快照格式化（预期身份/子进程状态/阶段数值）、启动阶段与已退出子进程形态、真实子进程超时不携带帧正文（`BODY-SECRET` 断言）。
- 安装制品探针 `test/installed-artifact-runtime.test.ts` 新增 1 例：真实 standalone 二进制上发送永不匹配等待（期限 750ms，同一到点机制，避免把 20s 默认期限挂进套件），断言错误含 id/command、running 子进程、phase 与最近帧摘要，且正文标记 `INSTALLED_DIAG_BODY_MUST_NOT_LEAK` 不出现。

## 环境与输入

Windows 11 Pro（10.0.26200）、Bun + Node runner（`scripts/quality/run-vitest.mjs`）、`--maxWorkers=1`、固定单文件顺序、同一快照（TASK-0173 实施树，基线含 8b63e0d02/521a1eac9/3bb76e5c8）。无真实 Provider（baseUrl 127.0.0.1:1 与本地假 server）、临时会话目录、安装制品由 `compile-standalone.mjs` 现场构建。

## 实际命令与结果（2026-10-03）

| 轮次 | 命令（cwd `apps/cli-host`） | 结果 |
|---|---|---|
| 安装制品 1 | `bun ../../scripts/quality/run-vitest.mjs run test/installed-artifact-runtime.test.ts --maxWorkers=1` | 14/14 通过（~80s，含新探针） |
| 安装制品 2 | 同上 | 14/14 通过（80.08s） |
| 安装制品 3 | 同上 | 14/14 通过 |
| 源码入口 1–3 | `bun ../../scripts/quality/run-vitest.mjs run test/agent-runtime-selection.test.ts --maxWorkers=1` | 3 轮各 9/9 通过 |
| 诊断单测 | `bun ../../scripts/quality/run-vitest.mjs run test/agent-rpc-test-process.test.ts --maxWorkers=1` | 5/5 通过 |

**复现结论：本轮 6 组串行对照 0 失败，未复现 BUG-0059 的偶发超时。** 依据合同不以单次/本轮通过关闭该 Bug；本轮交付的是到点即可用的分阶段证据与可重复对照方法，下一轮失败发生时错误信息可直接归因启动/请求处理/资源释放/夹具阶段。

## 未运行与剩余风险

- 未运行完整 CLI 包与全仓门禁之外的其他平台（macOS/Linux CI 将按 quality.yml 执行）。
- 未验证真实 Provider 或用户状态（合同禁止）。
- 探针期限 750ms 与套件内 20s 默认期限不同：到点机制相同，诊断字段相同；该偏差已记录在 Task。
- 偶发根因仍未定位：BUG-0059 保持 investigating，后续失败应携带新诊断证据回归本对照。
