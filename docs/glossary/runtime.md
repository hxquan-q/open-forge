<!-- Modified by The Open Forge contributors. -->
# 托管运行时与环境

从[根术语索引](../../CONTEXT.md)按需进入。本册保留原有词条记录；其中的历史方案、实现线索和兼容标识不是对当前行为的重新确认，发生冲突以源码、类型和测试为准。`[[词条]]` 可回到根索引查找。分册用于导航，不建立新的运行时或模块边界。

### 托管运行时（managed runtime）

由 desktop 替普通用户托管、落在用户目录下的语言运行时（v1 = Node、Python）。与「系统运行时」（用户机器上原本就有的、由用户自己装的 node/python）对立。bash tool 执行命令时优先让托管运行时可见，目的是让缺少开发环境的普通用户也能跑依赖 node/python 的 agent 能力。

刻意**不含原生编译工具链**（gcc/make/MSVC）——那是另一类问题（见 [[源重定向]] 不解决编译，只解决「源不可达」）。git/ffmpeg 等通用 CLI 可作为同构的可选附加项，但不属 v1「运行时」叙事。

### 运行时来源三层（runtime source tiers）

[[托管运行时]] 的获取按优先级分三层，互补而非互斥：

1. **内置 vendor**：随安装包打入当前构建平台的运行时二进制，首次启动**本地拷贝**进托管目录——零下载、秒级可用，是普通用户首启的主路径。
2. **下载源列表**：一个 `urlTemplate + priority` 的有序回退列表，仅用于「升级/装非内置版本/其他平台」。源是**配置项**——「现在填公共镜像、将来插一个自建 CDN 作 priority-0」对它只是加一行，不是重写。
3. **系统探测**：扫描用户机器已有的 node/python，能复用则不下载。

「下载下来就有环境」这一体验来自第①层；第②层是 Node（npmmirror 稳定）与 Python（python-build-standalone 仅 GitHub 发布、国内无稳定公共镜像）**可靠性不对称**的兜底，也是自建 CDN 的最终归宿。

### 源重定向（source redirection）

在 bash tool spawn 子进程的瞬间注入临时环境变量，把包管理器指向国内可达镜像、并把 [[托管运行时]] 的 bin 前置进 PATH 的机制。复用既有的 `getShellEnv()`（已把 `~/.vetta/agent/bin` 前置）这一注入点扩展。

只解决「官方源不可达」，**不解决「需要现场编译」**。典型注入项：`npm_config_registry`、`npm_config_prefix`（全局包落私有目录、与运行时版本解耦、不污染系统）、`npm_config_cache`，以及 pip 侧的 index/trusted-host。

### 环境管理（Environment Management）

desktop 系统设置中新增的面板，普通用户在此查看/获取 [[托管运行时]]。是「专业性太强、依赖开发环境」这一痛点的用户入口。面板暴露的是运行时本身，[[源重定向]] 对用户透明（在 bash 执行时自动发生）。
