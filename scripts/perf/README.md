<!-- Copyright The Open Forge contributors. -->

# Desktop 资源基线脚本（TASK-0448）

为 PLAN-0029 各阶段提供可复算的 Desktop 分进程资源基线：启动耗时、空闲内存、N 会话内存（main / renderer / gpu / utility / other），以及大仓遍历与 `rg` 搜索耗时 p95。

| 文件 | 作用 |
|---|---|
| `baseline-stats.mjs` | 纯函数：nearest-rank 百分位、汇总、波动评估、进程表解析与分类、日志标记解析、数据目录隔离判定 |
| `desktop-baseline.mjs` | CLI：启动 Desktop、采样、扫描计时、写 JSON |
| `*.test.mjs` | 解析与汇总逻辑单测 |

## 前置条件

- 运行会启动真实 Electron，属于 UI/真实运行验证，**必须先取得当前任务授权**。
- 先构建 Desktop（dev 形态需 `apps/desktop/dist/main/index.js` 与 renderer 产物），或准备好打包后的可执行文件。
- 脚本不设置 `VETTA_DESKTOP_DEV_URL`，dev 形态从 dist 加载 renderer，不需要 dev server。
- `--sessions > 0` 需要交互终端：脚本暂停，由操作者在被测窗口里手工打开会话后回车。

## 命令

单测（仓库 Node runner）：

```bash
bun scripts/quality/run-vitest.mjs --run scripts/perf/baseline-stats.test.mjs scripts/perf/desktop-baseline.test.mjs
```

性能脚本测试也包含在 `bun run test:quality` 中；仅变更 `scripts/perf` 时，`test:changed` 会选择这份质量套件。
CLI 收到 SIGINT / SIGTERM 时等待当前进程树清理完成，再分别以 130 / 143 退出；重复信号共用同一次清理。

测量（需授权）：

```bash
# dev 形态，默认 3 次，扫描本仓（bash / Git Bash；PowerShell 用 "$env:TEMP\of-perf-baseline"）
node scripts/perf/desktop-baseline.mjs --data-dir "${TMPDIR:-/tmp}/of-perf-baseline"

# 打包形态，5 次，2 个会话，固定样本仓库
node scripts/perf/desktop-baseline.mjs --runs 5 --sessions 2 \
  --app "C:/Program Files/Open Forge/Open Forge.exe" \
  --data-dir "D:/perf/of-baseline" --scan-root "D:/samples/large-repo" --out "D:/perf/baseline.json"
```

`--help` 列出全部参数（另有 `--keyword`、`--startup-timeout-ms`、`--idle-ms`、`--max-relative-range`）。

## 数据目录隔离

- `--data-dir` 必填，必须是绝对路径。不得与 `~/.openforge`、`~/.vetta`、`~/.openforge-dev`、`~/.openforge-ui-verify`、当前 `VETTA_HOME` / `VETTA_CONFIG_DIR`、Electron 默认 userData 根（`%APPDATA%`、`~/Library/Application Support`、`$XDG_CONFIG_HOME`）、仓库根互相包含；不得等于或包含用户主目录、`%LOCALAPPDATA%`。按符号链接解析后的真实路径（Windows 下同时展开 8.3 短名）再判一次。
- `--scan-root` 使用同一套判定（仓库根除外，允许扫描本仓），不得落在上述真实状态根内。
- 目录须为空或带 `.openforge-perf-baseline` 标记（本脚本创建过）。
- 每次运行使用 `<data-dir>/baseline-<stamp>/run-k/` 下的 `vetta-home`、`electron-user-data`、`home`。子进程环境删除全部 `VETTA_*`、`ELECTRON_*` 与 `NODE_OPTIONS`，再设置 `VETTA_HOME`、`VETTA_DESKTOP_USER_DATA_DIR`、`HOME`；Windows 另设 `USERPROFILE`、`APPDATA`、`LOCALAPPDATA`，Linux 等另设 `XDG_CONFIG_HOME`、`XDG_DATA_HOME`、`XDG_CACHE_HOME`、`XDG_STATE_HOME`，都指向本次运行的 `home` 下，macOS 不额外设置。
- Electron userData 的实际隔离靠 `--user-data-dir`：`VETTA_DESKTOP_USER_DATA_DIR` 只由 `apps/desktop/scripts/run-dev-electron.mjs` 读取并转成该开关，Desktop 主进程不读它。单实例锁按 userData 区分，不会与用户正在运行的 Desktop 冲突。
- 进程树清理只结束本次记录过、且命令行与创建时间都一致的进程，防止 PID 复用误杀；POSIX 的进程组信号在根进程已退出且无已记录存活进程时不再发送。
- 日志只从隔离的 `vetta-home/desktop-app/logs/main/` 读取；输出中主目录前缀替换为 `~`，进程命令行不写入输出。

