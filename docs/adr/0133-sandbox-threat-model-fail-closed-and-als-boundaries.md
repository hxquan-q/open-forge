<!-- Copyright The Open Forge contributors. -->
# ADR-0133：沙箱威胁模型、Fail-Closed 语义与 ALS 失败边界

## 状态

提案（威胁模型与 ALS 边界作为测试合同随本次实现落地；fail-closed 语义已实现，见 `packages/coding-agent/src/execution/sandbox/errors.ts`）

## 背景

`SessionExecutionMode = "sandbox" | "full-access"` 已经落在 `packages/runtime-core/src/contracts.ts`，三平台 OS 级 spawn 包装都已有实现：

- Linux `packages/runtime-node/src/sandbox/commands/linux-bubblewrap.ts`（bwrap，`--unshare-pid/--unshare-ipc/--unshare-uts`+ ro-bind/binds）
- macOS `packages/runtime-node/src/sandbox/commands/macos-seatbelt.ts`（`sandbox-exec`+ 动态生成 profile）
- Windows `packages/runtime-node/src/sandbox/commands/windows-host.ts`（外部 `codex-windows-sandbox-host.exe`，`--policy workspace-write`,`--network none`)

但有三个未决问题：

1. **没有威胁模型**：社区反复出现的 symlink escape、env 注入、network exfil、Windows binary 替换、grant 跨 turn 残留这五类问题，没有任何一份文档把"我们认"与"我们不认"的边界写清。
2. **fail 行为不一致**：`createNodeSandboxHost` 在不支持平台返回 `undefined`；`createCodingAgentSandboxToolRegistrations` 因此返回 `[]`；`buildModeRegistrations` 在 sandbox 分支会继续往下走，结果是 sandbox 模式下四个核心工具全消失，只剩 `task_output/task_stop`——比"没有沙箱"更糟。
3. **AsyncLocalStorage 失败边界没有测试合同**：`sandbox-permissions.ts:19 shellGrantStorage` 的 `run/get` 在并发、跨 turn、跨 session、callback throw、cwd 不匹配、mode flip 中途这六种情形下的行为没有被任何一份测试锁定。

`buildModeRegistrations` 的 fallback 漏洞是 P0，必须由 ADR 先记录这次修复的设计动机，避免后续当作"普通 bug"被回滚。

## 决策

### 1. 威胁模型（TM-01..TM-08）

| 编号 | 攻击 | 现实 | 决策 |
| --- | --- | --- | --- |
| TM-01 | Workspace 内 symlink → 敏感路径（`.ssh`、`.aws`) | TS 层 `resolveNodeWorkspacePathAccess` 已做 `realpath` + `isWithinRoot`，已堵静态逃脱 | 接受真实 IO 与 path check 之间的 TOCTOU 窗口为残余风险，加 symlink/UNC/case-mixing 回归测试 |
| TM-02 | Grant root 升级：批 `/tmp/foo` 后 `ln -s /tmp/foo/evil /etc` | `wrapShellPermissionGuard` 拦 `ln` 但只查写参数 | 接受，已测试反向 redirect 与 `ln` 的 source/target 都在写清单内 |
| TM-03 | Env 注入（`.npmrc`、`PIP_CONFIG_FILE`、`LD_PRELOAD`) | Linux/macOS/Windows 三端在内置 `ENV_WHITELIST` 名下传入子进程，未在白名单内的环境被 `--clearenv/--clear-env` 清掉 | 接受，已有 whitelist；新增测试断言 workspace 写入 `.npmrc` 不影响 spawn 出的进程 |
| TM-04 | `VETTA_WINDOWS_SANDBOX_HOST_PATH` 指向恶意 exe | 只校验 `existsSync` | 已知风险，记录但**本 ADR 不修复**；后续引入签名 + 校验和验证 |
| TM-05 | `AsyncLocalStorage` 跨并发 / 跨 turn 泄漏 | Node ALS 是 per-async-context；现有 `node-sandbox-host.test.ts` 已锁 turn 内隔离 | 把并发 + throw + cwd 不匹配 + mode flip 中途这四种剩余边界写成测试合同（见 §3) |
| TM-06 | Grant write root 内 `cp ~/.ssh/id_rsa .` 再 `curl` 上传 | Linux/macOS sandbox 不隔离网络；Windows `--network none` 已设 | 承认 + 文档化：Linux/macOS 下"sandbox ≠ 防 exfil"，防 exfil 是 full fail-closed 之后才能落地的后续工作，记入备选方案 |
| TM-07 | Mode flip 时旧 sessionGrant 还在 cache | 现状 grant 永久绑定 sessionId，与新 mode 无关 | mode flip 必须清空 sessionGrant；`sessionGrantStore.clear()` 进入 flip 路径 |
| TM-08 | pi-compat tool 通过 native tool 间接达到同样效果（`bash`) | pi-compat tool 没有 OS spawn wrap，只能调 native `bash`/`shell` | 接受，pi-compat tool 的 sandbox surface 默认 `path-only`；经 native 调到 `bash` 时由 Layer 3 拦截 |

