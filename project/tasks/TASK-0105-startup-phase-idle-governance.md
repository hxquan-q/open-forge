---
id: TASK-0105
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0010
source: RESEARCH-0013 M2+M3（VS Code `InstantiationType.Delayed` 与 WorkbenchPhase 四阶段对照 main 启动直构建现状）
related_requirement: [REQ-0002]
related_plan: [PLAN-0010, PLAN-0002]
related_tasks: []
related_issues: [ISSUE-0020]
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [apps/desktop/src/main/main.ts, apps/desktop/src/main/app-monitor/, apps/desktop/src/renderer/domains/, apps/desktop/src/renderer/shared/]
write_paths: [apps/desktop/src/main/, apps/desktop/src/renderer/, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0107, TASK-0108]
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# 启动相位与 idle 实例化治理框架

## 目标

VS Code 用两层机制控制启动期工作：`Delayed` DI 服务（Proxy 注入、idle/首触实例化，`instantiationService.ts:292-333`）与 Workbench contribution 四相位（BlockStartup/BlockRestore 同步、AfterRestored/Eventually 走 idle 时间片 + `forcedTimeout` + 20/100ms 耗时告警，`contributions.ts:31-367`）。Open Forge 现状：main 启动序列直构建各 domain 服务，renderer 只有零散 `React.lazy`/`requestIdleCallback`。本任务建立**统一的相位+idle 框架**：定义相位枚举、idle 调度器（时间片用尽续调度 + 兜底超时）、单件耗时遥测，并把 main 启动序列与 renderer 非首屏工作接入。

## 范围

### 并发评估

- 结论：不支持并发——触碰 main 启动序列与 renderer 初始化，与 TASK-0107（进程健康契约）、TASK-0108（Disposable 约定）同域写路径。
- 执行方式：serial，主工作区。
- 可并行 Task：无（PLAN-0010 内）；与 PLAN-0011/0012 任务可并行。
- 前置依赖：无（但建议先读 `RESEARCH-0003` 启动基线数据确定相位划分）。
- 冲突文件/独占路径：`src/main/main.ts` 启动序列、`src/renderer` 初始化路径。
- Branch：`main`。
- Worktree：主工作区串行。
- 集成负责人：本 Task 执行者。
- 集成顺序：PLAN-0010 阶段 B 首个。

### 做

- 定义最小相位模型（如 `blocking` / `postFirstPaint` / `idle` / `eventually`），为主进程服务初始化与 renderer 非首屏工作（dev warmup、非关键面板、遥测上报等）提供统一注册入口；
- idle 调度器：走 `requestIdleCallback`/`setTimeout(0)` 兜底，`idle.timeRemaining()` 用尽让出续跑，`forcedTimeout` 保底不饿死；
- 相位内单件耗时记录进 perf 快照（超阈值 warn），归因维度对齐 TASK-0107 的 per-role 记账；
- 逐项盘点启动序列，把「首帧不需要」的工作移出 blocking 相位——每一项迁移附证据（该工作不被首屏路径依赖）。

### 不做

- 不引入 DI 容器/Inversion-of-Control 框架（只借相位与延迟语义，不复制 VS Code 的 instantiationService）；
- 不改首帧可见内容的任何行为——本任务只挪相位，不删功能；
- 不做 renderer 组件级懒加载改造（`React.lazy` 现状保留，仅非首屏 domain 工作纳入相位）。

## Given / When / Then

- Given：冷启动 Desktop；
- When：首帧渲染完成前；
- Then：仅 blocking 相位工作被执行；其余按相位在 idle/超时兜底中完成；perf 快照可读出各相位耗时与单件耗时排名；首帧时间不回退。

## 必须保持

- 所有既有功能的用户可见行为不变（只是「何时初始化」变化）；
- 事件订阅不得因延迟实例化而丢失（参照 `earlyListeners` 转接思想）；
- `app-monitor` 既有采样与诊断包格式兼容；
- `ui-first-async-work.md` 的「可见完成先于功能就绪」契约不破。

## 测试与验证

- 定向测试：相位调度器单测（时间片让出、兜底超时、耗时记录）；「blocking 集合内不得引用 idle 相位服务」的架构守卫或契约测试；
- 用户流程：冷启动 → 首帧 → 后台初始化完成的完整时序回归；
- 质量检查：`bun run check:quick`、desktop typecheck、`test:impact` 相关包。

## 交付记录

- 实际修改：
  - `apps/desktop/src/main/startup-phases.ts`（新增）：相位枚举（blocking/postFirstPaint/idle/
    eventually）+ `StartupPhaseScheduler`：阻塞相位顺序 await、空闲相位时间片（预算用尽让出续跑、
    `forcedTimeoutMs` 兜底防饿死、`idleStartDelayMs` 静默期）、单件耗时快照 + 慢任务告警
    （20ms warn / 100ms error）、相位到达后注册仍按语义执行、失败只记录不打断启动。
  - `apps/desktop/src/main/main.ts`：创建调度器并把两项可验证的工作迁出 blocking——
    `migrateLegacyPluginSettings`（fire-and-forget、仅首次启动、首帧路径不读它）移入
    `eventually`；runtime/CLI 与 sandbox 预热从「固定 500ms 定时器」改为 `idle` 相位排队
    （同样保留 500ms 静默期，额外获得耗时记录、慢任务告警与兜底超时）。
  - `apps/desktop/src/main/startup-phases.test.ts`（新增，7 例）。
  - `.github/release-notes/v0.1.1.md`：「其他」条目。
- 实际运行：
  - `bun run --cwd apps/desktop test src/main/startup-phases.test.ts` → 7/7 通过
    （相位顺序、idle 不在 blocking 跑、时间片让出与续跑、forcedTimeout 兜底、相位后注册、
    慢/失败任务只记录、幂等与快照排序）。
  - `bun run check:quick -- <本次改动文件>`。
- 未运行及原因：
  - 未做冷启动实测（首帧时间、各相位耗时）：需要长驻 Desktop + 真实数据目录，属
    `verify:ui:*` 范畴且用户未授权；本 Task 只保证「首帧可见内容不变 + 相位内工作延后且可观测」，
    实测收益留给 `RESEARCH-0003` P0-1 基线与 ISSUE-0020 的量化结论。
  - 未接入 renderer 侧相位：renderer 的 `React.lazy` + 首帧骨架逻辑本次未改（Task 合同允许
    「只挪相位、不删功能」，但 renderer 非首屏工作尚未纳入同一调度器）。
- 必须保持项的复核：blocking 序列（窗口、菜单、i18n IPC、协议注册、托盘创建、窗口显示门控）
  一行未动；被迁移的两项原本就是 fire-and-forget（`void ...`）或定时器延后执行，
  用户可见行为与事件顺序不变；`app-monitor` 采样仍在内容绘制后初始化，诊断包格式未改。
- Worktree：主工作区（`branch: main`）。
- 剩余风险：
  - runtime/CLI 与 sandbox 预热由并行改为空闲相位内的顺序执行：两者的等待时间变长（各自仍是
    后台预热，sandbox 首次请求仍可按需探测），换来的是不抢占首帧与可观测的耗时记录。
  - 慢任务阈值（20ms/100ms）沿用 VS Code 口径，未按本仓实测校准；先当作诊断信号使用。
