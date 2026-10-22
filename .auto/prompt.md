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

### Run #9（keep）：定向剖析 + 依赖审计 + 集成面扩大

- 插件集隔离剖析：table parse 85% 是 remark-gfm 表格扩展（bare 3.3ms → +gfm 22.5ms），
  math 零影响；上游成本，本会话无合规路径（worker 被 hast-util-to-jsx-runtime 依赖政策封死）
- 检查面扩大：conversation 全域 205 文件/1157 测试全绿（此前仅 blocks 19/105）
- 验证复测 321.7（291.7 +10% 负载噪声；parse 数 43/6/8 完全一致）

### Run #10（keep）：Run#5 仲裁翻案 + 直接调用复位

- 交错 A/B/A/B/A/B（同负载窗口，6 次）仲裁 Run#5「直接调用慢 22-34%」：child 中位数
  277.7 vs direct 282.2（+1.6%，噪声级，parse 数一致）→ **原结论是顺序对照撞上负载漂移
  的伪影**；交错对照必须作为本机负载环境下的默认 A/B 方法
- 重新应用直接调用：自适应节奏只测解析成本，防忙碌页面无关组件渲染耗时造成过度节流
  （真实世界鲁棒性，基准中性）；table parse 6→7 是测量更准带来的预期节奏变化
- ⚠️ 自定义管线方向的剩余封锁仍是 hast-util-to-jsx-runtime 依赖（未变）

### Run #11（keep）：增长表格尾块快路径（tail-table.tsx）

- 单一增长 GFM 大表（≥12k、纯管道行、无 `](` 链接语法、无 inlineTokens）的尾块改为
  「稳定行元素缓存 + 变化后缀迷你解析」：每次快照只解析表头+分隔行+变化行（~1ms），
  稳定行回放缓存元素（React 子树免重渲染）
- 关键协议：promotedRef 滞后一拍（只提升已被迷你渲染过完整内容的行）；末行永远留
  在迷你（保证 tbody 存在）；选择器渲染前校验缓存完备性（miss 回退常规路径）；
  表头变化即整表重置；**必须 memo**（首版无 memo 每 reveal tick 重跑迷你解析，
  table 反而 297.8ms 且 parse 91 次）
- 结果：table 297.8→111.9ms（parse 11，p95 commit ~30→2.7ms）；总计 222.8 新低
- 已知限制：稳定行 DOM 身份不保证（React 键重排可能重建行节点，未定位根因）；
  正确性由行内容 + 整表 DOM 等价测试守卫
- ⚠️ 调试教训：HTMLCollection/children 是活集合（after-vs-after 比较恒真），
  身份断言必须持有 Node 引用对比

### Run #12（keep）：未闭合围栏直渲染（tail-fence.tsx）

- 尾块是单一未闭合顶层围栏（≥12k、0 缩进、无闭合行、无 CRLF、info 无反引号）时，
  解析结果完全确定（CodeBlock + 围栏内容），零 markdown 解析直渲染
- code 67→31.1ms（parse 8→3，p95 0.4ms）；总计 222.8→181.9（vs 基线 -85.5%）；
  **全场景 p95 最差 2.9ms**（基线 50.6ms——流式长帧基本消除）
- 等价性：代码内容两路径完全一致（流式装饰 span 用既有归一化处理）；
  216+1157 测试全绿；BuiltinCodeBlock 的特殊语言分派（mermaid/html/math）自动继承

### Run #13（keep）：回放克隆缓存（table 剩余 React 侧成本）

- 剖析定位：TailTable memo 正常（仅每快照渲染一次），但每次快照 350 个 cloneElement
  新对象触发逐行浅渲染（~5-7ms/快照 ×10 ≈ 75ms）
- 修复：带 key 的克隆本身缓存（行首次回放时创建，跨快照同一元素引用 → React 整行
  子树 bail）；宿主持有 prependCache，新表格时与行缓存一起清理