### 2. Fail-Closed 语义

新增单一顶层异常（`packages/coding-agent/src/execution/sandbox/errors.ts`,公开入口 `@vetta/coding-agent/sandbox/errors`）:

```typescript
export type SandboxFailureKind = "platform-unsupported" | "asset-missing";

export class SandboxUnavailableError extends Error {
  readonly kind: SandboxFailureKind;
  readonly platform: string;
  readonly remediation?: string;
}
```

`kind` 只保留两个实际可达的值,都产生于会话装配阶段:`createToolSet` 返回 `undefined`（宿主声明无沙箱/平台不支持）→ `platform-unsupported`;`createToolSet` 同步抛错（bwrap / sandbox-exec / Windows host / shell 的路径解析失败）→ `asset-missing`,原始错误保留在 `cause`,修复指引随 `error.message` 一并给出,宿主不按类型分流也能让用户看到下一步。tool 执行期的 spawn 失败、授权拒绝走各自工具的错误路径,不在这里冒充「沙箱不可用」。

**Fail 行为表**(写在 ADR 就视为合同，任何一处违反属于回归）:

| 触发点 | 场景 | 行为 |
| --- | --- | --- |
| `createNodeSandboxHost` | `platform ∉ {win32,linux,darwin}` | 返回 `undefined` 由调用方处理；**`buildModeRegistrations` 收到空 toolSet 必须 fail-closed**（见下） |
| `windows-host/linux-bubblewrap/macos-seatbelt` 启动 | binary 不存在 | 抛 `SandboxUnavailableError(kind="asset-missing", remediation="...")`，会话创建中止 |
| `authorization-session-extension.request()` | `CODING_AGENT_SANDBOX_AUTHORIZATION_FUNCTION` 未注册 | 返回 `"deny"`（已有，正确） |
| `wrapWorkspaceGuard` / `wrapShellPermissionGuard` | 显式 deny | 抛 `Access denied by sandbox`（已有，正确） |
| `runWithShellGrant` → spawn child 失败 | bwrap 启动错误 | 把起 spawn 错误透传，**tool 执行失败**，不降级 |
| `buildModeRegistrations`(session runtime) | sandbox 模式但 `createCodingAgentSandboxToolRegistrations` 返回 `[]` | **抛 `SandboxUnavailableError(kind="platform-unsupported")`，会话创建失败**，不允许继续以残缺工具集跑 |

**唯一 escape hatch**：环境变量 `VETTA_SANDBOX_FAIL_OPEN=1`。

- 仅紧急迁移使用；
- 必须往 stderr 打 warning:"sandbox unavailable, running without OS-level containment";
- 不接受从 settings/配置文件设置；
- **该变量在任何构建（含打包版）下都生效**。不使用 `NODE_ENV` 做生产判别——打包后的 Electron 主进程通常不设置它,判别形同虚设;设置该变量即显式放弃沙箱 containment 提示,是用户主动拉开的逃生口,风险由设置者承担。

**兼容性影响**（实现时确认的事实）：

- `RuntimeHost` 的默认执行模式是 `sandbox`(`runtime-host.ts` `getDefaultExecutionMode`)。宿主若声明无沙箱环境（`createToolSet: () => undefined`,如远程项目分支与无沙箱测试装置）同时吃默认值，此前表现为「会话创建成功但四个核心工具整组消失」的死会话——正是本 ADR 要消除的缺陷；fail-closed 生效后这类组合会在会话创建时显式失败。
- 因此，声明无沙箱的宿主必须显式为会话传 `executionMode: "full-access"`(Desktop 远程项目已由 `resolveProjectExecutionMode` 强制),测试装置同理(`apps/cli-host/test` 的无沙箱 fixture 已随本 ADR 显式化)。
- Windows 开发环境若未 staged `codex-windows-sandbox-host.exe`,默认 sandbox 的会话创建会失败并给出安装指引;发布流水线的 staging guard 保证打包版本不受影响。

### 3. AsyncLocalStorage 失败边界

`AsyncLocalStorage` 在我们的代码里只有两种消费：`runWithSandboxShellGrant(cwd, grant, callback)` 与 `getSandboxShellGrant(cwd)`。为防止"读到了不该读到的 grant"，把以下五条边界写入测试合同：

| # | 边界 | 期望行为 | 对应测试 |
| --- | --- | --- | --- |
| ALS-1 | 同一 session 同一 cwd 顺序两次 grant | 第二次 `getSandboxShellGrant` 拿到第二次的 grant，callback 外为 `undefined` | 已有 `node-sandbox-host.test.ts` |
| ALS-2 | 同一进程并发两个 session 各自 `runWithShellGrant` | 两边的 `getSandboxShellGrant` 各自只看见自己的 grant，不互串 | 新增 |
| ALS-3 | callback 内同步 throw | throw 不会污染外层，外层 `getSandboxShellGrant` 为 `undefined` | 新增 |
| ALS-4 | run 后 spawn cwd 不等于 grant 时注册的 cwd | `getSandboxShellGrant(otherCwd)` 返回 `undefined` | 新增 |
| ALS-5 | mode flip 中途：tool 被发起时 mode=sandbox 且 ALS 已带 grant；用户切到 full-access;tool 继续执行 | tool 沿用其被发起时的 grant 完成执行，**新 mode 不回溯影响**；下一次 tool 调用才走新 mode | `packages/runtime-core/test/runtime-host/execution-mode-turn-boundary.test.ts`("keeps a running Turn on its admitted mode and applies the update before the next Turn"):运行中的 Turn 停留在其获准的 mode,reconfigure 在下一 Turn 前生效——这正是 ALS-5 的运行时承载,grant 的跨异步可见性窗口另由 `sandbox-als-boundaries.test.ts` 锁定 |

### 4. Full-Access 路径的改名与最小防线

历史命名 `Layer 2'`(defended-defaults）暗示有防线，但实际上 full-access 不做 workspace containment、不做 OS spawn wrap，只应保留 `~/.ssh/~/.aws/...` 这条敏感路径 deny。

- 函数命名：`createSensitiveOnlyGuardToolRegistrations()`，与 `createCodingAgentSandboxToolRegistrations()` 并列在 `tool-registrations.ts`;
- 文档/comment中不出现"沙箱"二字，改用"敏感路径拒绝层";
- 用户文档与设置页面对 full-access 的提示语必须明说：full-access = 仅默认拒绝极少数高敏感路径，**不是沙箱**。

### 5. Mode Flip 时清空 Session Grant

`RuntimeHost.setExecutionMode()` 落到 session execution controller 的 `reconfigure` 后，在装配新工具集**之前**:

1. 检测到 mode 实际变化即调用 `environment.sandbox.clearSessionGrants(sessionId)`——这是 `CodingAgentSandboxEnvironment` 上的合同方法,由 Node SDK 与 Desktop 宿主环境接线到 runtime-node 的 session grant store(两处接线各有合同测试钉住);远程项目等无沙箱环境可不提供该方法;
2. 即使后续装配失败(如切向 sandbox 但沙箱不可用),grant 也已被清空——flip 失败不会把旧授权留在缓存里;
3. 在下一次 tool 执行时，上次 mode 下批准过的 grant 不再生效；
4. flip 中途正在执行的 tool 不受影响（ALS-5)。

这条规则覆盖 TM-07 给出的 grant 残留风险。

## 备选方案

| 方案 | 未采纳原因 |
| --- | --- |
| 每次 mode flip 保留 sessionGrant 且只对 full-access 保留 | TM-07 场景下 sandbox→full-access 会把 sandbox 的 grant 原封保留给 full-access；但 full-access 本来就无 IAM 提示，grant 没有实际副作用，可保留；但反方向（full-access→sandbox）把 full-access 的"未询问"语义带到 sandbox，导致用户被意外弹窗为新 grant，UX 更糟；清空最简洁且一致 |
| 在 Linux bwrap 加 `--unshare-net` + 沙箱外 HTTP proxy | 工程量太大，与"认可 Linux sandbox 不防 exfil"互为替代；本 ADR 选择明确文档化不防 exfil，后续做成独立 ADR |
| `cwd` 不匹配时 `getSandboxShellGrant` 返回最近一次的 grant | 破坏 ALS 的 per-async-context 隔离；"近似 cwd"匹配引入目录穿越风险 |
| 把 OS spawn wrap 也加到 read/write/edit（把 tool 实现换成 `cat` / `Get-Content`) | 引入性能大幅回退与大量 Unicode/streaming 兼容性问题；用 TS path check + symlink realpath + 持续威胁模型 review 是更合理的边界 |

## 后续工作（不在本 ADR 范围）

- Linux `--unshare-net` + sandbox proxy（独立 ADR)
- Windows `codex-windows-sandbox-host.exe` 签名/校验和（独立 ADR)
- pi-compat tool `sandboxSurface` 字段（excluded / path-only / fully-wrapped)
- deny error 文本带 grantRoot + capability + hint,agent 可自我学习提权
- Desktop UI 按 `SandboxFailureKind` 映射 i18n 文案:`SandboxUnavailableError.message` 是面向开发者的英文诊断文本,桌面端展示前应按 kind 走 i18n key（公开入口 `@vetta/coding-agent/sandbox/errors` 已就绪),避免英文原文直接进用户界面
