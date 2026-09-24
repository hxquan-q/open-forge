---
id: TASK-0011
type: task
status: done
priority: P1
owner: packages/theme-ui
requirement: REQ-0002
plan: PLAN-0002
source: 内存/GPU 占用优化专项调查（2026-09-23）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [packages/theme-ui/src/shared]
write_paths: [packages/theme-ui/src/shared, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Shiki 高亮 HTML 缓存字节预算

## 目标

`SyntaxHighlightedCode` 的 `HTML_CACHE` 仅按条数（300）FIFO 淘汰，key 含源码全文、value 为 3-6 倍体积 HTML，模型反复 dump 大文件时可滞留数百 MB。增加字符预算（约 5,000,000 code units ≈ 10MB），超预算按插入序淘汰。

## 方案边界（经对抗审查修正）

- 新建 theme-ui 内零依赖模块（**复刻** runtime-node ConversationWriteCache 写法，禁止跨包 import）；
- 单条超预算仍保留最新一条（防可见块无限重高亮）；
- **关键修正**：仍挂载的组件在条目被淘汰后会因渲染期 `cache.get()` 返回 undefined 而永久退回纯文本（effect 依赖不含 html、不会重新高亮）——把 `html` 加入高亮 effect 依赖，淘汰后走既有未命中路径自愈；
- 保留条数上限与构造器校验（正整数）。

## Given / When / Then

- Given 缓存内已有接近字节预算的高亮条目
  When 新的大代码块完成高亮写入
  Then 最旧条目被淘汰、总量有界，且被淘汰块所在的挂载组件经一次重高亮恢复 HTML 而非停留在纯文本。

## 测试

`packages/theme-ui/src/shared/syntax-highlight-cache.test.ts`（纯 node）：字节预算淘汰、插入序、重复 put 计费与刷新、单条超预算保留、空串失败路径计费、条数上限回归、构造器校验；desktop 组件测试回归。

## 并发结论

支持（theme-ui 内独立文件）；本任务由主会话串行执行。

## 实施摘要（2026-09-23）

- 新建 `packages/theme-ui/src/shared/syntax-highlight-cache.ts`：`HighlightHtmlCache`（条数 300 + 字符预算 5,000,000 双上限、插入序 FIFO、单条超预算保留最新一条、构造器正整数校验），组件内 4 个缓存触点机械替换，`cacheKeyFor` 原样保留。
- 对抗审查的 major 修正已落实：`html` 加入高亮 effect 依赖，仍挂载的块在条目被挤出后经既有未命中路径重新高亮自愈，不再停留纯文本。
- 验证：`syntax-highlight-cache.test.ts` 7 用例（含条数上限回归与构造器校验）+ 组件测试 3 用例（新增挂载中挤出→重高亮自愈用例，已临时移除 `html` 依赖证红、恢复后转绿）全过；`check:quick` 通过。
- 发布说明 v0.5.59「改进」已补条目。
