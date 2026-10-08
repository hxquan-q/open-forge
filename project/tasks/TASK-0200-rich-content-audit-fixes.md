---
id: TASK-0200
type: task
status: done
priority: P2
owner: desktop content + theme-ui（泳道C审计线）
source: user-request; TASK-0157/0158 交付审计; upstream c362aacc4; RESEARCH-0022
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0157, TASK-0158, TASK-0196]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0200-rich-content-audit-fixes
worktree: ../open-forge-wt/task-0200-rich-content-audit-fixes
base_commit: 280e98f769a84ed3b231a59224a7b94e015216d5
read_paths: [packages/theme-ui/src/markdown, apps/desktop/src/main/markdown, apps/desktop/src/main/message-annotations, apps/desktop/src/renderer/domains/conversation/components, apps/desktop/scripts/markdown-isolation.test.mjs, apps/desktop/vite.main.config.ts]
write_paths: [apps/desktop/src/renderer/domains/conversation/components/SessionMessageList.tsx, apps/desktop/src/renderer/domains/conversation/components/annotations, apps/desktop/scripts/markdown-isolation.test.mjs, apps/desktop/scripts/markdown-isolation.fixture.ts, project/tasks/TASK-0200-rich-content-audit-fixes.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/desktop/src/renderer/domains/conversation/components/annotations, apps/desktop/scripts/markdown-isolation.test.mjs, apps/desktop/scripts/markdown-isolation.fixture.ts]
depends_on: [TASK-0157, TASK-0158]
conflicts_with: [TASK-0197, TASK-0196, TASK-0181, TASK-0159, TASK-0154, TASK-0123, TASK-0122, TASK-0039]
integration_status: integrated（实现 af7a9f5a9/501a935da/25467b0d2，随本任务分支 ff 推送 origin/dev）
created: 2026-10-03
updated: 2026-10-07
---
<!-- Copyright The Open Forge contributors. -->

# 富内容交付审计与两项收尾修复

## 目标

对 TASK-0157/0158 已集成交付（f5b390e25、3a90b8abe、b73b498c6，随 TASK-0196 批次合入 main `280e98f76`）做独立技术审计，并落地审计发现的两个可实施收尾项；不重复实现、不整文件覆盖已交付能力。

## 审计结论（2026-10-03，对象库静态对照 + Worktree 动态复验）

- main 进程 markdown 服务族（public-resource/favicon/image-resource/html-preview/mermaid/isolated-window）与上游 093ce834b **逐字节一致**（仅声明头差异）：SSRF 防护（全地址 unicast 校验 + DNS 结果钉定防 rebinding）、协议/端口白名单、大小/超时/并发/窗口数上限、CSP `default-src 'none'` + webRequest 仅放行 data:/about:、ephemeral partition、forcefullyCrashRenderer、IPC sender+mainFrame 双校验均在位。
- theme-ui `src/markdown` 全部 24 文件与上游 a8029e94f 逐字节一致（仅声明头）；renderer 图片管线隐私边界（baseDirectory + resolveLocalFilePath + fs IPC）保持。
- 0158 终端链路完整：terminal.run 权限声明/桥接（缺权限抛错）、命令控制字符/长度限制、cwd 会话内限定（新 isPathWithin 显式处理等值场景）、issued 防重放与「先写载荷再写输入」合同、scripts 插件 names/ignoredDirectories 复用（0167 合同）+ 旧宿主客户端兜底再筛。
- 发现两项缺口 → 本 Task 两个切片（下）；上游快照后的 b56cbbd8f 组合重构按 RESEARCH-0022 维持后置，不属缺陷。

## 范围

### 并发评估

- 结论：条件支持（独立 Worktree，与 0186/0187/0197 并行；无代码路径交叠，共享台账文件靠 dev 逐项 ff+合并解决）。
- 执行方式：parallel（泳道C，Worktree `../open-forge-wt/task-0200-rich-content-audit-fixes`）。
- 冲突文件：`.github/release-notes/v0.1.3.md`、`project/tasks/README.md`（与 0187/0197/0196 等批次共享，合并保双方）。与仍未入库的 TASK-0187 的协调关系暂以本条 prose 登记（guard 只认已入库 ID），其记录入库后可补入 conflicts_with；TASK-0197 已随远端合入补登记。
- Branch：`task/TASK-0200-rich-content-audit-fixes`；集成：按泳道协议逐项推送 `origin/dev`。