## 输出字段

| 字段 | 内容 |
|---|---|
| `units` | 时长 `ms`，内存 `bytes` |
| `machine` | 平台、OS 版本、架构、CPU 型号与逻辑核数、总内存 |
| `commit` | `sha` 与已跟踪文件改动数 `trackedChanges` |
| `app` | 形态 `dev-dist` / `packaged`、路径、Electron 版本（dev 形态） |
| `tools` | 运行时、进程采样方式、`rg` 版本 |
| `parameters` / `isolation` | 本次参数与隔离方式 |
| `eventLoopDelay` | 固定为 `{ available: false, reason }` |
| `runs[]` | 每次运行：`startup`（`method`、`externalMs`、`internalDurationMs`、`firstRendererObservedMs`、`contentPaint`）、`idle` / `sessions` 的逐进程原始样本与 `byType` 聚合、扁平 `metrics`、`cleanup.leftoverProcessCount` |
| `runs[].metrics` | 启动按方法分键：`startup.<method>.externalMs`、`startup.<method>.internalDurationMs`，另有 `startup.firstRendererObservedMs`；不同方法的数值不混入同一指标 |
| `summary` | `mergeRuns` 结果：每个指标的 `{ n, min, p50, p95, max, mean }`、相对极差波动 `variation`、启动方法计数 `startupMethods` |
| `scan` | `walk` 与 `search` 的原始样本 `samplesMs` 和汇总 |

启动方法：

- `log-marker:content-frame-visible` 首选：从启动子进程到日志里 "renderer content frame visible" 时间戳的外部耗时。
- `log-marker:boot-frame-visible`：没有内容帧时退到 boot 帧。
- `first-renderer-process`：没有可用日志时的近似值。

`internalDurationMs` 是 Desktop 日志自报的 `durationMs`，起点是主进程注册完协议、开始准备会话与创建窗口之前（`main.ts` 中 `rendererBootStartedAt` 的重置点），不含 Electron 启动与 app ready 之前的时间。

控制台按方法分别输出启动 p50 / p95。

## 已知限制

- 事件循环延迟无外部读取通道，本任务不改 Desktop 运行时，需另拆埋点 Task。
- 每次运行都是全新 userData，测的是首启冷状态，不代表日常热启动。GUI 模式会初始化主进程遥测，其是否发起网络请求未核实；打包形态在 app ready 后后台检查一次更新，dev 形态不检查。两者都可能影响启动与空闲数值。
- POSIX 的 `ps` 没有私有内存列，`privateBytes` 为 `null`，聚合时不汇总私有字节。只有 Windows 的 `PrivatePageCount`（提交的私有字节）可用，两平台的工作集也不完全等价。
- 启动时间点靠轮询，分辨率等于一次进程表查询加 250ms；Windows 的 CIM 查询本身约需数百毫秒。日志时间戳精确到 ms，跨进程时钟同源。
- 会话数由操作者手工打开，不自动化；会话内存受操作内容影响。
- 冷/热缓存未区分：首次遍历通常偏慢，原始样本都保留。遍历跳过 `.git`、`node_modules`；`rg` 遵循 `.gitignore`，两者口径不同。
- 波动阈值 `--max-relative-range` 只用于标注，不是承诺指标；单机数值不能写成承诺。
