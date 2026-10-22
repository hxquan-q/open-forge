# Autoresearch: Agent Desktop 流式 Markdown 渲染性能

## Objective

优化 Agent Desktop 聊天中流式回复的 markdown 渲染性能。这是 renderer 最热的路径：
模型流式输出期间，tail `MarkdownContent` 持续重解析并重渲染整篇长文档。

基准为既有仓库脚本 `apps/desktop/scripts/markdown-render.bench.mjs`：
真实 headless Chromium（chrome channel）、React production profiling 构建，
三个夹具（长正文 prose ~33k / 大表格 table ~22k / 长代码 code ~61k），
每次 50ms 追加、共 40 次流式更新。度量累计 React 渲染耗时、p95 单次 commit、解析次数。

**不得为了基准分数改变产品语义合同**（见 Constraints）。

## Metrics

- **Primary**: `total_react_ms`（三场景 reactRenderMs 中位数之和，lower is better）
- **Secondary**: `prose_ms` / `table_ms` / `code_ms`、`p95_max_ms`（最差场景 p95 commit，
  jank 指标）、`parse_runs_total`（解析次数）、`spread_pct`（重复运行噪声）

## How to Run

- 度量：`.auto/measure.sh`（内部 3 次取中位数，`VETTA_BENCH_REPS` 可调）
- 检查：`.auto/checks.sh`（theme-ui 全量 + desktop blocks 测试，走仓库 Node runner）
- 本会话在独立 worktree：`C:/Users/xquan/Desktop/open-forge-wt/autoresearch-md-stream`
  （分支 `autoresearch/markdown-stream-perf-20261022`，基于 main@537af264e）
- 环境：WSL bash + Windows node.exe；浏览器用 `VETTA_TEST_BROWSER=chrome` channel

## Files in Scope

- `packages/theme-ui/src/markdown/**` — 流式 markdown 渲染核心（本次主战场）
- `apps/desktop/src/renderer/domains/conversation/components/blocks/**` — 聊天侧集成
- `apps/desktop/docs/markdown-rich-content.md` — 若行为合同确需调整须同步（默认不动）

## Off Limits

- `apps/desktop/scripts/markdown-render.bench.{mjs,tsx}` 的负载语义（夹具内容、追加节奏、
  Profiler 口径）——改基准骗分 = 作弊
- 主工作区 `C:\Users\xquan\Desktop\open-forge` 的任何文件（其他 Agent 正在其中工作）
- 仓库其他包与主进程代码
- 不新增第三方依赖（可用 theme-ui 既有直接依赖）

## Constraints

- checks.sh 必须通过（theme-ui 全量 + desktop blocks）
- 用户可见语义不变：文档合同 `markdown-rich-content.md` 描述的行为（解析合并节奏
  12000/50000 字符→200/400ms、冻结块只按已闭合顶层围栏、streaming-chunk 亮度节奏、
  代码高亮预算、公式/SVG/HTML 行为）不得为提速而削弱
- 渲染结果 DOM 必须与现状一致（可对照既有快照/测试）
- 不新增 `any`；顶层 `import type`；遵循仓库 TS 规则
- 流式期间 components 引用稳定性合同（见 MarkdownContent.tsx 注释）必须维持
- 基准噪声 ~5-10%：小于噪声的改动不 keep；关注 confidence score

## 已知架构（读代码得出）

- `MarkdownContent`（memo）: `useStreamingDisplayText` 匀速放出 → `splitStableMarkdownBlocks`
  按已闭合顶层围栏冻结 → `useRenderSnapshot` 尾块 ≥12k/50k 时 200/400ms 节流 →
  tail `MarkdownDocument`(memo) 每次文本变化整篇重跑 react-markdown
- react-markdown 10.1.0：每次 render 重建 unified processor（unified().use × ~5 插件），
  parse+runSync+post(visit/toJsxRuntime) 全程同步
- prose/table 夹具没有围栏 → 永不冻结 → 每次节流快照对全文 ~33k/22k 字符重新
  parse + toJsxRuntime + React reconcile（~7000 元素）；code 夹具因围栏冻结 + 节流已很快

## 相位剖析（2026-10-22，临时 instrument react-markdown，已回滚）