### 做切片一：批注作用域会话就绪重挂修复（上游 c362aacc4 回归合同）

- 现状：`SessionMessageList.tsx` 以 `session && session.sessionPath === props.sessionId ? <AnnotationScope key={session.sessionPath}>…` 条件包裹 + 路径 key 挂载；activeSession 过渡（null→就绪）时条件翻转使整棵 MessageList 卸载重挂，已显示消息闪烁、滚动与流式组件状态丢失。上游已于 c362aacc4 修复同构缺陷，RESEARCH-0022 将其列为批注能力接入的回归合同，但批次交付未含。
- 修复采用 c362aacc4 语义、按本仓组合树适配：`AnnotationScope` 常驻包裹并接受 `session | null`，批注面板拆为按 `sessionPath` key 的兄弟节点 `AnnotationPanel`，经 `useLayoutEffect` 向上发布稳定 actions；无会话/会话不匹配时上下文退化为 null（面板 inert）。不引入上游 b56cbbd8f 的 Conversation 大重构。
- 不改变：批注持久化合同、useAnnotationModel 行为、快捷键 scope 语义、SessionSelection/MessageRendering 结构。

### 做切片二：补跑被跳过的 markdown-isolation e2e

- TASK-0157 交付记录唯一未运行项：测试内 vite lib-build（formats:["es"]）把 `mermaid/dist/mermaid.min.js?raw` 动态 import 拆成 `.js` chunk，临时目录无 package.json，Electron 按 CJS 加载在 `export` 上崩溃。
- 最小修复：仅给该测试自带 build() 配置加 `rollupOptions.output.inlineDynamicImports`；不放宽隔离断言、不动产品 vite.main.config、不新增依赖。

### 不做

- 不重复移植 0157/0158 任何已交付能力；不做视觉校验（`verify:ui:*`）；不启动真实 Desktop/Provider/SSH；不引入上游 b56cbbd8f 组合重构；不新增第三方依赖；不修 TASK-0157 已声明的用户验收级剩余风险（mermaid/katex 体积、真实站点 favicon 兼容）。

## Given / When / Then

- Given：main `280e98f76`（含 0157/0158 全量交付）与本任务 Worktree。
- When：会话从无 activeSession 过渡到就绪（同 sessionPath）时观察消息列表；以及直接运行 markdown-isolation e2e。
- Then：列表子树挂载计数保持稳定（不再重挂）；隔离 e2e 在不放宽断言的前提下通过；批注、消息渲染、终端/脚本面板既有测试不退化。

## 必须保持

- 沙箱/网络隔离不变量（CSP、webRequest 白名单、SSRF 校验、窗口上限）不因本 Task 任何改动弱化。
- 流式渲染冻结、stable-blocks、渲染/语法预算、mermaid 串行队列与缓存上限行为不变。
- terminal.run 权限链与 issued 防重放合同不变。
- 他人未提交文件不动；主工作区仅新增本记录文件。

## 测试与验证

- 定向（红→绿）：`SessionMessageList.stability.test.tsx`（jsdom，完整 SessionMessageList 栈 + virtuoso 挂载计数探针）。
- 补跑：`node apps/desktop/scripts/markdown-isolation.test.mjs`（Electron 真实隔离窗口）。
- 抽复验 0157/0158 关键面：AnnotationScope 问答族、theme-ui markdown 族、terminal-launch、ipc markdown、scripts 插件。
- 影响面：`bun run test:impact -- <实际变更文件>`；完成后完整 `bun run check`。
- 未授权：verify:ui、真实 Provider/SSH、发布。

## 验收分层

- 工程验证：见交付记录。
- 技术评审：本文件审计结论即首轮自审；修复 diff 已对照 c362aacc4 复审。
- 集成：分支 task/TASK-0200-rich-content-audit-fixes 三实现提交 + 本记录提交，ff 推送 origin/dev。
- 人工功能验收：待用户（含批注交互与脚本面板实机行为）。
- 发布：未授权。

