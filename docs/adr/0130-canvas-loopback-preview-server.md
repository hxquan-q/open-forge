<!-- Copyright The Open Forge contributors. -->
# ADR-0130：Canvas 本地试跑用主进程只读回环伺服

## 状态

已接受（PLAN-0009 P2 决策冻结；TASK-0099 写入合同）

## 背景

HTML artifact 在 Canvas 里跑在 `<webview>` 强沙箱中（ADR-0129 §3）：CSP 默认 deny、导航一律拦截、无 Node、无特权 preload。这个基线让不可信产出不能碰到宿主，但也让"网页原型"这类本来就要联网、要跳转、要多媒体的产物无法试跑。

可选路径只有三条：放宽 `<webview>` 策略、把 HTML 注入到 Browser Tab、或者让本机某个只读服务把 artifact 当成普通网页伺服给 Browser Tab。前两条都会削弱 ADR-0129 明确要保持的安全基线（沙箱降级、或向 Browser 注入匿名 HTML 绕过 HTTP/HTTPS 校验），因此选择第三条。代价是主进程里多一个本地 HTTP 监听者，这属于"难以逆转 + 没有上下文会令人意外 + 存在真实取舍"，需要记录。

## 决策

### 1. 回环伺服由主进程持有，按需启停

1. HTML artifact 预览栏提供「在浏览器打开」；点击后主进程起一个只读静态伺服，把用户显式打开的那一个 artifact 以 `http://127.0.0.1:<port>/canvas/<bucket>/<artifactId>/index.html` 暴露给内置 Browser Tab。
2. **并列的第二条路径**：默认预览仍是 `<webview>` 沙箱，本次不改它的 CSP、导航拦截、进程隔离或 preload 基线；也不放宽 `isAllowedBrowserTabUrl` 的 HTTP/HTTPS 校验——回环地址本身就是 https/http 之一。
3. 服务随第一次打开懒启动，窗口关闭或应用退出时释放；不常驻、不持久化端口。

### 2. 安全约束（每条都有对应测试）

| 约束 | 实现 |
| --- | --- |
| 只监听本机 | 固定 `127.0.0.1`，不留对外网卡的绑定入口 |
| 不与用户服务抢端口 | `listen(port: 0)`，由内核分配空闲端口 |
| 只读 | 非 `GET`/`HEAD` 一律 405，响应带 `Allow: GET, HEAD` |
| 只伺服打开过的 artifact | `bucket/artifactId` 授权集，未授权请求一律 403 |
| 只伺服当前工作空间的画布 | URL 里放 `encodeCanvasWorkspaceBucket(workspaceId)` 的 base64url bucket，而不是 workspaceId 原文（Windows 工作空间是绝对路径，塞进 URL 既要转义又会暴露本机目录结构） |
| 目录穿越与符号链接逃逸 | 单次解码后按字面段校验（拒绝 `..`、编码分隔符、二次编码、空字节、绝对路径），再对目录与文件各取一次 realpath 要求落点在画布根/artifact 目录内 |
| 不缓存上一版 | `Cache-Control: no-store`；每次请求重新解析入口文件，Agent 写出新版本后刷新即生效 |

### 3. 入口与版本语义

`index.html` 是该 artifact 最新 HTML 版本的对齐别名（`v<n>.html|htm|xhtml` 中版本号最大者）；同时允许按 `v<n>.<ext>` 直接寻址同一 artifact 目录内的版本文件。页面不共享 artifact 之外的文件，也不提供写入口，artifact 的版本自增与乐观锁仍只由 `CanvasArtifactService` 决定。

### 4. 不引入新的编辑协议

回环页面上的元素点选继续走既有 `mod+shift+d` 选取器与 `vetta.canvas.artifact-selection` capsule；本决策只增加"在哪运行"，不定义第二套 DOM/CSS 回传协议，也不改 `browser_tab` 工具合同与审批分级。

## 备选方案

| 方案 | 未采纳原因 |
| --- | --- |
| 放宽 `<webview>` 的 CSP/导航策略 | 直接推翻 ADR-0129 §3 的不可信产出隔离，所有 artifact 一起降级 |
| 把 HTML 以 `data:` / `srcdoc` 注入 Browser Tab | 绕过 Browser 只收 HTTP/HTTPS 的校验路径，且 `data:` 页面没有可用的同源与相对路径语义 |
| 固定端口（如 7788） | 与用户机器上任何服务都可能冲突，失败还会表现为"预览打不开"这种难以诊断的症状 |
| 按 workspace 起多个伺服实例 | 每个 workspace 多一个监听者与生命周期，收益仅是 URL 少一段；bucket 段已经表达工作空间归属 |
| 伺服整个画布根（任意 artifact 可读） | 页面里的一段脚本就能读到其他 artifact 内容；授权集把可读范围收敛到用户主动打开的那一个 |
| 让页面自带 dev server / 读 `file://` | 前者要求用户理解项目构建，后者被 Electron `file:` 导航与同源策略拦截 |

## 后果与边界

- 主进程新增一个本地监听者：只要用户在 Canvas 点过「在浏览器打开」，进程存活期内就有一个只读端口；窗口关闭与应用退出都会释放（`bun run test:impact`、`canvas-preview-server.test.ts` 的端口释放用例覆盖）。
- 画布目录仍是只读事实源：伺服没有任何写方法，artifact 的变更只能经既有 `CanvasArtifactService` 写入。
- 页面可以访问本机其它 HTTP 服务（这是"完整浏览器环境"的题中之义，与用户在 Browser Tab 里手输 `localhost:3000` 等同）。反过来说，这个端口也能被本机其它进程访问——它只暴露用户显式打开过的 artifact，且不含凭据。
- 单主窗口假设：窗口 `closed` 的 IPC teardown 会释放伺服。未来若并列多个主窗口，需要改成引用计数或按窗口分实例。
