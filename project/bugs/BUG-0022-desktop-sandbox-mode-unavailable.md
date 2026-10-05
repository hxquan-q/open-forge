---
id: BUG-0022
type: bug
status: blocked
priority: P1
owner: apps/desktop; packages/runtime-node
source: user-report; screenshot; source inspection
related_requirement: []
related_plan: [PLAN-0001]
related_tasks: [TASK-0016, TASK-0019]
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-24
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 当前环境无法启用沙盒执行模式

## 用户流程

- Given：用户在本机项目中创建或继续会话，并希望以受限沙盒运行命令。
- When：用户打开输入区的执行模式选择器并尝试选择“沙盒受限”。
- Then：受支持的本机环境应能启用沙盒；若当前安装确实不具备沙盒能力，应显示明确原因和可恢复指引，不能让用户误以为权限隔离已经生效。

## 实际行为

用户报告此前讨论的权限与沙盒没有实现。截图中“沙盒受限”选项灰显不可选，“完全访问”处于选中状态。截图没有展示禁用提示/沙盒探测结果，因此无法判断是缺少 Windows sandbox host、能力探测失败，还是安装包未包含所需组件。

## 期望行为

受支持的 Desktop 安装应提供可工作的本机沙盒模式；不可用时，产品应明确告知原因和实际执行模式。沙盒模式与逐工具审批应分别呈现，不能把“完全访问”误解为仍有路径隔离。

## 最小复现

1. 在当前 Windows Desktop 本机项目中打开输入区的执行模式选择器。
2. 尝试选择“沙盒受限”。
3. 记录 `window.vetta.config.get()` 返回的 `sandbox.status/reason/details`、host binary 探测结果和应用安装类型；确认沙盒选项为何被禁用。

## 影响

用户无法选择受限执行模式，且当前会话显示为“完全访问”；在原因解释不足时，用户可能错误判断命令执行的隔离边界。优先级为 P1，直到验证当前执行路径和安全提示。

## 根因证据

- `apps/desktop/src/renderer/domains/conversation/hooks/useExecutionModeSelectorModel.ts:70` 查询主进程沙盒能力；`:83-105` 在沙盒不可用或远程项目时禁用该选项，并以完全访问作为有效模式。
- `apps/desktop/src/main/sandbox/capability.ts:325` 探测 Windows sandbox host；缺少 host 或其能力不足会返回 `status: "unavailable"`，`:351-361` 对缺失的强制隔离能力 fail closed。
- `packages/runtime-node/src/sandbox/commands/windows-host.ts:46` 解析 Windows host 路径；仓库实现依赖可解析的 host binary，不能仅凭 Renderer 中的选项断言沙盒功能完全不存在。
- `TASK-0016` 的交付记录包含 L0-L4 Tool Risk/Approval、Project Trust 与 Desktop 审批 UI；这是逐工具授权，不等同于操作系统/进程沙盒，也不能证明当前会话的每项操作都已通过真实端到端验证。
- 当前未取得用户这台实例的 sandbox capability 快照或 host 探测日志，具体不可用原因未确认。

根因置信度：中；禁用选择器的行为由截图与代码共同确认，具体安装/探测失败原因待收集。

## 回归测试

- 尚未新增。定位后覆盖受支持本机环境启用沙盒、能力缺失时清楚说明且不能误选、远程项目不可用时仍保持明确提示；执行边界需由 Runtime/host 集成合同验证，不能只测 Renderer 选项状态。

## 修复与验证

### 实机采证（2026-09-25，隔离 dev 实例，用户授权）

`window.vetta.config.get()`（原样，经 Renderer 自己的 host-api 读取）：

```json
"sandbox": {"status":"unavailable","backend":null,"platform":"win32",
  "reason":"binary_not_found",
  "details":"No bundled or configured Windows sandbox host binary was found.",
  "checkedAt": <实例启动时刻，非实时重探>}
"defaultExecutionMode": "full-access"
```

- `features` 键不存在：`capability.ts:326-336` 在 host 未解析时提前返回，不带该字段。
- 磁盘核对（全部实测）：`packages/runtime-core/sandbox/` 只有 `docs/`，**没有 `bin/`**；全仓（排除 node_modules）无任何 `*sandbox-host*.exe`；`VETTA_WINDOWS_SANDBOX_HOST_PATH` 未设置；本机**没有已安装的 Open Forge**（`%LOCALAPPDATA%\Programs`、Program Files 均无），因此打包路径的 host 同样无从存在。
- 被动能力查询 `<host> --capabilities --json` 未执行：磁盘上不存在可执行对象（不是失败，也不是"没跑"）。

### 根因（高置信度）

