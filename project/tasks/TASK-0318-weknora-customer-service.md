---
id: TASK-0318
type: task
status: verifying
priority: P1
owner: desktop
requirement: REQ-0017
plan: null
source: REQ-0017
related_bugs: []
execution: serial
branch: task/TASK-0318-weknora-customer-service
worktree: .
base_commit: 9c16ef6f9
read_paths: [apps/desktop, packages/theme-sdk, packages/ui, docs/devflow]
write_paths: [apps/desktop/src/main/weknora, apps/desktop/src/main/ipc, apps/desktop/src/preload, apps/desktop/src/renderer/domains/weknora, apps/desktop/src/renderer/domains/project/components/sidebar, apps/desktop/src/renderer/router.tsx, apps/desktop/src/renderer/shared/i18n, apps/desktop/src/shared/i18n, packages/theme-sdk/src/sidebar/types.ts, .github/release-notes/v0.1.3.md, docs/weknora-connector.md, docs/weknora-connector-delivery.md, project/requirements/REQ-0017-weknora-customer-service.md, project/requirements/README.md, project/tasks/TASK-0318-weknora-customer-service.md, project/tasks/README.md]
exclusive_paths: [apps/desktop/src/main/weknora, apps/desktop/src/renderer/domains/weknora]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-19
updated: 2026-10-19
---
<!-- Copyright The Open Forge contributors. -->

# 桌面端「智能客服」直连 WeKnora

## 目标与来源

需求见 [REQ-0017](../requirements/REQ-0017-weknora-customer-service.md)：在桌面端新增「智能客服」入口，直连公司 WeKnora 知识平台向知识库智能体提问并流式显示回答。

本任务承接该需求的**全部实现**：连接层、通道层、界面层与文案。

**记录时点的说明（如实）**：本 Task 记录在实现完成、测试与审查闭环之后补建。仓库规则要求「进入实施时先建 Task」，本次未在动手前建档，属于流程偏差；需求、验收与证据以本记录与 `docs/devflow/weknora-customer-service/` 为准，不改写历史。

## 范围与并发

- **串行**，单个 Agent 在本地 `main` 上的主工作区完成；未另开独立 worktree（本轮无并行 Task 同写这些路径），`worktree` 记为 `.`。
- 基线 `9c16ef6f9`，共 13 个原子提交（见「交付记录」）。
- 改动以**新增**为主：新增 33 个文件；对既有文件的改动 11 处、合计 +55/−4 行，全部是「加一个导航项绕不开的连带改动」（IPC 与 i18n 注册点、路由表、侧边栏导航表、`theme-sdk` 的两个封闭联合类型、发布说明、两份文档）。
- **不碰**：WeKnora 侧任何配置（只读调用）、既有导航项、`allstar-coding` 插件、`APP_RUNTIME_NAME`、`main/` 与 `preload/` 之外与本任务无关的域。
- **不新增依赖**；不新增执行内核（流事件沿用既有「主进程自产事件 → 渲染进程增量消费」通道，不经过 TurnPipeline）。

## Given / When / Then 与最低验证

- **Given** 已配置地址与租户 API Key；**When** 选智能体并提问；**Then** 回答逐字出现，结束后思考区自动收拢、正式回答铺开，展开可见检索旁白。
- **Given** 长回答正在流式；**When** 离开页面再返回；**Then** 仍可取消、仍可提问，不留「生成中」挂起态。
- **Given** 已有历史对话；**When** 点击其一；**Then** 先弹确认并说明会替换当前对话，取消则不做任何改动。
- **Given** 尚未配置；**When** 进入页面；**Then** 给出中文引导且不发起任何网络请求。
- **Given** 模型全程未调用任何工具；**When** 直接作答；**Then** 全部文本为正式回答，不被误判为思考。

最低验证层级：解析层与归一化用单元/合同测试（假 fetch、真实 SSE 样本）；界面流程用组件测试跨组件串联；不以 mock 内部协作者替代行为断言。

## 验收与交付

工程侧已完成。**技术审查为独立角色（静态审查）产出 9 项发现，用户圈定修 8 项，已全部修复并复验**；未修 1 项（`newConversation`/`openSession` 不取消在跑的流）经用户裁定不影响正确性。

