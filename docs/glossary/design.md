<!-- Modified by The Open Forge contributors. -->
# 设计文件与画框

从[根术语索引](../../CONTEXT.md)按需进入。本册保留原有词条记录；其中的历史方案、实现线索和兼容标识不是对当前行为的重新确认，发生冲突以源码、类型和测试为准。`[[词条]]` 可回到根索引查找。分册用于导航，不建立新的运行时或模块边界。

### .vetd（Vetta Design 文件）

「Vetta UI Design」系统插件的设计文档格式，同一扩展名下有**两种形态**，靠文件头嗅探区分：

- **工作态**：`x.vetd` 是 JSON 清单（画布视口、frame 布局、theme 引用），frame 源码与 theme.css 是同级 [[旁挂目录（.vetd.d）]] 里的真实文件。本地编辑的唯一形态——agent 直接用文件工具改源码，热更新靠 [[共享引擎（design engine）]] 的 vite HMR。
- **打包态**：zip 自包含单文件（清单 + 源码 + 构建产物 dist 快照），**只读快照**，仅用于导出分享与预览；要编辑必须先「导入」解包成工作态。

_Avoid_: 把打包态当第二个工作格式（在 zip 上直接编辑）；把工作态清单里内嵌源码。

### 旁挂目录（.vetd.d）

工作态 [[.vetd（Vetta Design 文件）]] 旁与之命名约定绑定的目录（`x.vetd` ↔ `x.vetd.d/`），存放设计的**纯源码**：各 [[Frame（设计画框）]] 的 TSX 文件与共享 `theme.css`（Tailwind v4 `@theme` 令牌，即统一色彩系统）。**不含 node_modules、不含构建配置**——依赖与工具链属于 [[共享引擎（design engine）]]。它是 agent 编辑的落点；与清单脱钩（单独移动其一）是已知代价，靠命名约定与导出命令缓解。

### Frame（设计画框）

画布上一个可自由摆放、拖拽改尺寸的设计视口，源码形态是 [[旁挂目录（.vetd.d）]] 里的一个 TSX 文件（React 组件），由 [[共享引擎（design engine）]] 编译后以 iframe 呈现。选中 frame 或其内部 DOM 可 attach 给 agent 定向修改；agent 正在改某 frame 时该 frame 呈「修改中」态。

**所有权分界（frame meta）**：tsx 具名导出 `export const frame = { width, height, title }` 由 agent/设计者拥有，**meta 是声明，清单是现状**——meta 宽高在 frame 首次被发现时作为初始值进清单；用户拖拽改尺寸只写清单、不回写 tsx；agent 后续改 meta 则清单跟随（最后写者胜）；attach 载荷始终给清单当前尺寸。画布位置只存清单，由插件独占写入（watch 到新 frame 文件即读 meta、自动摆位补清单）。agent 不写清单、不设专用写入 tool（frame 增删改全走原生文件工具），专用 tool 只有骨架创建（vetd_create）、视觉反馈（vetd_screenshot）与构建状态查询（vetd_status）。
_Avoid_: 叫「页面」「artboard」；把 frame 理解为静态 HTML 文件（早期设想，已被工程路线取代）；让 agent 直改 x.vetd 清单。

### 共享引擎（design engine）

「Vetta UI Design」插件托管的**单一** vite + React + Tailwind v4 模板工程：锁死版本、预装 node_modules（随插件预置或首启一次性下载），内含 @iconify/tailwind4 与 JSX 源码插桩（dev 注入 `data-source` 文件:行号，生产构建不注入）。每个打开的 .vetd 由引擎挂载其 [[旁挂目录（.vetd.d)]] 源码起一个 vite dev server（依赖宿主长驻进程 SDK 与托管 Node 运行时），画布 iframe 指向 localhost 获得 HMR。设计文档自身永不携带依赖与工具链。
_Avoid_: 每个 .vetd 各自一套 node_modules / 各自 npm install。
