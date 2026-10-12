---
id: TASK-0240
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement: REQ-0012
plan:
source: user-request
related_requirement: [REQ-0012]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: unassigned（main 串行，与近期批次一致）
worktree: unassigned（main 串行，未拆出）
base_commit: 43967e5
read_paths:
  - packages/ssh-transport/
  - apps/desktop/src/
  - apps/ssh-helper/
write_paths:
  - packages/ssh-transport/src/
  - apps/desktop/src/
  - packages/ssh-transport/README.md
  - .github/release-notes/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# SSH 远程项目文件传输（上传/下载）

## 目标

为 `ssh://` 远程项目的文件栏提供上传/下载：传输原语进 `packages/ssh-transport`（流式 exec 通道），队列服务与 IPC 进 Desktop 主进程，菜单/拖拽/进度面板进渲染层。设计依据：`.claude/plans/ssh-file-transfer.md`（会话内已获用户批准）。

## 范围

### 并发评估

- 结论：不支持并行（单 Task 串行）
- 执行方式：serial，main 工作区
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：`packages/ssh-transport/src/*` 近期无其他任务占用；工作区另有他人未提交改动（`bun.lock`、`project/bugs/BUG-0082-*.md`），不碰
- Branch/Worktree：未拆出（serial，理由：单包纵向切片，无长时并行测试）
- 集成负责人：本会话；集成顺序：随 main 串行批次

### 做

**切片 1 — 传输原语（packages/ssh-transport）**

- `SshProcessChannel` 增加可选 drain 感知写 `writeAsync(data): Promise<void>`；node runner 等 stdin `drain`，ssh2 runner 用 `stream.write(data, cb)`。
- `remote-command.ts` 新增 `buildUploadFileCommand(remotePath, expectedBytes, tmpSuffix)`：沿用 `buildWriteFileCommand` 原子写骨架，mv 前校验 `wc -c` 等于期望字节数，不符则清理 tmp 并以非零退出——拦截「取消时 stdin EOF 让 cat 正常完成、半截文件被 mv 覆盖目标」的竞态。
- `SshConnection.downloadFile/uploadFile`：`openChannel("cat -- <quoted>")` 下载、`openChannel(buildUploadFileCommand(...))` 上传；进度按字节计数回调；取消走 `kill()` + `SshOperationAbortedError`；错误保持三分类。helper 不参与传输（其 `fs.readFile` 单帧 base64 不适合大文件；exec 通道经 ControlMaster/ssh2 复用已足够）。

**切片 2 — 主进程队列与 IPC**

- `apps/desktop/src/main/ssh/ssh-file-transfer-service.ts`：任务模型、队列 + 并发上限 2（照 `downloads/download-service.ts` 模式）、abort 注册、文件夹展开（上传 `node:fs` walk / 下载 `listFilesRecursive`，两侧 mkdir 补建）、事件推送（`attachEventSink` 节流模式）。
- 冲突策略：入队前 `stat` 远端目标，已存在时经 IPC 询问 replace/skip，服务不自行决定。
- 远端目标过 `assertRemotePathWithinProject`；IPC 通道 `vetta:ssh-transfers:*` + preload API；下载落盘目录用 `dialog` 选择。

**切片 3 — 渲染层**

- `useFileContextMenuModel`：远程条目加「下载到本机…」，远程目录加「上传文件…/上传文件夹…」（`isSshProjectUri` 已在该 hook 使用，本地项目不显示）。
- `useFilesPanelModel` 外部拖放分支按根 URI 分流：`ssh://` 走上传队列，本地维持 `prepareDrop/commitDrop`。
- 传输进度面板（文件栏头部入口）：进度、字节、取消、失败原因；全部新文案走 i18n（zh + en）。

### 不做

- 断点续传、限速、checksum 复验、helper 协议扩展、Agent 工具暴露、本地↔本地传输改动、SFTP 子系统。

## Given / When / Then

