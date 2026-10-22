<!-- Modified by The Open Forge contributors. -->
# ADR-0150：runtime-memory 窄合同包与 SQLite 事实源方向

## 状态

已接受（2026-10-22，REQ-0027 / PLAN-0021 S1，TASK-0369；驱动证据 TASK-0368）。

## 背景

记忆的持久层需要同时服务 Desktop（Electron 主进程 + worker）与 CLI（Node 多进程），
而仓库依赖方向要求 `runtime-node` 不得依赖产品包（`coding-agent`），协议也不能塞进
`runtime-storage`（其根出口专注 Conversation）。候选：Markdown 文件堆、SQLite 事实层、
整搬外部记忆框架、图服务。PLAN-0021 已评估并选 SQLite + 窄合同包；TASK-0368 在
win32-x64 上实测 better-sqlite3@13.0.3（N-API prebuilds，node/bun/electron 三运行时
加载同一二进制、FTS5 开启、中文短词与字面量转义合同成立）。

## 决策

1. **新增 `packages/runtime-memory`（`@vetta/runtime-memory`）**：只放无 I/O 的协议
   合同——作用域/授权、修订与双时态、来源引用、遗忘屏障、写命令与并发规则、稳定错误、
   typebox Schema 与共享 fixture（`/fixtures` 子出口，测试专用）。不依赖
   `runtime-core` 以外任何内部包（当前为零内部依赖），生产源码不导入 `node:*`。
2. **职责边界**：SQLite 实现、worker、迁移与租约属 `runtime-node/memory`（后续切片）；
   抽取策略、注入预算、工具语义属 `coding-agent`；宿主身份解析与授权属 Desktop/CLI
   组合层。本包不成为「记忆引擎」，不调度模型，不管理会话。
3. **数据合同方向**：修订链 + 有效区间双时态（valid time / known-at 分离，迟到更正
   追加不覆写）；家族级遗忘（erasure epoch 单调递增 + suppressed 集合，提交前重检，
   绝不恢复 parent 为当前值）；correct 必须携带 expectedRevision（冲突报
   REVISION_CONFLICT，不 last-write-wins）。
4. **导出与版本线**：包走仓库统一 0.1.3 版本线；公共出口只有 root（合同面）与
   `/fixtures`；Markdown 保留为可审计导出与旧数据入口，不是事实库。
5. **驱动门禁沿用 TASK-0368 结论**：生产接入时固定 `better-sqlite3@13.0.3`、
   asar unpack `.node`、显式 nativeBinding、检索层内置 FTS5 字面量转义与短词
   instr 回退；darwin/linux 矩阵在对应环境复验前不扩大平台声明。

## 取舍

- 不选图服务/向量库为首版前提：混合检索的语义召回是可选叠加（S5），事实与来源
  合同不依赖它。
- 不把 Schema 定义当作功能交付：本包只承诺合同与 fixture；真实存储/检索行为由
  runtime-node 实现切片的合同测试证明。

## 后果

- `runtime-node`、`coding-agent` 及未来宿主共享同一份 fixture 判定合法/非法输入，
  两侧测试不会对同一输入给出不同答案。
- 新增包需持续通过 exports/边界/版本线门禁（check:guards 的 package-boundaries、
  version-lines、context-boundary）。

## 回滚

包无运行时副作用；未进入生产依赖图前可整体移除（workspace/tsconfig/bun.lock 三处
登记同步回退）。进入生产后按 REQ-0027 回滚合同执行（只关 Feature，不动数据）。