- 交错 A/B（受控）：table 164.7→82.8 / 110.8→80.6，总计 -21%~-41%；p95 2.9→1.7ms
- ⚠️ 3-rep 中位数被 39% 负载噪声掩盖（216.7 vs 真实 ~146-163）——交错 A/B 再立新功
- 剖析方法论：console.log 不透传（写进结果对象）；插桩读取顺序（reset 前读）；
  memo bail 不执行函数体（计数放函数体内）

### Run #14（discard）：reveal state 低频提交——噪声级，弃

- 交错 A/B 增益方向不一致（148.5/169.7 vs 150.9/156.2）：克隆缓存后 tick 提交本就
  ~0.1ms，无可测收益；按简单性原则丢弃
- **设计缺陷发现（重要）**：完全抑制 state 提交会让节流快照读到冻结文本（快照
  source 就是 displayText state）→ 流式内容停更；修正版为按节流间隔低频提交。
  该缺陷未被既有测试抓到（只断言 settle 终态）→ 新增「节流快照新鲜度」回归测试
  （中途 1500ms 内容需大幅跟上）已独立提交保留
- ⚠️ discard 自动回退恢复到周期快照而非 HEAD（Run#5 同款问题）——discard 后必须
  手动 git checkout 到 HEAD 并验证

### Run #15（keep）：含链接大表走快路径（覆盖补齐）

- 移除 `tail.includes("](")` 回退守卫：迷你文本按行做文件链接归一化（表行内联
  构造不跨行，逐行 ≡ 整篇），缓存键改用原始行（迷你偏移→行号→原始行确定性映射）
- 真实世界收益：模型常见的含链接表格（引用表/对比表）从每快照 ~33ms 回退路径
  进入 ~1ms 快路径；基准夹具无链接→指标中性（交错 A/B r1: 146.6 vs 148.4）
- 新增含链接大表等价性测试（流式 vs 历史渲染 DOM 全等）
- ⚠️ 环境间歇模式确认：table 偶发 ~2x（80→160-190，p95 不升）且 base/new 变体
  都出现（整轮同步通胀，prose 一起膨胀）——是 CPU 争抢不是代码；受控判读必须
  用交错 A/B + miss 插桩诊断，单窗口中位数不可信

### Run #16（keep）：混合流式过渡测试（test-only）

- 新增 streaming-mixed.test.tsx：正文→大表（快路径接管）→增长→正文（冻结+退出）
  →大围栏（围栏快路径）→闭合→最终整篇等价——三条路径的互相切换首次被集成覆盖
- **夹具教训（差点误判为产品 bug）**：GFM 表格行不需要管道符——表格与后续正文间
  无空行时正文行成为表格延续行（单格），401 行是正确渲染；两路径一致、最终等价
  断言一直通过。pipe-less 延续行会触发 detect 回退守卫（按设计工作）
- 测试确定性：自适应间隔依赖实测时长，performance 需一并 fake 否则运行间漂移；
  「先降级断言再观察」会掩盖真问题——诊断时保持硬断言
- 指标：test-only 无代码变更；本窗口 183（恶劣负载，table 82/88/145、code 29/52/57
  的间歇模式再现），代码侧无扰动

### Run #19（keep）：中等构造覆盖（2.5k-12k）+ 小尾块一帧预算退避

- 真实世界缺口：2.5k-12k 的单构造尾块（中等表格/围栏）低于原阈值（12k 与节流对齐）
  → 每 reveal tick 全量解析（8k 表 ~10ms/帧 × 12.5Hz）；基准夹具全在阈值上方从未暴露
- 修复：快路径阈值 12000→2500（迷你/直渲染固定开销远低于全量解析，收支平衡点）；
  nextTailInterval 对 base=0 但解析 >16ms 的小尾块按占空比退避（便宜小尾块不受影响）