- Given fake/回环 SSH 通道与远端文件，When `downloadFile`，Then 字节一致落盘且进度单调递增至 total。
- Given 大文件上传中途 `AbortSignal` 触发，When 取消，Then 远端目标内容不变、无 `.vetta-tmp-*` mv 覆盖，抛 `SshOperationAbortedError`。
- Given 上传字节数被篡改（期望与实际不符），When 远端脚本校验，Then 非零退出且目标不变（`SshRemoteCommandError`）。
- Given 队列中 5 个任务与并发上限 2，When 依次入队，Then 同时活动数 ≤ 2、完成顺序按队列推进、事件按 added/updated 推送。
- Given 远程文件树拖入 OS 文件，When drop，Then 走上传队列并显示进度；本地项目同操作行为不变。
- Given `ssh://host/proj/../../etc` 类目标，When 调传输入口，Then 授权拒绝。

## 必须保持

- 失败三分类（unverifiable / exited / aborted）与 ADR-0124「不静默回退本地」。
- 既有 `SshProcessChannel.write/end/kill` 语义不变；`writeAsync` 为可选扩展，旧测试替身不强制实现。
- 本地拖放/复制路径零行为变化；远程文件树既有操作（编辑保存、重命名、删除）不受影响。
- 用户可见文案走 i18n；不新增 `any`；通道/IPC 新合同有类型与校验。

## 测试与验证

- 定向测试：`packages/ssh-transport` 套件（fake runner 单元 + `ssh2.Server` 回环：字节一致、drain 大文件、取消不覆盖、wc 校验失败）；
- 服务层：队列/并发/取消/事件（fake SshConnection）；UI：上下文菜单接线与拖放分流（组件测试）。
- 命令：`bun run --cwd packages/ssh-transport test`；`bun run test:impact -- <改动文件>`；`bun run --cwd apps/desktop test`（包内 runner）；轮末 `check:quick`、任务末完整 `check`。
- 用户流程：单文件上传（拖拽）、单文件下载（菜单）、取消上传、文件夹下载——测试级覆盖；真实设备验收留给用户（合同禁止访问真实主机）。

## 验收分层

- 工程验证：定向套件绿（见交付记录）；check:guards 有存量红，按 HEAD 归因非本任务
- 技术评审：自审完成
- 集成：pending（main 串行）
- 人工功能验收：待验收（需真实 SSH 设备）
- 发布：未授权

## 交付记录

### 事实、决策与范围收敛

- 三切片按批准计划（`.claude/plans/ssh-file-transfer.md`）落地：原语 → 主进程队列/IPC → 渲染层。
- 进度面板落点偏差：计划写「文件栏头部入口」，实际做成窗口右下 fixed 浮层（`SshTransferProgressPanel`，最多 5 行、活动条目优先）——文件栏头部没有合适的挂载点，浮层与既有 toast/传输提示的空间语义一致。
- `useFilesPanelModel` 在插入 SSH 块后达 924 行（超 800 行阈值），故把 SSH 传输编排抽成独立 hook `useSshFileTransfers`（事件镜像、plan→commit 握手、冲突确认、拖放入队、上传完成刷新），模型只留约 12 行接线，现 797 行。
- 上传完成刷新条件在实现中修正为「受影响目录在可见树内」（`parentUri === rootDir || parentUri.startsWith(rootDir + "/")`）：入队组记录的是被上传条目自身路径，取其父目录才是接收新文件的目录。
- 冲突询问复用全局 `ConfirmDialogState`（confirm=替换 / cancel=跳过冲突项），服务不自行裁断；`plan.skipped` 非空与 commit 后零入队都经 error toast 呈现。
- theme-ui 两个视图只加可选插槽（`transferActions` / `sshTransfersPanel`），不引入 SSH 概念， purity 约束不受影响。

### 实际修改

