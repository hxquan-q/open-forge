---
id: BUG-0038
type: bug
status: verifying
priority: P1
owner: apps/desktop scripts (ui-verification)
requirement:
plan:
source: VERIFY-0010 实机验收中执行 `verify:ui:debug -- runtime-canary`
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
created: 2026-09-26
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# Runtime Canary 的 Action RPC endpoint 契约不一致：Desktop 写在 Profile 路径，host/runner 只认 Canary home，canary 必失败

## 用户流程

- Given：需要验证真实 Desktop 主进程的生产 Runtime（会话创建、二代重启恢复、Tool Loop、锁释放）
- When：按 `docs/dev/README.md` 的流程执行 `bun run verify:ui:start -- --runtime-canary` ⇒ 等待状态 `ready` ⇒ `bun run verify:ui:debug -- runtime-canary`
- Then：canary 通过单文件 Vetta CLI 驱动真实会话并给出各项断言结果

## 实际行为

canary 在第一次 CLI 调用就失败，永远走不到任何断言：

```text
首次调用：
{"ok":false,"error":{"message":"EBUSY: resource busy or locked, uv_spawn"}}

重跑：
Vetta CLI failed with code 3
stdout: {"ok":false,"error":{"code":"LOCAL_RPC_SERVER_NOT_FOUND",
  "message":"ENOENT: no such file or directory, open
   '…\\vetta-ui-verification\\04987e4e\\fresh\\runtime-canary\\1790368644998-42072\\home\\action-server.json'"}}
```

## 期望行为

canary 模式下 Desktop 把 Action RPC endpoint 写在 canary home，`verify:ui:debug -- runtime-canary` 能通过同一路径连上，并按文档验证会话创建、二代重启恢复、Tool Loop、锁释放与 endpoint 清理。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：`main` @ `53995f8c7`；Windows 11；`bun 1.3.14`；fresh Profile `04987e4e`
- 命令与观测：
  - `bun run verify:ui:start -- --runtime-canary` → 状态 `running/ready=true`，`desktopGeneration=1`，`runtimeCanary.installedCliPath=…\home\agent\bin\vetta.exe`，provider pid 已启动
  - `bun run verify:ui:debug -- runtime-canary` → 上述两条失败
- 关键事实（同一实例）：
  - 实际存在的 endpoint 文件：`…\\vetta-ui-verification\\04987e4e\\fresh\\action-server.json`（140 B，写入时间 = 实例启动后 3 秒）
  - `host.log`：`[debug-ui-cdp] renderer CDP configured { endpoint: 'http://127.0.0.1:40978' }`，同一进程日志中的 `endpointFilePath: '…\\fresh\\action-server.json'`
  - canary home（`…\\fresh\\runtime-canary\\1790368644998-42072\\home`）下**没有** `action-server.json`（其它目录齐全）
  - `…\\fresh\\runs\\<uuid>\\home` 下也没有
- 基线对照或重跑结果：连跑两次，差异只在第一次的 `EBUSY`（首次安装竞态）；路径不匹配稳定复现

## 最小复现

1. `bun run verify:ui:stop`（确认没有实例在跑）
2. `bun run verify:ui:start -- --runtime-canary`，等 `bun run verify:ui:status` 报 `ready=true`
3. `Get-ChildItem …\fresh -Recurse -Filter action-server.json` → 只有 `…\fresh\action-server.json`
4. `bun run verify:ui:debug -- runtime-canary` → `LOCAL_RPC_SERVER_NOT_FOUND`

## 影响

- `verify:ui:debug -- runtime-canary` 在当前仓库状态下不可能通过，Runtime Canary 这条 Desktop 生产边界验收手段整体不可用；文档承诺的会话创建、二代重启恢复、遗留交互处理、宿主 MCP Tool Loop、锁释放、endpoint 清理等断言均无法实际执行。
- 无用户可见影响；影响的是发布前验证能力（`docs/dev/README.md` 把它列为 Runtime 进程级 Canary）。

## 根因证据