## 功能验收包

- 入口：打开任一会话→等流式回复完成→选中回复文字右键批注；关闭重开会话观察列表不闪烁；底部面板脚本插件跑一条脚本。
- 预期：会话就绪/切换时已显示消息不消失重挂；批注面板按会话重置；脚本命令仍只在用户终端敲一次。
- 不通过表现：列表闪烁/滚动复位=切片一回归；隔离窗口断言失败=切片二回归。

## 交付记录

- 实际修改：
  - 切片一：`annotations/AnnotationScope.tsx`（拆分 Scope/Panel、actions 上提、稳定引用）、`SessionMessageList.tsx`（常驻包裹、null 退化）、新增 `SessionMessageList.stability.test.tsx`。
  - 切片二：`scripts/markdown-isolation.test.mjs`（build 配置加 inlineDynamicImports 及根因注释）。
  - 台账：TASK-0157 交付记录补遗留收口注记；README 焦点表（新增本 Task 行，并把 0196 行状态对齐已提交 frontmatter 的 verifying——批末合并收尾的既有不一致，非本 Task 产生）；v0.1.3 发布说明修复/其他各一条；声明头 ratchet 基线收缩 3 条已修复条目。
- 实际运行：
  - 红测复现：stability 2 例在修复前红（virtuoso 挂载计数 1→2）；isolation e2e 修复前以 `Unexpected token 'export'`（chunk 按 CJS 加载）退出 1。
  - 修复后绿：stability+AnnotationScope 12/12；markdown-isolation e2e PASS（独立 PID、脚本执行、拒 host/网络/弹窗、Mermaid 渲染/恢复/缓存、死循环看门狗、窗口清理），exit 0。
  - 抽复验 0157/0158 关键面：theme-ui markdown 族 47/47；desktop 定向（terminal-launch/ipc markdown/markdown-images/useMarkdownHost/RenderBudget/WebsiteIcon/Media）37/37；presets/scripts 15/15；plugin-sdk 69/69——与批次交付声明一致。
  - 影响面与完整 check：test:impact（直测 2 + 相关面 14 文件 76 例）全绿；根 tsgo 0 错；完整 `bun run check` exit 0（lint/types×4/guards）。
- 未运行及原因：verify:ui（无视觉能力且未授权）；真实 Provider/SSH/终端实机（政策不允许）；0158 scripts 插件实机面板（静态审计 + 既有套件覆盖）。
- Worktree：task-0200-rich-content-audit-fixes（bun install + prepare:workspace:dev + Electron dist 复制完成；worktree:check TASK-0200 无冲突对）。
- 剩余风险：批注面板 actions 经 layoutEffect 异步发布，极端首帧内选中右键的理论窗口与上游终态一致；README 0196 行修正与主工作区未提交的同文件编辑可能在 dev 合并时叠加，按共享文件合并纪律处理。

### 人工验收实测（2026-10-07，VERIFY-0017 组一）

- 采样方法：`page.addInitScript` 在文档初始化前装帧级采样器（滚动容器身份、项数、scrollTop、scrollHeight 的变化点），`page.reload()` 触发应用冷启动，即 activeSession `null → 就绪` 的过渡。
- 结果：消息列表滚动容器在 t≈8.65s 以**空列表**挂载（0 项、scrollHeight 571），t≈9.27s 内容到达时仍是**同一个 DOM 节点**——列表子树未卸载重挂，上游 c362aacc4 回归合同在本仓成立；scrollTop 由 0 直接落到 1617（底部），无来回抖动。另从设置路由点开会话：同一容器 scrollTop 单调 0 → 2581 → 3535，内容到达后位置未重置。
- 工程侧复跑：`bun run test SessionMessageList.stability.test.tsx + annotations/`＝2 文件 12 例通过（挂载计数 1→2 的回归合同）；`markdown-isolation` e2e PASS 见上方交付记录。
- 按用户「全程自动」验收授权记为 `done`；用户如不认可按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 回退为 `verifying`。
