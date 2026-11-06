---
id: TASK-0461
type: task
status: in_progress
priority: P2
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0458, TASK-0459]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: ebf595e38
read_paths:
  - apps/desktop/src/main/ipc/fs.ts
  - apps/desktop/src/preload/api-types/models.ts
write_paths:
  - packages/host-protocol/src/domains/models.ts
  - apps/desktop/src/main/host/models-domain.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/fs.ts
  - apps/desktop/src/preload/apis/system.ts
  - apps/desktop/src/preload/apis/system.test.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0461-models-probe-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0459]
conflicts_with: []
integration_status: pending
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 模型探测与余额通道迁移到 Host 合同

## 目标

`vetta:models:probe` / `fetch-provider-models` / `test-provider` / `get-balance` / `config-path` 迁为 `models.probe` / `models.fetchProviderModels` / `models.testProvider` / `models.getBalance` / `models.configPath`，renderer 签名不变，旧 handler 删除。全部为免凭证结果通道（余额结构注释明确"本结构永不含凭据"），无 §7 评审缺口。

## 做

- `domains/models.ts` 增补 5 方法：probe（params 封闭 `{provider, model}`）、fetchProviderModels（`FetchedProviderModel` 数组）、testProvider（`ProviderTestResult`：ok/latencyMs?/status?/modelCount?/error 枚举 5 值/detail?）、getBalance（`ProviderBalanceResult`：provider/supported/currency?/available?/isAvailable?/errorCode 枚举 9 值）、configPath（String）。
- `models-domain.ts` 增 5 实现（test/balance 沿用 `net.fetch` 依赖注入形态）；`ipc/fs.ts` 删 5 handler 与枚举项及随之无用的导入；preload 5 处改 `host.call`。
- 失败用例先行：注册清单 11 → 16；probe 透传与参数封闭断言。

## 不做

- 不迁移 `vetta:models:changed` 事件与 `fetch-remote`（cloud/auth-session，含服务端凭证流）；不改探测/余额实现与错误码集合。

## Given / When / Then

- Given 已配置 provider / When `models.testProvider` / Then 返回与旧通道一致的 `ProviderTestResult`（含 latencyMs/status/modelCount）；非法 providerName → `INVALID_PARAMS`。
- 其余四通道同理透传；旧 5 个 channel 不再注册。

## 测试与验证

- desktop 包内定向（desktop-host + host-transport）；`check:quick`；`apps/desktop typecheck`；`test:impact`；`count-ipc-channels` 记录下降。

## 交付记录

- 实际修改（2026-11-07）：`domains/models.ts` 增补 5 方法（probe/fetchProviderModels/testProvider/getBalance/configPath，参数全封闭、空白名 `INVALID_PARAMS`，结果按 preload api-types 的三组错误码枚举校验）；`models-domain.ts` 扩为 10 方法实现（test/balance 沿用 `net.fetch` 注入）；`ipc/fs.ts` 删 5 handler、枚举 5 项及随之无用的 6 个导入（含 `models` 服务局部变量）；preload 5 处改 `host.call`（`getBalance` 的 providerId 映射为 providerName 参数）。
- 失败用例先行：注册清单 11 → 16（含 `getBalance` 先于 `getConfig` 的排序修正）与 4 个新领域用例，RED 后转绿；mock 补 `getConfig`（test/balance 依赖）。
- 实际验证：desktop 包内定向 2 文件 22 例通过；`apps/desktop typecheck` 通过；`check:quick -- <5 个改动文件>` 通过（Biome 修复 1 文件 + 清理 fs.ts 2 处迁移残留警告后复跑）；`test:impact` 首跑暴露 `system.test.ts` 两处旧通道断言（test-provider/get-balance），已更新为 Host 信封断言（含 mock 返回信封解包），单文件 6 例通过后复跑；`count-ipc-channels` 688 → 683。
- 未运行与风险：完整 `bun run check` 未运行（既有环境问题）；`vetta:models:changed` 事件与 `fetch-remote`（cloud 凭证流）仍留旧 IPC。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 发布：不适用
