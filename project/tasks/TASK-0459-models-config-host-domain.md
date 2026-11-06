---
id: TASK-0459
type: task
status: verifying
priority: P1
owner: apps/desktop/runtime-desktop
requirement: REQ-0002
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0002]
related_plan: [PLAN-0029]
related_tasks: [TASK-0453, TASK-0458]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: f0d433a5d
read_paths:
  - apps/desktop/src/main/models/model-settings-service.ts
  - apps/desktop/src/main/ipc/fs.ts
  - packages/host-protocol/src/domains/models.ts
write_paths:
  - packages/host-protocol/src/domains/models.ts
  - apps/desktop/src/main/host/models-domain.ts
  - apps/desktop/src/main/host/desktop-host.test.ts
  - apps/desktop/src/main/ipc/fs.ts
  - apps/desktop/src/preload/apis/system.ts
  - project/plans/PLAN-0029-desktop-host-split-and-native-sidecars.md
  - project/tasks/TASK-0459-models-config-host-domain.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: [TASK-0458]
conflicts_with: []
integration_status: integrated
created: 2026-11-07
updated: 2026-11-07
---
<!-- Copyright The Open Forge contributors. -->

# 模型配置域迁移到 Host 合同（含 ADR-0152 §7 凭证通道评审）

## 目标

`vetta:models:get` / `set` / `copy-api-key` 迁到 `@vetta/host-protocol`（`models.getConfig` / `models.setConfig` / `models.copyApiKey`），renderer 签名不变，旧 handler 删除。读路径结果 Schema 把 `apiKey` 钉死为掩码或外部引用，使明文密钥在合同层结构不可达——这是 ADR-0152 第 7 条对凭证类通道的单独评审结论落地。

## ADR-0152 §7 评审结论（2026-11-07，只读核对）

- 现状：`getRendererConfig()` 已在服务层掩码——`credentialRef` 存在或 `apiKey` 非外部引用时返回 `***`；外部引用（`!cmd`、`env:NAME`、`BARE_NAME`，见 `normalizeExternalApiKeySource`）原样返回（引用本身不是密钥）。明文密钥从不返回 renderer。
- 结论 1（get）：可迁移。读结果 `apiKey` Schema 钉死为 `"***" | 外部引用模式`，运行时 `Value.Check` 强制——服务层掩码若被未来改动破坏，Host 返回 `INVALID_RESULT` 而不是静默泄露。`credentialRef`（凭据库不透明引用，renderer 需原样保留）保持可选 string。
- 结论 2（set）：可迁移。写路径 `apiKey` 为自由 string（用户可粘贴明文或外部引用，一次性传入语义与现状一致）；params Schema 不断言收紧写形状，避免破坏存量保存。
- 结论 3（copy-api-key）：可迁移。密钥只写入系统剪贴板（30 秒后未被覆盖则清空，逻辑随通道整体迁移），合同结果仅为 boolean，密钥不进 renderer。
- 结论 4：`vetta:settings:get/set-server-token(-refresh-token)` 等 Host 内凭证存取通道仍留旧 IPC，待凭证归属（Host 出进程后的 vault 边界）定稿后再评审，不在本任务。

## 范围

### 并发评估

- 结论：主工作区串行切片，无并行诉求。

### 做

- `domains/models.ts` 增补三个方法与读/写两套 Provider Schema（读 `apiKey` 钉 union，写自由 string）；`ModelDefinition` Schema 复用 0458 定义。
- `models-domain.ts` 扩为 5 方法实现；copy 的剪贴板定时清空状态从 `ipc/fs.ts` 整体迁入。
- `ipc/fs.ts` 删除 3 个 handler、CHANNELS 枚举 3 项、剪贴板状态与 disposer 清理；preload 3 处改 `host.call`。
- 失败用例先行：注册清单 8 → 11；get 掩码透传；**get 明文 → INVALID_RESULT**（合同钉死的核心断言）；set 透传 `replaceConfig`；copy 有/无密钥两分支。

### 不做

- 不迁移 probe / fetch-provider-models / test-provider / get-balance / config-path（下一片）；不动 `vetta:models:changed` 事件与 token 类通道；不改 renderer。

## Given / When / Then

