---
id: TASK-0012
type: task
status: done
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
integration_status: integrated
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

## 实施摘要（2026-09-23）

- `file-editor-document-residency.ts`：`MAX_FILE_EDITOR_DOCUMENTS=32`、`isEditorDocumentClean`、`evictCleanEditorDocuments`（FIFO，仅淘汰「干净且未挂载」，按对抗审查结论**未实现** touch/LRU 触碰机制，消除同遍历重插死循环风险）。
- `file-atoms.ts`：`fileEditorDocumentsAtom` 改派生写 atom（函数式 updater 签名不变），新增 `fileEditorOpenDocumentCountsAtom` 与 register/release 写 atom；release 计数归零时**删除 counts 键**并顺手删干净文档（审查 major#2 修复锚点已由测试钉住）。
- `useTextFileEditor.ts`：挂载 register / 卸载与切 path release effect（声明在 load effect 之前）。
- 验证：store 测试 7 用例 + hook 测试 4 用例（含 StrictMode 对称、切 path、脏草稿保留）全过；`tsc -p apps/desktop` 通过；`check:quick` 通过（Biome 自动格式化 1 处）。
- 发布说明 v0.5.59「改进」已补条目。
