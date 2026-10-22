<!-- Copyright The Open Forge contributors. -->

# HANDOFF · TASK-0368 · 窗口 B

- **Task**：TASK-0368 SQLite 驱动与多运行时隔离门禁
- **派工代次**：1
- **状态**：**candidate**（实现、规定验证与自审完成，待 Coordinator 审查）
- **Base commit**：9bb2d8a77（派工行核实值；Coordinator 随后以 802233321 重校基线并登记 TASK-0197 冲突，本报告基线随之视为 802233321）
- **Branch**：`task/TASK-0368-memory-sqlite-native-probe`
- **Worktree**：`C:\Users\xquan\Desktop\open-forge-wt\task-0368-memory-sqlite-native-probe`
- **候选提交**：承载本报告及其配套实现的提交（避免自引用 Hash；集成时以本分支 tip 为准）
- **报告人**：窗口 B（开发 Worker）；日期 2026-10-22

## 实际修改文件

| 文件 | 变化 |
|---|---|
| `scripts/verify-memory-native.mjs` | 新增。隔离 probe 驱动：仓库外临时目录固定版本安装候选驱动；node/bun/electron 三真实运行时各跑 12 项检查（见下）；输出人类可读矩阵 + JSON；退出码 0/3/4 区分通过/失败/全跳过。 |
| `scripts/verify-memory-native.node-test.mjs` | 新增。15 例合同测试（node --test 直跑，无网络/原生依赖）：参数解析与精确版本门禁、隔离目录拒绝仓库内路径、运行时计划与跳过原因、短词合同不变量、FTS5 字面量转义、报告渲染、PATH 解析、子探测模板完整性、--help 子进程。 |
| `project/tasks/TASK-0368-memory-sqlite-native-probe.md` | 交付记录/验收分层/测试与验证按实测更新（本文件属本 Task 写域）。 |
| `project/verification/HANDOFF-TASK-0368-window-b.md` | 本报告。 |

**零变化区**：生产代码、生产依赖清单（含 `packages/runtime-node/package.json`）、`bun.lock`、`apps/desktop/src/main/shims/node-sqlite.ts`、共享 node_modules、公共索引、发布说明——均未触碰。

## 行为变化

仓库新增一个独立验证工具，不接入任何生产路径。运行方式：

```bash
node scripts/verify-memory-native.mjs --help
node --test scripts/verify-memory-native.node-test.mjs
node scripts/verify-memory-native.mjs --keep --json <临时>/matrix.json --work-dir <临时>/work
```

## 验证命令与结果（win32-x64，2026-10-22 实测）

1. `node --test scripts/verify-memory-native.node-test.mjs` → **15/15 通过**。
2. `node scripts/verify-memory-native.mjs --help` → 退出 0。
3. 全矩阵 probe → **退出 0**，三运行时 × 12 检查全 PASS：

| 运行时 | 版本事实 | 12 项检查 |
|---|---|---|
| node | 26.3.1，ABI 147 | 全 PASS |
| bun | 1.4.2（报 node 26.3.0/ABI 147） | 全 PASS |
| electron | 41.10.7，真实 browser 进程（process.type=browser），内嵌 node 24.18.0，**ABI 145** | 全 PASS |

检查项：runtime-info、load-binding（显式 nativeBinding + SQLite 3.53.4 + ENABLE_FTS5）、pragmas-wal（wal/foreign_keys/busy_timeout）、transactions（回滚/第二连接可见/FK 约束拦截）、fts5-unicode61（CJK 整 token 命中、短词 0 命中=不分词）、fts5-trigram（3 字命中、1/2 字 MATCH 0 命中=官方边界、**裸 `runtime-node` 查询报 no such column、转义后命中**）、short-word-instr（参数化 instr 回退 1/2 字命中 + 授权过滤）、fts5-literal-escape（字面量 OR 仅命中精确子串行、裸 OR 扩展为运算符、含引号/星号字面量命中、裸引号报语法错）、persistence-reopen、backup-restore、worker-threads（worker 内 open→write→close + 主线程复核）、abi-mismatch-error（wrong-arch 二进制明确报错，不静默）。

固定产物证据：驱动 `better-sqlite3@13.0.3`；binding `prebuilds/win32-x64.node`，sha256 `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`。

## 关键技术结论（S0b 门禁答案）

1. **驱动选型可行**：better-sqlite3@13.0.3 基于 N-API（node-addon-api@8），npm 包内捆绑全平台 prebuilds（无 postinstall 下载、无需 node-gyp）。**Electron ABI 145 与 Node ABI 147 实测加载同一 win32-x64.node**——无需 electron-rebuild，无需 per-ABI staging（与 @lydell/node-pty 的多平台包模式不同）。
2. **FTS5 可用且合同清晰**：SQLite 3.53.4 compile_options 含 ENABLE_FTS5；unicode61/trigram 行为符合官方合同；中文短词必须走参数化 instr 回退；任意用户查询必须经字符串字面量转义（probe 已固化 `escapeFts5StringLiteral` 行为）。
3. **worker_threads 三运行时可用**：node/bun/electron 主进程内 worker 加载驱动、写入、干净关闭均实测通过。
4. **不匹配二进制有明确错误**：wrong-arch 加载在三运行时均给出明确 LoadLibrary/dlopen 错误，不会静默成功。

## 未运行项（如实申报）

- darwin（arm64/x64）与 linux（x64/arm64）平台矩阵：无环境，未验证。放行前须在对应环境重跑同一 probe（工具已就位，命令同上）。
- Electron asar 打包产物内加载：本 probe 验证的是运行时与二进制能力；打包链路（asarUnpack、staged node_modules）属后续 Task/打包验证。
- scripts/agents 套件时序 flake（test:impact 触发）：单跑绿、主工作区干净基线同样红，已归因为先存环境 flake（详见任务记录"质量检查"段），与本 Task 无因果。

## 剩余风险

- 多平台结论未兑现（见未运行项）；S0b 的"各目标逐一确认"目前只有 win32-x64 证据。
- bun/Electron 的 worker 证据是单次运行；并发压力下的稳定性未覆盖。
- probe 默认驱动版本固定 13.0.3；上游新版本变更（如放弃包内 prebuilds）需改 `DEFAULT_DRIVER` 重验。

## 需要 A 处理/知悉的事项

1. **先存门禁红（非本 Task）**：`bun run check` 在本 Worktree 与主工作区基线均因声明头 ratchet `packages/theme-ui/src/activity/ActivityPanel.tsx`（new=1）红；修复在 origin/dev 7326aa159，与本批不合入 origin/dev 的决定冲突，请 Coordinator 决定批内处理方式（如临时 waiver 或接受基线红归因记录）。
2. **scripts/agents flake**：runner/integrate/release 三测试文件在并行 impact 下间歇红（单跑绿、基线同样红）。建议 Coordinator 决定是否另行登记（不属本 Task 写域，我未动）。
3. **TASK-0197 冲突**：已按登记串行集成；如 TASK-0197 侧也写根 scripts/，请以其合同为准排序。
4. 生产 staging 接入清单已写入任务交付记录（五步：固定版本依赖声明 → packaged-native-dependencies DEFINITIONS 增条目 unpack:true → 打包后 verify-packaging-contract 实测 → worker 显式 nativeBinding → 检索层内置字面量转义+instr 回退）。

## 后续

等待 Coordinator 审查：如需修复，本窗口在原 Task/Worktree 继续并追加候选提交；确认集成后等待下一项正式派工（TASK-0381 按 DAG 需 0379 集成后才会派发，不提前实施）。
