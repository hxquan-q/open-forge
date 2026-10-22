# Ideas Backlog

## 高价值 / 复杂

- **hast 子树级元素缓存**（自建 renderer 替换 react-markdown 的 toJsxRuntime 输出）：
  按 (tagName + source span + 轻量签名) 缓存 ReactElement；命中则复用同一元素引用，
  React 对该子树直接 bail。守卫：文档含 link-reference definition 时整体旁路（后续
  ref-def 会追溯改变前文链接）；尾部最后 2 个 chunk/块豁免（recent/latest 亮度类会变）。
  prose 收益 ~95% reconcile；table 需要块内(行级)缓存。
- **表格行级缓存**：table 是单一 mdast 块，行级 position 稳定，只最后一行增长。
- **processor 缓存**：react-markdown v10 每次 render `unified().use(...)` 重建 processor；
  插件数组已由 useMemo 稳定，可按数组身份缓存 processor（省 setup 开销，量级待测）。

## 中价值

- `post()` 的 `visit(tree, transform)` url-transform 遍历：每次 parse 全树访问；可只在
  元素含 URL 属性时早退（已按属性表循环，但 visit 本身 O(n)）。小头。
- `splitStableMarkdownBlocks` 每次 displayText 变化全文扫描 O(N)：append-only 场景可
  增量扫描（记住上次扫描位置与状态）。量级可能太小，先测。

## 低价值 / 已排除

- 提高解析合并节流（200→400ms 更激进）：改的是文档合同里的 UX 行为，属变相 cheat，不做。
- reveal tick 合并：reveal commit 已很便宜，不是瓶颈。
- 虚拟化/懒渲染：基准场景是单一实例流式，与 DOM 虚拟化正交；改动面大。

## 本轮已探明、暂缓的方向（2026-10-22 会话）

- **Worker/异步解析**：彻底消除同步 parse 阻塞（table 场景 ~35ms/次仍是长帧），但 react-markdown
  管线（rich 插件、streaming chunks、组件树）深度假设同步渲染；需要消息级架构改造。
- **表格行级增量/元素子树缓存**：table 是单一 mdast 构造，源级拆分=两个 <table>（渲染改变）；
  hast 子树缓存需替换 react-markdown post()——而 Run#5 表明绕过组件结构有意外的性能反直觉，
  先搞清 React 19 profiling 归因再动。
- **冻结「裸方括号」块的语义**：coding 回复里 `arr[0]`/`[1]` 常见，这些段落后的内容全部
  回退整篇重解析。未来可做「检测到引用定义时一次性解冻重拆」语义（罕见 remount 换常态冻结），
  需要打破现有「前缀不可变」不变量并评估闪烁。
- **splitStableMarkdownBlocks 增量扫描 + 结果缓存**：每次 reveal tick 全文 O(N) 扫描与数组
  重建，~2% 总量，低优先级。