人工侧：应用已在本机启动并走通「配置 → 选智能体 → 提问 → 追问 → 新建对话 → 切历史会话 → 确认/取消」全流程；**待同事在部署环境确认**，故 `status: verifying`、`integration_status: pending`（提交尚在本地，未推送、未合入 `dev`）。

## 交付记录

**提交（本地 `main`，相对基线 `9c16ef6f9`，共 13 个）**

```
6b7dea78d  docs: 新增智能客服接口的交付更新通知
833b7dd30  fix(desktop): 修复审查发现的问题并拆分过长的会话模型
90617cfba  test(weknora): 按验收标准补独立测试与用户流程用例
a6ed429ce  fix(weknora): 校正会话字段类型并补齐边界校验说明
c6b12b720  fix(desktop): 智能客服历史列表该刷新时不刷新
6f603d86b  docs: 新增智能客服连接器的部署与排障说明
6984a2320  docs(release-notes): 记录智能客服的新建对话与历史会话
74743e5f4  feat(desktop): 智能客服支持新建对话与历史会话
0daed7779  docs(release-notes): 记录 0.1.3 的智能客服条目
b57081fe5  feat(desktop): 侧边栏新增智能客服入口与路由
d5dd436f2  feat(desktop): 新增智能客服页面与智能体选择器
9f6ef68d8  feat(desktop): 为智能客服暴露 IPC 与 preload 通道
0c7ffd665  feat(weknora): 新增智能客服的主进程客户端层
```

**验证证据**

- 本 feature 自动化测试 **16 文件 / 149 用例全绿**（含一组跨组件「用户流程」用例，逐步断言结果而非点击成功）。
- 三个受影响域（侧边栏 / 对话与 i18n / 主进程 IPC）回归：**243 文件 / 1329 用例通过**，唯一失败文件为**既有基线** `src/main/ipc/browser-view.test.ts`（`window-manager.ts` 在模块加载时读 `process.resourcesPath`，测试 stub 未提供；两文件均为未修改的上游文件）。
- 全量 `test:changed --base origin/main`：952 文件 / 5136 用例中 **942 文件、5118 用例通过**。已定位的 2 个失败均与本任务无关：`McpAppSurface`（单独运行通过，全量并发下的偶发超时）、`desktop-remote-connector.websocket`（`spawn bun ENOENT` —— 本机 bun 经 npm 安装为 shim，Node 的 spawn 解析不到；把真实 `bun.exe` 目录加入 PATH 后可解析）。**另有 4 个失败文件因运行输出被截断未能定位，均位于本任务未触碰的域**，如实记录为残余不确定性。
- 验收标准：`docs/devflow/weknora-customer-service/01-spec.md` 共 25 条，**21 条通过**、4 条属首版不含项（引用角标、冷门错误提示）。
- 质量门禁：`check:quick` 通过；桌面端类型检查通过；无 `any`；单文件均 ≤400 行（最大 373 行）。

**流程与偏差**

- 采用 dev-flow 五相位（requirements → design → implementation → testing → review → CP3 修复闭环），产物在 `docs/devflow/weknora-customer-service/`（该目录经 `.git/info/exclude` 本地排除，不随代码推送）。
- 偏差 1：本 Task 记录在实现完成后补建（见「目标与来源」）。
- 偏差 2：串行开发直接落在本地 `main`，未建独立 worktree 与本地 task 分支；推送时以 `main:<task 分支>` 形式创建远程分支。

**已知限制（非缺陷）**

- **回答不含引用来源角标**：WeKnora 在智能体路径下不产生引用（其源码 `internal/modelcontext/registry.go:318` 仅对 MCP 工具结果做引用扫描，而所用智能体未挂 MCP）。属上游行为。
- 演示前需注意：名为 `Allstar智能助手` 的智能体，其上游模型凭据已失效（调用返回 401 且**并非本连接器的问题**）；可用 `智能推理` 替代。详见 `docs/weknora-connector.md` §4。

**未运行**：打包与发布（未构建安装包、未推 tag、未触发流水线）；真实 WeKnora 的人工验收（待同事在部署环境确认）。