沙盒能力取决于 `resolveWindowsSandboxHostBinary()` 能否解析到 host 二进制；本仓库既**不包含**该二进制、也**没有**任何构建/下载步骤产出它。打包脚本 `apps/desktop/scripts/prepare-pack.js:614-628` 只在 `packages/runtime-core/sandbox/bin` 存在时才把它 staged 进 `Resources/sandbox/windows/`，**缺失时静默跳过、不告警**（与 vendor 运行时缺 Node/Python 时的显式告警形成对照）。因此当前构建产物在 Windows 上必然 `binary_not_found` → 选择器置灰、`defaultExecutionMode=full-access`。这不是探测失败、也不是权限被裁剪。

### 下一步（三类，A/C 可不等决策先做）

- **A（无决策依赖，可立即做）**：执行模式选择器在沙盒不可用时给出**明确原因与指引**（读 `sandbox.reason/details`，i18n 文案），而不是只灰掉选项——这是本 Bug「预期行为」中"显示明确原因"的部分。
- **B（需用户/产品决策）**：是否在构建中获取并内置 Windows 沙盒 host（上游 codex 的 `codex-windows-sandbox-host.exe`：来源、许可、体积、更新节奏），或明确声明 Windows 上暂不提供沙盒。
- **C（技术守卫，可立即做）**：打包时若目标平台声明支持沙盒却没有 staged 任何二进制，应像 vendor 运行时那样显式告警（或 fail），避免再次"静默无沙盒"发版。

- 状态：转 blocked（等 B 的产品决策）；A/C 待排期实施。
- 未运行及原因：未在 Windows 打包产物上验证（本机无已安装实例、构建非本任务所需）；`features` 字段与实时重探行为已由源码与缓存 `checkedAt` 证实。

### A/C 交付记录（2026-09-25，集成 merge `9df33ee39`）

**A（用户可见，`4e082866b` + 测试补强 `7f0f2826e`）**：执行模式选择器在能力缺失时说明原因与当前真实模式。

- 实现形态：`useExecutionModeSelectorModel` 把 10 个内部 reason 码映射为 7 条本地化文案，随 view model 下发 `sandboxNotice {reason, mode, details?}`；视图侧按 `apps/desktop/docs/composable-ui-components.md` §5 用**数据 prop**（不是 `showX`/ReactNode 区域），宿主不下发时 DOM 原样。
- 诚实性处理：模式仍停在 `sandbox` 却说「以完全访问运行」是谎话，故该状态改说「当前选中的沙盒受限无法生效，请改选完全访问」（与主进程 `assertSandboxAvailableForMode` 的 fail closed 一致）；主进程未本地化的 `details` **只挂 `title`**，不进入可见文案；测试机械断言文案不含「重新安装/重新下载/请更新/重试」。
- 红→绿：实现前 4 failed | 1 passed（唯一通过的是「禁用态仍不可选」这条既有守卫）→ 实现后 5/5，连带既有选择器 7/7 与输入区 18/18；集成后 7/7、相关面 181/181。

**C（构建工具链，`73811a378`）**：打包时对声明平台缺失沙盒二进制显式告警。

- 新增 `apps/desktop/scripts/sandbox-staging-guard.mjs`（`missing`/`empty`/`present` 分类 + 与 `VETTA_SKIP_VENDOR` 同形态的告警文案），`prepare-pack.js` 在 staging 后无条件调用；`verify-packaging-contract.mjs` 增加静态断言防止告警被无声删除。
- **有意不让构建失败**：是否内置 host 属 B 项产品决策，决策前加失败开关会挡住现有发版路径且无消费方；告警文本可 grep，待 B 落定后再升级。
- 验证：`test:packaging` 104/104（含新增 6 例，覆盖「目录存在但为空」、darwin/未声明平台不告警等）；真仓路径实测输出告警原文；`node --check` 通过。未跑全量打包（会编译 CLI、拉取 vendor 运行时）。

**仍未做（等 B 决策）**：内置二进制；以及按**架构**而非平台族判定缺口（linux 只 staged x64 时当前不告警）。

## 复核（2026-10-05）

- A（沙盒不可用说明）与 C（打包守卫）已交付且都在 `main` 可达：`4e082866b`（含测试补强 `7f0f2826e`）与 `73811a378`，集成于 `9df33ee39`；`apps/desktop/scripts/sandbox-staging-guard.mjs` 与 `useExecutionModeSelectorModel` 的 `sandboxNotice` 均在树内。**无需重排 A/C**，此前「A/C 待排期实施」的表述已过时。
- 仍未做、且只有 B 落定后才能推进：
  - 按 B 方向内置 Windows 沙盒 host，或明确声明 Windows 暂不提供沙盒；
  - 缺口判定按**架构**而非平台族（linux 只 staged x64 时当前不告警）；
  - B 落定后再把 C 的告警升级为失败开关（升级前需先有消费方）。
- 状态保持 `blocked`：等 B 的产品方向（host 的来源、许可、体积、更新节奏，或明确不支持）。