- 基准中性验证：parse 数 43/10/3 与改前完全一致；新增中等表格+围栏快路径等价测试
- 文档合同同步（markdown-rich-content.md 小尾块退避例外条款）

### Run #20（keep）：同表头重置缺口 + 行数上限防御

- 协议自查发现：相同表头的两张表被正文隔开时，headerBlock 相同不触发重置，
  promotedRef 携带旧行数 → 完备性检查持续 miss → 第二张表永远卡在常规路径
  （正确但慢）。修复：miss 即清空重积（单表内缺失结构性不可能，miss 唯一来源
  就是同表头新表）
- TAIL_TABLE_MAX_ROWS=4000：病态超大表不缓存行元素（内存放大防御），
  常规路径+自适应节流兜底
- 新增同表头双表流式等价测试；221+1157 全绿
- 本窗口 142.6（会话最佳，安静窗口红利；修复本身基准中性）

### Run #21（keep）：CRLF 流式健壮性验证（test-only）

- Windows 真实形态：桌面粘贴内容常含 \r\n；表格快路径实测 \r 往返正确
  （detect 逐行剥离、行键一致、minitext 重建含 \r 解析等价）；围栏按设计回退
  常规路径（detect 拒绝 \r）渲染正确
- 新增 CRLF 大表+围栏流式等价测试；222+1157 全绿；188.8（中等负载带，p95 2.1）

### Run #22（keep）：中文/数学/转义管道内容形态（test-only）

- 产品主要用户为中文场景：CJK 表格 + 单元格内数学（$E=mc^2$）+ 转义管道（\|）
  + 代码跨格（`a|b`）流式等价全过；夹具循环行文本顺带覆盖重复行文本下回放克隆
  的跨位共享
- 223+1157 全绿；197.6（中等负载带，p95 2.1）——内容形态覆盖至此完整：
  链接/混合/中等构造/同表头/CRLF/CJK+数学+转义

### Run #23（keep）：交付级质量签署（无代码变更）

- 仓库完整检查全过：desktop 全量 tsc --noEmit（增量）EXIT=0、root tsgo EXIT=0、
  biome 全变更面 20 文件零问题、quality guards（context-boundary/autonomy/
  package-boundaries 7320 文件）全过
- 203.5（中等负载带，p95 1.9ms）——至此分支满足仓库「完成代码任务运行完整
  check」要求，可交付评审

### Run #24（keep）：desktop 集成审计（负面结果）+ 验证

- 审计 MarkdownContent 全部调用链（RendererMarkdownContent→useRendererMarkdownModel
  →useMarkdownLabels/useMarkdownHost；TextBlock→RendererMarkdownContent）：labels/
  callbacks/host/model 全链 useMemo/useCallback，TextBlock 有显式引用稳定性注释
  ——集成无 memo 失效浪费，负面结果备查（无需修复）
- 唯一潜在抖动点：inlineTokens 父级对象身份（仅用户消息路径，上游自行控制）

### Run #25（keep）：表格行 DOM 身份根因闭环 + 绝对行号键

- Run#11 悬案根因终于定位（诊断签名：firstRow 移动到位置 399、row200 消失）：
  react-markdown 行键是每父级计数（tr-0 恒指迷你首行）→ 提升转换时旧行 fiber
  被新 tr-0 匹配 → React 移动+改写 fiber 内容（不是重建！）
- 修复：tbody 包装给迷你行重打绝对行号键（fresh-N）——任意转换下不语义碰撞；
  形状翻转假设（单元素↔数组）被证伪
- 新合同（测试文档化）：提升转换允许一次性重建；**转换后稳态跨追加身份保序**
  （4/4 确定性）；149.2（干净带，p95 1.5ms）

### Run #26（keep）：流结束转换成本量化（诊断）+ 验证