| 阶段 | prose | table | code | 结论 |
|---|---|---|---|---|
| setup(processor) | 0.2 | 0.2 | 0 | 可忽略 |
| **parse(micromark)** | **332.9** | **388.3** | 80.8 | **瓶颈：重复 tokenize 行内语法** |
| run(gfm+rehype) | 38.4 | 31.6 | 0.5 | 随树缩小自动受益 |
| post(visit+toJsxRuntime) | 71.8 | 49.4 | 0.5 | 同上 |
| reactRenderMs 总计 | 481.3 | 519.7 | 102.9 | React reconcile 仅 ~38ms，几乎免费 |

→ 元素缓存（原主推方向）上限只有 ~40ms，优先级大降；主攻「冻结更多稳定块避免重复解析」
（prose 直接受益），表格是单一增长块需另外手段。

## What's Been Tried

### Run #2（keep, 5e99af75）：扩展稳定块冻结

- `splitStableMarkdownBlocks` 新增顶层完整块冻结（守卫：col-0、无裸方括号、无 `<` 行、
  无围栏/字面量内容、列表/引用/表格续行不可续、后继块已开始、候选必须是未提交开头）
- prose 625.8→44.1ms（-93%）；总 1252→526

### Run #3（keep）：尾块快照自适应节奏

- MarkdownDocument 用「组件函数开始→useLayoutEffect」测每次正文变化渲染的总成本，
  MarkdownContent 按占空比 target=max(base, cost×10) 调 useRenderSnapshot 间隔
  （快升慢降，上限 800ms）。⚠️不能用 JSX 创建计时（element 创建≠组件执行）
- 背靠背同负载：table 666→217（-67%），code 零回归；总 526→374（vs 基线 -70%）

### Run #6（keep）：验证复测

- HEAD 稳定复现 357.4（keep#4 357.1），18.5× 噪声置信

### Run #7（keep）：已提交子树整体 bail

- append-only 下 O(1) 复用块数组引用（replaced 强制新引用；块数不变⇒内容不变），
  CommittedDocuments memo 让 reveal tick 间已冻结子树完全跳过
- 总 357.4→314.8（-12%）；prose 39.1 / table 217 / code 58.7；置信 15.8×

### Run #8（keep）：增量扫描器 + 分段剪枝 + 前缀性漏洞修复

- 增量稳定块扫描器（边界恢复 + COW + 无新增提交时数组引用稳定），reveal tick 只扫
  新增行；rehypeStreamingChunks 剪枝 inCode 子树
- 修复：部分行上的冻结判定可被追加翻转（`1`→`1.`）破坏前缀性→ 判定只对完整行
- 两个恢复态 bug 被字符级等价 property test 抓出：围栏闭合行 text.length 依赖
  （推迟整行处理）、快照 index 在 lineEnd 赋值前拷贝（幽灵提交）
- 总 314.8→291.7（-7.3%）；⚠️ 曾误删 11 个既有测试（python 替换失控），从 HEAD
  恢复重建后 209+105 全绿——批量改测试必须前后对账 it( 数量

### Run #4（keep）：等价性安全网

- 流式冻结拆分 vs 整篇渲染 DOM 等价性模糊测试（10 份棘手文档），root 级元素序列比较

### Run #5（discard）：直接调用 react-markdown 纯函数精确测量——失败

- 两次独立对照均慢 22-34%（parse 数相同、相位正常、机制未明，疑似 React 19 profiling
  对组件边界的记账差异）；⚠️包级只导出 default（命名 Markdown 运行时 undefined）
- 已回退到子组件 + layoutEffect 时间差方案（测量混入同帧无关组件的成本，由 800ms
  上限与慢恢复兜底）

### 相位剖析结论（勿重走弯路）

- React reconcile 几乎免费（~38ms/流）；processor setup 可忽略（0.2ms）；
  parse（重复 tokenize）才是瓶颈——元素缓存方向上限只有 ~40ms，已降级
- 第一版自适应测量完全失效（JSX 计时=0），浪费一轮；布局效果时间差才是对的

### Baseline（2026-10-22，Chrome 155.0.8059.85，3 reps 中位数）

- total_react_ms ≈ 820（prose ~400 / table ~320 / code ~50）
- p95_max_ms ≈ 31（prose）
- parse_runs_total = 32（12+12+8）
- spread_pct ≈ 5-15%（注意噪声）

## 候选方向（详见 .auto/ideas.md）

1. 用自建 pipeline 替换 react-markdown：缓存 unified processor（插件数组稳定）
2. hast 子树级元素缓存（按 source position/内容签名 + ref-def 守卫 + 尾部豁免），
   把流式 reconcile 从 O(全文档) 降到 O(变化块)
3. 表格行级缓存（table 是单一顶层块，块级缓存救不了它）
