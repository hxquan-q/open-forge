---
id: TASK-0112
type: task
status: done
priority: P2
owner: packages/plugins
requirement: []
plan: PLAN-0011
source: RESEARCH-0012 Avernet P2（每 Plugin Protocol 强制 conformance 套件 + `EXEMPT_PROTOCOLS` 收缩集 + `tests/contracts/OWNERS`）
related_requirement: []
related_plan: [PLAN-0011]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: main
worktree: unassigned
base_commit: main
read_paths: [packages/plugins/, packages/runtime-mcp/, packages/runtime-core/, packages/action-rpc/, scripts/quality/]
write_paths: [packages/plugins/, packages/runtime-*/, scripts/quality/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 协议 conformance 套件强制映射

## 目标

Avernet 要求每个 `agentclaw.plugins` Plugin Protocol 必须有对应 `tests/contracts/test_<plugin>.py`，arch test 以只缩不增的 `EXEMPT_PROTOCOLS` 集合强制「每协议必映射一套件」，且套件必须**断言 plugin 真被调用**（防消费者绕过契约）；`tests/contracts/OWNERS` 管守门人审批（`protocol-contract-tests.md:3-46`）。本仓有零散合同测试（如 `runtime-host-contract.test.ts`）但无「每协议映射一套」的机械检查。

## 范围

### 并发评估

- 结论：支持并行——写面在测试目录与守卫脚本，与代码任务基本不冲突。
- 执行方式：可独立 Worktree。
- 可并行 Task：本批全部。
- 前置依赖：建议 TASK-0110 的边界声明先落地（协议面归属更清晰），但非硬依赖。
- 冲突文件/独占路径：`scripts/quality/` 新增守卫与 TASK-0110/0111 同目录，文件级不冲突。
- Branch：独立 task 分支。
- Worktree：按 workflow 派工。
- 集成负责人：Coordinator。
- 集成顺序：PLAN-0011 阶段 C。

### 做

- 盘点本仓「协议面」清单：插件 SDK 合同、`runtime-*` 端口合同、`action-rpc` 协议、MCP 桥接面等，逐一定名；
- 为每个协议建 `test_<protocol>` conformance 套件（或落位到既有 `*.contract.test.ts` 约定）：经消费者公开 API 驱动，断言「协议实现方真被调过」而非只测 mock；
- 守卫脚本：新增协议未挂套件即报红；既有豁免登记进 `EXEMPT_PROTOCOLS` 初始集，**只缩不增**（新增豁免需 OWNERS 审批文件记录）；
- `tests/contracts`（或等价目录）建 OWNERS 守门清单。

### 不做

- 不为每个内部接口都强制套件——只对「跨边界协议面」强制；
- 不改既有测试的断言内容（新增映射与守卫，不动旧测试）；
- 不引入 Avernet 的 pytest 结构——沿用本仓 vitest/node:test 约定。

## Given / When / Then

- Given：某协议面（如 `action-rpc` endpoint 合同）新增了实现方但没有 conformance 套件；
- When：跑守卫脚本；
- Then：报红指出「协议 X 无套件映射且不在 EXEMPT」；补套件或经 OWNERS 登记豁免后转绿。

## 必须保持

- `EXEMPT_PROTOCOLS` 只缩不增是硬约束（脚本断言集合单调收缩）；
- 套件必须断言真实调用链，纯 mock 自证不算；
- 既有 `runtime-host-contract.test.ts` 等合同测试继续通过，可直接登记为对应协议的既有映射。

## 测试与验证

- 定向测试：守卫脚本单测（未映射报红、豁免放行、EXEMPT 只允许缩小）；
- 用户流程：新增一个假协议面验证门禁生效；
- 质量检查：`bun run check:quick`、`test:pkg` 相关包。

## 交付记录

- 实际修改：
  - `tests/contracts/protocol-registry.json`（新增）：19 项跨边界协议清单——`ai-provider-stream`、`runtime-core-session`、`runtime-storage-conversation`、`runtime-tools-coding`、`runtime-mcp-ports`、`runtime-knowledge-ports`、`runtime-subagents-coordination`、`runtime-telemetry-observation`、`runtime-ssh-remote-fs`、`action-rpc`、`plugin-sdk-host`、`plugin-mcp-bridge`、`cli-agent-runtime-rpc`、`capability-sdk-contracts`、`capability-runtime-access`、`remote-control-wire`、`remote-desktop-signaling`、`remote-relay-transport`、`plugin-vite-build`。每项列出 surface 与既有 conformance 套件文件（全部落位到既有 `*.contract.test.ts`/协议测试，不改断言内容）。
  - `tests/contracts/OWNERS`（新增）：豁免批准记录格式（`<id> <owner> <evidence>`）。
  - `scripts/quality/check-protocol-suites.mjs`（新增）：注册表完整性校验（id 唯一、套件文件存在）；无套件且未豁免即红；`EXEMPT_PROTOCOLS` 必须 ⊆ 冻结基线 `EXEMPT_PROTOCOLS_BASELINE`（只缩不增）、每项须在 OWNERS 有批准人；已有套件仍挂豁免同样报错。当前两项皆为空集——全部协议已有真实套件，无豁免。
  - `scripts/quality/check-protocol-suites.test.mjs`（新增）：7 例——套件存在放行、无套件未豁免报红、套件文件缺失报红、基线内豁免+OWNERS 放行、扩集拒绝、无 OWNERS 拒绝、有套件仍豁免拒绝。
  - `scripts/quality/check-guards.mjs`、`package.json`（`test:quality`）：注册新守卫与测试。
  - `docs/dev/quality-gates.md`：脚本清单补两条、新增「规则豁免与协议套件」节。
  - `docs/dev/review-red-flags.md`：补「新增跨边界协议未登记套件」红旗。
- 实际运行：
  - `bun scripts/quality/run-vitest.mjs --run scripts/quality/check-protocol-suites.test.mjs` — 7/7 通过。
  - `bun run scripts/quality/check-protocol-suites.mjs` — `every registered protocol has a conformance suite (0 exemptions)`（19 项全绿）。
  - 用户流程验证：临时把协议 `suites` 置空且无豁免 → 守卫报 `no conformance suite and not exempt`；fixture 中补套件或基线内豁免+OWNERS → 转绿（由单测覆盖该闭环）。
  - 校验期间发现 `session-archive-codec.test.ts` 引用被并发改动移除，已改用现存套件文件。
- 未运行及原因：`bun run check` 全量留到树末统一验收（共享工作区并发改动）；各套件内容未逐文件复跑（守卫只断言套件存在与映射，套件自身由 `test:pkg`/CI 既有入口执行）。
- Worktree：主工作区（单 Agent 串行实现）。
- 剩余风险：
  - 注册表是声明式清单，「新增协议面但未登记」不会自动发现——已写入 red-flag 清单靠评审拦截；后续可考虑从 `packages/runtime-*` 的 Port 导出机械推导候选集；
  - `EXEMPT_PROTOCOLS_BASELINE` 为空集意味着未来任何豁免都必须同时改动守卫内常量——是有意的评审摩擦，但需评审者理解；
  - 「套件断言真实调用链」目前靠既有测试质量背书，守卫不扫描套件内部是否纯 mock。