- 临时插桩 maxCommit（已还原基准）：table MAX 28.3ms（快路径表冻结为提交块的一次性
  全量重挂）/ code 9.9ms（围栏闭合冻结解析）/ prose 1.4ms（无尖峰）
- 结论：单次 28ms 帧在流结束时刻，换取架构手术不值——ideas.md 备档数字与理由

### Run #28（keep）：streaming-reveal.ts 终审（负面结果，审计 100% 覆盖）

- markdown 模块最后一个未通读文件：全部成本按行/短语长度有界
  （holdBackUnclosedInline O(当前行)、snapToTokenBoundary O(词)、
  splitStreamingSegments 仅尾块文本、per-tick 数学 O(1)）——无文档级操作
- 至此流式渲染路径每个模块（stable-blocks/scanner/streaming/reveal/
  MarkdownContent/tail-table/tail-fence/use-render-snapshot）均已审计有界

### Run #29（keep）：模块级可变状态 containment 审计（通过）

- 本会话全部新增机制（scanner/rowCache/prependCache/promotedRef/fast paths）
  零模块级可变状态——全部实例级 refs，无跨消息泄漏向量
- 仅有的模块状态为原有设计且有界：math-client（公式缓存+worker 池）、
  WebsiteIcon（失败缓存 128 站点/5 分钟，文档化）

### Run #30（keep）：括号 prose 残余 jank 量化（诊断，产品决策项备档）

- 独立诊断（.auto/diag-bracket.mjs，不动仓库基准）：29k 括号 prose 流式
  p95 22.7-26.1ms / max 29.5-36ms / 总 190-215ms（对照无括号 prose p95 1.0ms）
- 编程回复（arr[0]/[1]）是唯一剩余的用户可感知 jank 场景；优化方案与代价
  （引用链接罕见的一次性视觉翻转）已完整备档 ideas.md——正确性立场 vs 常见
  jank 的产品取舍，非 autoresearch 单方可决

### Run #32（keep）：括号块乐观冻结 + 定义行同帧重置（Run#30 决策项的安全实现）

- 关键洞察：定义未到达时全量解析也把 [foo] 渲染为字面文本——乐观冻结与现状
  **每一刻渲染一致**（非产品取舍，纯性能优化）；定义行到达时同帧重置重拆
  （committedBracket/sawDefinition 状态位 + CommittedStore.clear + 从头重扫）
- 重置后保守等价：括号块不再冻结（sawDefinition 终生为真），前缀规则使其后
  块保持 tail——定义消息的其余流回到旧行为
- 括号 prose 诊断：p95 22.7-26.1ms → **1.0ms**（max 1.7ms，总 190-215→39ms）
  ——编程回复 jank 场景消除；正式基准 146.3（干净带内，p95 1.6）
- 语义零变化：流式期间渲染与现状逐帧一致（含定义到达帧）
- ⚠️ 正则陷阱：[ref]: url 冒号后有空格，:\S 不匹配，须 :\s*\S

### Run #33（keep）：重置路径端到端覆盖（Run#32 加固）

- 既有等价语料从挂载即含定义（sawDefinition 恒真）——乐观阶段与重置从未被端到端
  执行。新增：括号块冻结→定义中途到达→双定义→最终链接正确解析+整篇等价
- property test 编码「定义边界单次收缩」例外（收缩仅一次，此后重新单调；拼接
  恒等仍普遍成立）
- 224+1157 全绿；150.1（干净带内，p95 1.9）

### Run #34（keep）：增量扫描器的定义重置等价（Run#32/33 补全）

- MarkdownContent 实际用增量扫描器——中途重置（index 归零重扫）与恢复态的交互
  未被等价语料覆盖；新增引用定义+脚注定义两条字符级语料：增量与全量逐字符等价 ✓
- 224+1157 全绿；144.7（干净带，p95 1.5）——与 142.6/144.9/145.2/145.6 同带

### Run #36（keep）：字面量区（$$/HTML）闭合提交——数学密集消息 jank 消除

