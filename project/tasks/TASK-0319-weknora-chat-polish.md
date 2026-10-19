---
id: TASK-0319
type: task
status: in_progress
priority: P1
owner: desktop
requirement: REQ-0018
plan: null
source: REQ-0018
related_bugs: []
execution: serial
branch: task/TASK-0318-weknora-customer-service
worktree: .
base_commit: 2dd89d53f
read_paths: [apps/desktop, packages/theme-sdk, packages/ui, docs/devflow]
write_paths: [apps/desktop/src/main/weknora, apps/desktop/src/main/ipc, apps/desktop/src/preload, apps/desktop/src/renderer/domains/weknora, apps/desktop/src/shared/i18n, .github/release-notes/v0.1.3.md, docs/weknora-connector.md, project/requirements/REQ-0018-weknora-chat-polish.md, project/tasks/TASK-0319-weknora-chat-polish.md]
exclusive_paths: [apps/desktop/src/main/weknora, apps/desktop/src/renderer/domains/weknora]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-19
updated: 2026-10-19
---
<!-- Copyright The Open Forge contributors. -->

# 智能客服页面打磨：收起 / 右键删除 / 后台思考

## 目标与来源

需求见 [REQ-0018](../requirements/REQ-0018-weknora-chat-polish.md)：在 REQ-0017 交付的智能客服页面上叠加三条打磨能力——侧栏可收起、右键删除历史会话、回答后台思考。

**分支说明**：本任务与 REQ-0017 同分支（`task/TASK-0318-weknora-customer-service`，PR #16）——用户 2026-10-19 裁定，依据是该 PR 尚无任何审查记录，堆叠隔离无收益。基线 `2dd89d53f`（REQ-0017 交付顶点）。

**建档时点说明（如实）**：与 TASK-0318 同样的流程偏差——本 Task 于实现完成、独立测试与审查相位之前补建；需求、验收与证据以 `docs/devflow/weknora-chat-polish/` 为准，不改写历史。

## 范围与并发

- **串行**（T00 实测 → T01 引擎 → T02 删除 → T03 收起 → T04 文档收尾），单工作区本地 `main`，推送目标为上列分支。
- 先行实测（T00，2026-10-19，用户本机执行、Key 不经队长）：删除链路全绿（建 201 / 删 200 / 重拉消失 / 不存在 404 `{"error":{"code":1003,"message":"session not found"}}`）；**两会话并发 agent-chat 实证互不串台、各自完整收敛**——后台思考的并发前提成立。实测另获两条设计输入：`session_title` 事件在主进程解析层即被丢弃（维持现状）；`error` 事件后服务器不断开连接（终态判定不依赖断连）。
- 代码改动 31 个文件 +2394/−91（9 个新文件）；不碰 WeKnora 侧任何配置（红线 C1）、不新增依赖、不出现 `any`、文案全走 i18n。
- **方案级偏离两条**（队长核实认可，详见 `docs/devflow/weknora-chat-polish/02-plan.md` §2.6 末）：requestId 在渲染层 send 时不可知（IPC 合同冻结），草稿归属以「视图代次」锚定 + 未决窗口暂存桥接；活跃会话回切直接以本地缓冲为视图（不做 fetch 合并）。

## Given / When / Then 与最低验证

- **Given** 会话 A 生成中；**When** 切到 B 提问；**Then** A 后台续跑（列表行「思考中」）、B 正常作答互不串台；切回 A 实时续显不重放。
- **Given** 历史会话；**When** 右键「删除会话」并确认；**Then** WeKnora 侧删除、列表刷新；删当前会话则回空白新对话；生成中的会话删除项置灰。
- **Given** 删除请求失败；**Then** 侧栏内联错误 + 重试，列表不假装已删除。
- **Given** 收起侧栏并重启；**Then** 保持收起；首次默认展开。

最低验证层级：路由/缓冲/草稿迁移为纯函数穷举单测；用户流程（切走回切、并发、取消、删除全链路、收起持久化）为组件级流程测试；主进程客户端用假 fetch + T00 实测响应形态夹具。**实机验证须完整重启 `bun run dev`**（main/preload 不热更，详见 `docs/devflow/ENVIRONMENT.md` 坑 4）。

## 验收与交付

工程侧：实现完成，8 个原子提交（见交付记录）；weknora 域 16 文件 124 用例、主进程 weknora+IPC 83 用例全绿；`tsc` 0 错；`check:quick` 与全量 `bun run check` 均 exit 0。**独立测试相位与静态审查尚未执行**（`status: in_progress` 的原因），完成后本记录更新为 `verifying`。

人工侧：待实机预览（含重启 dev 的操作前提）与部署环境确认。

## 交付记录

代码（8 个原子提交，自 `2dd89d53f` 起）：

| 提交 | 票 | 内容 |
|---|---|---|
| `c9af451a4` | T01 | 纯函数路由模块 weKnoraStreamStore |
| `7c4373192` | T01 | 流式层重构为多会话路由引擎 |
| `d003c8e04` | T01 | 列表行「思考中」指示 |
| `311285af4` | T02 | 主进程 deleteSession 客户端方法 |
| `70764b9b3` | T02 | delete-session IPC 通道与 preload 合同 |
| `a5e08bccf` | T02 | 右键删除（确认/禁删/失败重试） |
| `0967c0d88` | T03 | 侧栏收起持久化纯函数 |
| `a75201f21` | T03 | 页头收起开关与条件渲染 |

文档（T04）：REQ-0018 / TASK-0319 立项记录、`docs/weknora-connector.md` 增补、`v0.1.3` 发布说明三条目。