- packages/ssh-transport：`process-runner.ts`（`writeAsync` drain 感知写端口）、`node-process-runner.ts`、`ssh2-runner.ts`、`remote-command.ts`（`buildUploadFileCommand`，wc 校验原子上传）、`remote-command.test.ts`、`ssh-connection.ts`（`downloadFile`/`uploadFile`/`stat`/`listFilesRecursive`/`makeDirectory`）、`ssh-connection.test.ts`、`ssh-connection.transfer.loopback.test.ts`（新）、`README.md`（传输小节 + 声明头）。
- apps/desktop main：`ssh/ssh-file-transfer-service.ts`（新，plan/commit 握手、队列并发 2、取消分类、半截文件清理）+ 同名测试（新）、`ipc/ssh-transfers.ts`（新，`vetta:ssh-transfers:*` + 文件/目录选择对话框）、`ipc/index.ts`（注册与 teardown）。
- preload：`api-types/ssh-transfers.ts`（新合同类型）、`api-types/ssh.ts`、`apis/ssh.ts`。
- renderer：`hooks/useSshFileTransfers.ts`（新）、`hooks/useFilesPanelModel.tsx`、`hooks/useFileContextMenuModel.ts`、`components/SshTransferProgressPanel.tsx`（新）、`components/FileContextMenu.tsx`。
- packages/theme-ui：`FileContextMenuView.tsx`、`FilesPanelView.tsx`。
- i18n：zh/en `chat.json` 新增 `fileExplorer.sshTransfer` 块。
- 项目记录：REQ-0012、本 TASK、tasks/requirements README；发布说明 `.github/release-notes/v0.1.3.md`「新增」追加一条。

### 实际运行

- `bun run --cwd packages/ssh-transport test`：19 文件 225 通过 / 25 既有跳过。
- apps/desktop 包内 `bun run test src/main/ssh/ssh-file-transfer-service.test.ts`：6/6（上传文件夹、冲突 skip/replace、下载单文件与目录、用户取消、并发上限 2、plan owner 不匹配）。
- apps/desktop `typecheck:incremental`：0 错误。
- packages/theme-ui `check`（tsgo）：51 个既有错误（JSX 命名空间 / `import.meta.dirname`），全部不在本次触碰文件内；file-explorer 新改动无错误。
- packages/theme-ui `test`：23 文件 180/180。
- Biome（desktop 全部改动文件）：clean；zh/en chat.json `JSON.parse` 通过。
- `check:quick`：Biome 段通过；`check:guards` 红——修改声明头缺 21 个文件，经 `git log`/`git status` 证实全部是其他批次已入库文件（describe-error→1ea343230、TASK-0235..0239→1de1a5aec 等），不在本次未提交差异内；本任务 5 个缺头文件（preload ssh×2、renderer file-explorer×3）补头后清零。按「红先按 HEAD 归因」记为存量红，未碰他人文件。

### 未运行及原因

- 计划中的「UI：上下文菜单接线与拖放分流（组件测试）」未写：渲染层接线以 typecheck + 两包全量现有套件代替，见剩余风险。
- `test:impact` / `test:changed` 未跑：定向套件已覆盖 ssh-transport 与 theme-ui 两个受影响包及 desktop 服务层；完整 `bun run check` 因上述 check:guards 存量红无法出绿（非本任务差异）。
- 真实 SSH 设备验收未做：任务边界禁止访问真实主机，留给用户。

### 剩余风险

- 上下文菜单/拖放分流的渲染层无自动化用例，回归依赖人工；后续可补 `useSshFileTransfers` 的 renderHook 用例。
- 传输面板只镜像订阅期间的事件，切走工作区后旧条目滞留，切回后新事件恢复更新。
- check:guards 存量红（21 个他人批次文件缺声明头）需归属批次补头或收缩 ratchet 基线。

- Worktree：未拆出（serial，main 工作区）；提交仅含本任务路径，不夹带 `bun.lock` 与 `project/bugs/BUG-0082-*.md`。
