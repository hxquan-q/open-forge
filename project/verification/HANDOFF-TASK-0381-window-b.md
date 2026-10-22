<!-- Copyright The Open Forge contributors. -->

# HANDOFF · TASK-0381 · 窗口 B

- **Task**：TASK-0381 本地 embedding 资源与版本化向量存储
- **派工代次**：1
- **状态**：**candidate**（实现、规定验证与自审完成，待 Coordinator 审查）
- **Base commit**：e66f1f259（派工定稿：分支 HEAD = 该提交；派工行原写 1ba7d8bde，Coordinator 201fb087e 已定稿为 e66f1f259）
- **Branch**：`task/TASK-0381-memory-local-embedding`
- **Worktree**：`C:\Users\xquan\Desktop\open-forge-wt\task-0381-memory-local-embedding`
- **候选提交**：承载本报告及其配套实现的提交（避免自引用 Hash；集成时以本分支 tip 为准）
- **报告人**：窗口 B（开发 Worker）；日期 2026-10-23

## 实际修改文件

| 文件 | 变化 |
|---|---|
| `packages/runtime-node/src/memory/embedding/embedding-adapter.ts` | 新增。适配端口：`EmbeddingAdapter`/descriptor/向量空间键；确定性适配器（种子哈希，非语义，测试/夹具用）；ONNX 适配器（资源四态校验→懒建会话→前缀注入→维度校验，资源不可用即明确报错，绝不下载）；稳定错误码四枚。 |
| `packages/runtime-node/src/memory/embedding/vector-store.ts` | 新增。版本化向量存储：独立连接同一记忆 SQLite 库；`memory_vectors` 表以（model/revision/dimension/normalization）入主键，全部查询携带完整空间键→跨版本混算结构性不可能；写入点校验维度/l2 范数并拒绝 suppressed；检索过滤 scope/suppressed/有效时间；purgeMemory/purgeScope/dropSpace 支持索引 epoch 重建。 |
| `packages/runtime-node/src/memory/embedding/embedding-jobs.ts` | 新增。持久任务队列（幂等键=空间+修订+内容hash、lease/attempt、过期回收）与执行器（完成前复检入队时 erasure epoch 与 suppressed 集合；模型失败→failed 原因可读）。 |
| `packages/runtime-node/src/memory/embedding/index.ts` | 新增。模块再导出。 |
| `packages/runtime-node/test/memory/embedding-adapter.test.ts` | 新增。14 例合同测试（真实临时 SQLite + 真实事实 worker/擦除层）。 |
| `apps/desktop/src/main/memory/embedding-models.ts` | 新增。候选模型目录（e5-small：维度 384、query/passage 前缀、MIT 模型卡许可、ONNX 产物坐标；checksum/bytes/运行库版本如实 null）与 ready/unavailable/degraded 纯函数状态解析；无 I/O、无下载。 |
| `apps/desktop/src/main/memory/embedding-models.node-test.mjs` | 新增。3 例合同测试（node --test 直跑，经 file URL + Node 类型剥离导入 .ts）。 |
| `project/tasks/TASK-0381-memory-local-embedding.md` | 合同更新（frontmatter 同步派工定稿 + 交付记录）。 |
| `project/verification/HANDOFF-TASK-0381-window-b.md` | 本报告。 |

**零变化区**：`packages/runtime-node/package.json`、`bun.lock`、`migrations/migrations.ts`、`src/memory/index.ts` 及其他生产既有文件——均未触碰（理由见下）。

## 关键设计决定（供审查）

1. **向量表不进 MEMORY_SCHEMA_VERSION 事实迁移**：沿用 0372 词法索引先例（派生索引表由本模块自建自管、可整体丢弃重建）。模型升级 = 新向量空间 + `dropSpace` 旧空间，事实层零影响，符合「索引模型升级是独立 epoch，可重建」的兼容合同。
2. **不新增安装依赖**：ONNX 运行库（候选 `@huggingface/transformers`）按目录声明、经注入的 `LocalEmbeddingRuntime` 端口懒加载；未经打包门禁验证的重依赖不进 package.json（better-sqlite3 先过 0368 门禁才进依赖的先例）。真实运行库绑定在授权下载模型时一并钉住并验收。
3. **checksum 如实 null**：e5-small 的 ONNX 量化产物 sha256/bytes 未钉住——「模型卡可用 ≠ 已有可发布本地产物」；`resolveEmbeddingModelStatus` 对未钉住候选一律 unavailable，杜绝伪装 ready。
4. **被忘事实三重防线**：入队记录 epoch → 完成前复检 epoch+suppressed（放弃不写回）→ 写入点再拒 suppressed；检索期再过滤。