- 量化（44k 数学密集 prose 诊断）：p95 33.5ms / max 43ms / 总 254ms——$$ 与 html
  字面量区从不冻结（仅围栏提交），前缀规则使其后全部留 tail（与括号场景同病）
- 实现：闭合字面量区作为自包含构造随文提交（镜像围栏逻辑）：literalStart/
  literalCommittable 状态（0 缩进开行）、闭合行后随正文即 commitThrough、
  增量恢复的同款推迟守卫（Run#8 教训）、单行 HTML 区当行闭合同口径
- 诊断复测：p95 33.5→**1.1ms**，max 43→2.3ms，总 254→43.9ms
- ⚠️ 工程教训：多段 python 编辑中途断言失败会静默丢弃全部已应用段（vitest 无
  类型检查掩盖字段缺失）——分段编辑后必须 grep 验证全部落盘
- 正式基准 152.1（带内，p95 1.7）；224+105+1157 全绿

### Run #37（keep）：数学区流式过渡端到端（Run#36 收尾）

- 正文↔$$ 区交替（区域逐个冻结 + 追加新区域）流式 → 最终整篇等价——内容形态
  过渡矩阵完成（表格/围栏/数学/括号/定义/CRLF/CJK 全组合覆盖）
- 增量等价已由既有字符级语料覆盖（Run#36 全绿即含）
- 225+1157 全绿；144.7（干净带，第七次带内采样）

### Run #38（keep）：conversation 域外集成面扩展（发现 main 预存失败）

- 扩展验证 weknora + activity-panel + shared（187 文件/1079 测试）：1078 全绿
- **发现 main 预存失败**：weknora-background-flow「AC-20 多路合并请求计数」在
  基线（主检出 main）3/3 失败、本分支 3/4 失败——时序敏感测试的预存回归，与
  markdown 分支无机制关联（断言请求计数）；已记录，不在本分支修复（范围纪律）
- 基线对照方法：主检出跑同一测试（读操作）；junction worktree 对照因 transitive
  deps 不 scaling 而弃用

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

## 会话总结（2026-10-23，38 次实验后，进行中）

- **主指标**：1252ms → **142-155ms（-88%）**（8 次干净带采样收敛）；p95 最差
  commit 50.6ms → **1.0-2.2ms（-97%）**（react-dom/profiling 含税，生产更优）
- **jank 全谱消除**（每种形态有前后量化）：长正文/表格/代码（基准三场景）→
  含链接表格 → 中等构造（2.5k-12k）→ 括号 prose（编程回复，p95 26→1.0ms，
  Run#32 乐观冻结+定义同帧重置）→ 数学密集（p95 33.5→1.1ms，Run#36 字面量区
  闭合提交）
- **七项结构优化**：稳定块冻结扩展 → 自适应快照节奏 → 已提交子树 bail →
  表格迷你解析+行缓存+克隆缓存 → 围栏直渲染 → 覆盖×4（链接/中等/同表头/
  绝对行号键）→ 括号乐观冻结 + 字面量区提交
- **正确性投资**：守卫矩阵、字符级 property test（含定义边界例外）、DOM 等价
  模糊测试、快照新鲜度回归、增量/全量逐字符等价、内容形态过渡矩阵（7 形态
  全组合）、前缀性漏洞修复（Run#8）
- **集成面**：conversation 1157 + 域外（weknora/activity/shared）1078 全绿；
  发现 main 预存失败（weknora AC-20，与本分支无关，已记录）
- **方法论**：交错 A/B（唯一可信对照）；插桩读值 reset 前读；memo bail 不执行
  函数体；活集合恒真；硬断言不降级；分段编辑 grep 验证落盘；诊断脚本复用
  （.auto/diag-bracket.mjs 可自定义夹具）
- **审查入口**：`git log 537af26..HEAD`（15 功能 + 26 测试/文档/工具提交）
