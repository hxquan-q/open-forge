---
id: TASK-0151
type: task
status: in_progress
priority: P1
owner: desktop config
source: user-request; upstream 93bfc01ad
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0150, TASK-0187]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree:
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [apps/desktop/src/main/config, apps/desktop/src/main/projects, apps/desktop/src/main/agent-settings, apps/desktop/src/main/general-settings, apps/desktop/src/main/shortcuts]
write_paths: [apps/desktop/src/main/ipc, apps/desktop/src/main/batch-tasks/batch-task-storage.ts, apps/desktop/src/main/knowledge/knowledge-service.ts, apps/desktop/src/main/remote-control/desktop-remote-pairing-service.ts, apps/desktop/src/main/config, apps/desktop/src/main/projects, apps/desktop/src/main/agent-settings, apps/desktop/src/main/general-settings, apps/desktop/src/main/shortcuts, project/tasks/TASK-0151-desktop-config-transactions.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/desktop/src/main/config]
depends_on: [TASK-0150]
conflicts_with: [TASK-0187, TASK-0181]
integration_status: pending
created: 2026-10-02
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 桌面配置串行事务适配

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：93bfc01ad。

迁移读改写到串行事务，保留 Open Forge 品牌、账号/归档/通知/SSH 等现有字段；只适配确有配置写入的消费者，不移植手机业务。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

两个设置并发更新均保留、旧 schema/default、只读查询、失败后后续事务可用；所有真实写入消费者合同。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：TASK-0150。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 下一阶段已确认的适配边界

- 本仓 writeDesktopConfig 已返回 Promise，但内部仍同步 atomicWriteJSON；无需制造对外同步→异步迁移，重点是将读取/变换/异步持久化串行化。
- 当前 Config store 相对分叉点主要是品牌说明差异，没有上游通知偏好的 schema v2；不能为引入事务顺带覆盖 parser/defaults 或提前引入 TASK-0161。
- 仍须保留 raw 未知字段、独立 ssh-hosts.json 和旧数据迁出规则；DesktopConfig.sshHosts 是只读投影，不能由旧快照写回。
- 生产写入涉及 agent/general settings、batch storage、knowledge、shortcuts、ProjectService、IPC 的 config/i18n/fs/session/export、CLI 路径持久化；手机配对的现有写入者也要做机械 API 兼容，但不移植任何手机业务。
- 谨防队列重入：ProjectService 的 isKnownSshHost 目前会 readDesktopConfig；如果验证被放入 queued updater，不能再等待同一队列的 public read。
- 上游用 next===current 判断 no-op；本仓适配前须明确 updater 可否原地修改，并用测试守住，不能静默漏保存。IPC 原先返回 void 的表面不能因为 updater 返回配置而多暴露数据。
- 新增事务应基于实际调用链补完整测试与适当 ADR；上述是源码调查，不是已经实现。

## 2026-10-03 单工作树续接合同

用户授权首批实施，本 Task 在 TASK-0187 集成检出内串行，未另建独立工作树；0150 已集成。先在真实临时配置存储 + GeneralSettingsService 入口用双读屏障证明并发丢失，再提供中心 updateDesktopConfig(updater) 队列，并迁移实际调用方。保留 writeDesktopConfig 的旧整快照语义作为兼容入口，但产品读改写全部迁移，不伪称仅给落盘排队即可解决。

不改变字段/Schema/品牌/凭据、SSH 独立文件或手机功能。remote-control 只迁移现有配置写入，保护相邻字段；失败不得毒化后续事务；同进程串行不承诺跨进程 CAS。API 返回同一 current 引用表示无修改；回调内禁止递归调用事务。保留未知顶层字段，完整字节/占用重试复用已验证 toolkit。

IPC 的既有 CONFIG_SET 字段组装迁至 config 领域，桥只做校验、调用和既有通知；batch-task-storage 不再反向导入 IPC 配置转发。Project Service 保留 broadcast、归档/恢复、目录准入和 automation 事件。正常流程与读后持久化、并发写、失败后恢复、无修改、未知字段及 SSH 保护均需测试。

验证：Node runner + Desktop config 的配置/设置/项目/快捷键/IPC/知识库/批任务/配对隔离用例；test:impact 与跨包 test:changed、最终完整 check 由 TASK-0187 执行。最初 draft 的历史说明仅为规划，不表示本轮尚未授权。