## 验证命令与结果（2026-10-23 实测）

1. `packages/runtime-node` 内 `bun run test test/memory/embedding-adapter.test.ts` → **14/14 通过**。
2. `node --test apps/desktop/src/main/memory/embedding-models.node-test.mjs` → **3/3 通过**。
3. 根 `bunx tsgo --noEmit` → 无错误。
4. 完整 `bun run check`（本 Worktree）→ types（root/desktop/docs/mobile）与 lint、mobile-lint 全绿；check:guards 唯一红为 `[project-indexes] project/tasks/README.md:42: unknown TASK-0365`——该行由并行会话提交回共享索引而文件未入库，主工作区因未提交文件在盘而判绿、任何干净检出必红；属主线血统先存问题，不在本 Task 写域（证据：主工作区 `node scripts/quality/check-project-indexes.mjs` 退出 0，本 Worktree 干净检出退出 1，两者均不含我的改动）。声明头 ratchet new=0。
5. `packages/runtime-node` 全包测试：89/92 文件通过；3 文件红（import-export 3 例「validFrom 必须是非空字符串」、glob/grep 合同 7 例）——主工作区基线（无我的文件）单跑同样红，属先存回归/环境问题，与本 Task 无因果。
6. `bun run test:impact -- <本 Task 路径>` 在本机并行重套件下 20 分钟无产出（疑似卡死），已终止；以上述定向测试 + 全包测试 + 完整 check 的等价覆盖替代并如实记录。

GWT 对照：生成向量/重启/升级版本→维度归一化一致、不同版本禁止混算、事实不改（memory_revisions 行数前后一致）；未下载/下载损坏/加载取消/来源遗忘→状态与错误码明确、词法检索同库仍可用、被忘事实无向量写回（abandoned + 写入点拒绝）。

## 未运行项（如实申报）

- 真实模型下载与 ONNX 实际推理（需用户授权；届时钉 checksum/bytes/运行库版本并独立验收）。
- macOS/Linux 平台行为（无环境）。
- 真实 e5 量化产物的质量/体积/加载延迟实测；多进程并发写向量表压测（沿用 WAL+busy_timeout 约定，未加压）。
- Desktop UI 入口（后续控制面任务范围）。

## 需要 A 处理/知悉的事项

1. **写域扩展请求（一行）**：`packages/runtime-node/src/memory/index.ts` 增加 embedding 再导出（`export ... from "./embedding/index.js"`）。该文件不在本 Task 写域，我未擅改；建议 A 在集成提交顺手补上（0382 混合检索消费前必须）。
2. 遗忘流程 ↔ 向量清理的宿主联动（调用 purgeMemory/dropSpace 的时机）建议在 0382 或 0373 复核接线；本 Task 已提供完整原语与检索期过滤。
3. e5 ONNX 产物钉住需要用户授权下载；目录字段已就位（`EMBEDDING_MODEL_CATALOG`），回填后 `resolveEmbeddingModelStatus` 自动升级 ready 判定。
4. 语义检索默认不启用：无本地资源时状态 unavailable，词法检索照常——与 PLAN-0021「无 embedding 时词法能力正常但如实标部分可用」一致。
5. **主线血统先存红（非本 Task）**：① `project/tasks/README.md` 有已提交的 TASK-0365 行但文件未入库——干净检出（含 CI）project-indexes 必红，需该行 Owner 会话补交文件或撤行；② runtime-node 的 import-export（validFrom 校验失败 3 例）与 glob/grep 合同（7 例）在主工作区基线同样红，建议登记修复。

## 后续

等待 Coordinator 审查：如需修复，本窗口在原 Task/Worktree 继续并追加候选提交；确认集成后按派工表等待（0382 由 A 侧实施，本窗口无下一项派工，等待批次结束标记）。