```text
apps/desktop/scripts/ui-verification-profile.ts:150
  VETTA_ACTION_RPC_ENDPOINT_FILE: layout.endpointFile        # fresh → <runtimeRoot>/fresh/action-server.json

apps/desktop/scripts/ui-verification.mjs:58-67  resolveVerificationEnv
  canary 分支只覆盖 VETTA_HOME / VETTA_CODING_AGENT_DIR / VETTA_DESKTOP_RUNTIME_CANARY，
  没有覆盖 VETTA_ACTION_RPC_ENDPOINT_FILE

packages/action-rpc/src/endpoint-file.ts:66
  const envPath = process.env[ACTION_RPC_ENDPOINT_FILE_ENV]  # 显式 env 优先于按 VETTA_HOME 派生
  → Desktop 按 Profile 路径读写 endpoint

apps/desktop/scripts/runtime-canary-runner.ts:134
  const endpointFilePath = join(state.runtimeCanary.vettaHome, "action-server.json")
apps/desktop/scripts/ui-verification.mjs:511 / :551
  const endpointRemoved = !existsSync(join(runtimeCanary.state.vettaHome, "action-server.json"))
  → host 与 runner 都只认 canary home 的路径
```

三方对同一份合同给出了两个不同路径：Desktop 用 Profile 路径，runner 与 host 用 canary home 路径。

## 回归测试

建议在 `apps/desktop/scripts/ui-verification-*.test.ts` 增加断言：canary 模式下由 `resolveVerificationEnv`/`createProfileEnvironment` 产出的 `VETTA_ACTION_RPC_ENDPOINT_FILE` 必须与 `join(state.runtimeCanary.vettaHome, "action-server.json")` 相同（纯环境构造，可直接单测，不需要启动 Electron）。

## 修复与验证

- 修复（2026-09-26）：把 canary 模式的环境派生收敛成 `apps/desktop/scripts/ui-verification-profile.ts` 的纯函数 `createUiVerificationEnvironment(layout, canary)`——canary 下统一把 `VETTA_ACTION_RPC_ENDPOINT_FILE` 指向 `join(canary.vettaHome, "action-server.json")`，同时覆盖 `VETTA_HOME` / `VETTA_CODING_AGENT_DIR` / `VETTA_DESKTOP_RUNTIME_CANARY`；`ui-verification.mjs` 的 `resolveVerificationEnv` 改为调用它。Desktop、host 与 runner 从此共用同一路径合同。
- 测试：`apps/desktop/scripts/ui-verification-profile.test.ts` 新增「canary env keeps Desktop, host and runner on the canary home endpoint file」：断言 canary 下 endpoint 文件 = canary home 的 `action-server.json`、且不等于 Profile 的 `endpointFile`，非 canary 仍用 Profile 路径。5/5 通过。
- 检查：`bun run check` 的 lint / 类型（含 `apps/desktop/scripts/**` 的 `scripts/**/*.test.ts` 收集）通过；`check:guards` 仅 `task-worktrees` 红（与本修复无关，见 BUG-0037 的并行情况）。
- 未运行及原因：`bun run verify:ui:debug -- runtime-canary` 的**完整端到端重跑未执行**（串行两次 Desktop 生成 + 本地产 provider 需要较长时间，本轮预算用于产品侧修复与验收记录）。因此 canary 的会话创建 / 二代重启恢复 / Tool Loop 断言仍未取得实机证据。
- EBUSY 竞态已修（2026-09-26）：`runtime-canary-runner.ts` 的 `runVettaDebug` 改走
  `runProcessWithSpawnRetry`——spawn 报 `EBUSY`/`EPERM`（CLI 刚安装完仍被占用）
  时做最多 10 次 × 300ms 的有界重试，其余错误不吞、不延时。
- 仍开放：`bun run verify:ui:debug -- runtime-canary` 的完整端到端重跑未执行
  （串行两代 Desktop + 本地产 provider），会话创建 / 二代重启恢复 / Tool Loop /
  锁释放仍待实机证据；保持 verifying。