- Given 已配置 provider（含明文 key）/ When `models.getConfig` / Then 返回 `apiKey: "***"`；若服务层返回明文则 Host 报 `INVALID_RESULT`。
- When `models.setConfig(config)` / Then `replaceConfig` 收到原 config，返回 null。
- When `models.copyApiKey(providerId)` / Then 有密钥 → 剪贴板写入并 30s 定时清空、返回 true；无密钥返回 false。

## 测试与验证

- `bun scripts/quality/run-vitest.mjs --run apps/desktop/src/main/host/desktop-host.test.ts apps/desktop/src/preload/host-transport.test.ts`；`check:quick -- <改动文件>`；`test:impact -- <改动文件>`；`count-ipc-channels` 记录下降。

## 交付记录

- 实际修改（2026-11-07）：`domains/models.ts` 增补 `models.getConfig` / `models.setConfig` / `models.copyApiKey` 与读/写两套 Provider Schema（读 `apiKey` 钉 `"***" | 外部引用` union；写自由 string；copy 参数封闭 + `minLength: 1`）；`models-domain.ts` 扩为 5 方法，剪贴板 30s 清空状态自 `ipc/fs.ts` 整体迁入；`ipc/fs.ts` 删除 3 handler、枚举 3 项、剪贴板状态与 disposer 清理及随之无用的 `clipboard` / `resolveNodeConfigurationValue` / `ModelsConfig` 导入；preload 3 处改 `host.call`。
- 失败用例先行：注册清单 8 → 11、get 掩码透传、**get 明文 → INVALID_RESULT**（§7 结论的核心断言）、set 透传 `replaceConfig`、copy 有/无密钥两分支、空 providerId 拒绝——RED 6 failed | 10 passed 后实现转绿。
- 实际验证：desktop 包内定向 2 文件 18 例通过（须在 `apps/desktop` 目录用包级 vitest 配置跑——根配置无 electron stub 别名，本轮踩坑已记录）；`check:quick -- <5 个改动文件>` 通过（Biome import 排序修复 1 文件后复跑）；`test:impact -- <5 个改动文件>` 通过（desktop 直接 + 关联 27 文件全绿，exit 0）；`count-ipc-channels` 691 → 688。
- 行为差异说明：注册注销时不再主动清剪贴板定时器（定时器自清；原清理仅发生在 IPC 注销路径，生产生命周期内不触发）。
- 未运行与风险：完整 `bun run check` 未运行（既有环境问题）；设置页 UI 走查需授权未执行；probe / fetch-provider-models / test-provider / get-balance / config-path 留待下一切片；`vetta:models:changed` 事件与 token 类通道不动。
- 人工验收：不适用（preload 合同迁移，renderer 签名与行为不变）。
- 门禁与推送时序（2026-11-07）：`test:changed --base origin/dev` 首跑 6314 通过 / 1 失败（`weknora-background-flow.test.tsx` AC-20 时序合并用例，与本次 diff 无关），未推送；该文件隔离复跑 7/7 通过，全量门禁复跑通过（GATE_EXIT=0）后推送 `origin/dev`（796b373af）。判定为已知 Windows 时序偶发（同 0455/0458 模式）。
- 远端 CI（2026-11-07）：quality run 42294078591 对 `796b373af` **failure**——两处类型错误（copy 测试 mock 签名只声明回 `undefined`；preload `set` 包装 `Promise<null>` 与 api 类型 `Promise<void>` 不符），本地 `check:quick` 不含 tsc 故未拦截。修复提交 `3626913bb`（补全 mock 参数/返回类型；`set` 改 await 后返回 void），本地 `apps/desktop typecheck` 通过、定向用例复跑通过；门禁绿后推送并复测 CI。流程教训：代码批次推送前须补跑对应包 typecheck。
- 追记（2026-11-07）：修复批次的门禁复跑再次失败于同一 `weknora-background-flow` AC-20 时序用例（当日 3 次全量中第 2 次，隔离恒过）——按"再次复现即修复"另立任务处理；且本次推送命令再次以 `grep|tail` 链接到 push、门禁失败仍推出了批次（我的流程错误第二次，与门禁本身无关）。流程修正：门禁与推送合并为单条后台命令 `bun run test:changed --base origin/dev && git push origin main:dev && git ls-remote ...`，`&&` 直接吃 bun 的真实退出码，任何管道/摘要输出只在推送后读取。远端 CI 对 `3626913bb` 监视中。
- 发布：不适用
