---
id: TASK-0012
type: task
status: in_progress
priority: P1
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: 内存/GPU 占用优化专项调查（2026-09-23）
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/shared/store, apps/desktop/src/renderer/domains/file-preview]
write_paths: [apps/desktop/src/renderer/shared/store, apps/desktop/src/renderer/domains/file-preview, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---

# fileEditorDocumentsAtom 有界化（保脏草稿）

## 目标

编辑器文档缓存 `Map<path,{savedContent,draftContent}>` 双份全文、零淘汰、渲染进程生命周期内无限累积。改为有界（上限 32）+ 挂载登记/释放。

## 方案边界（经对抗审查修正）

- 脏草稿（draft!==saved）永不淘汰；挂载中（refcount>0）文档永不淘汰——允许因此超限，数据安全优先；
- `fileEditorDocumentsAtom` 改派生写 atom：apply → FIFO 淘汰「clean 且未挂载」最旧文档（**不做** touch/LRU 触碰机制——挂载中已受保护，触碰无收益且引入同遍历重插死循环风险）；
- `useTextFileEditor` 挂载 register / 卸载与切 path release；release 计数归零时：删 clean 文档**并从 counts Map 删除该键**（否则把无界累积缺陷复刻进新结构）；
- refcount 用 Map<string,number>（inlineFilePreviewContextAtom 为全局 atom，路由过渡期两个 FileTabContent 可对同 path 重复登记）；
- 迟到 load 回写会重建 clean 文档：良性，终将被上限回收。

## Given / When / Then

- Given 用户在长会话中浏览/编辑过大量文本文件
  When 关闭文件预览并继续使用
  Then 干净文档被释放/被上限淘汰，脏草稿逐字保留、beforeunload 保护不回退；重开被回收文件走一次正常磁盘加载。

## 测试

`file-editor-document-residency.test.ts`（纯 store）+ `useTextFileEditor.residency.test.tsx`（jsdom hook 接线，含 StrictMode 对称用例）。

## 并发结论

支持（独立文件）；本任务由主会话串行执行。
