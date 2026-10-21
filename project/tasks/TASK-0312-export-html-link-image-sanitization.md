---
id: TASK-0312
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement:
plan:
source: RESEARCH-0032 / GHSA-7v5m-pr3q-6453（上游修复 6cb23f9b + b3ed5459）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 7d26d1df6
read_paths:
  - packages/coding-agent/src/export-html/assets/template.js
  - packages/coding-agent/test/export-html-runtime.test.ts
write_paths:
  - packages/coding-agent/src/export-html/assets/template.js
  - packages/coding-agent/test/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-18
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# HTML 导出 link/image 净化与属性引号转义（GHSA-7v5m XSS）

## 目标

会话 HTML 导出的 Markdown 渲染对 `link`/`image` 增加 scheme 白名单净化（剥离 C0/DEL 控制字符后按 `http/https/mailto/tel/ftp` 白名单放行，无 scheme 的相对 URL 放行，被拒 URL 退化为纯文本/alt 文本）；`escapeHtml` 从 DOM 实现改为纯字符串管道并转义引号。对齐上游 `6cb23f9b` + `b3ed5459`。

## 范围

### 并发评估

- 结论：支持（本会话串行执行）
- 执行方式：serial
- 可并行 Task：TASK-0310/0311/0313（不同文件域）
- 前置依赖：无
- 冲突文件/独占路径：`export-html/assets/template.js`、其测试
- Branch：main
- Worktree：不拆出
- 集成负责人：本会话
- 集成顺序：随 main 串行提交

### 做

- template.js：新增 `sanitizeMarkdownUrl()`（String 化 → trim → 剥 `[\x00-\x1f\x7f]` → scheme 匹配 `^[A-Za-z][A-Za-z0-9+.-]*:` → 非白名单返回 null）；`marked.use` 增加 `link`/`image` renderer 走净化，拒绝时输出行内文本/alt 文本；`escapeHtml` 改为 `& < > " '` 字符串替换管道。
- 回归测试：从资产源提取并求值 `sanitizeMarkdownUrl`/`escapeHtml` 做行为断言（`java\x01script:`、`JavaScript:`、`data:`、`vbscript:`、`https:`、`mailto:`、相对路径、含引号属性转义），并断言 link/image renderer 接线存在。

### 不做

- 不重构 template.js 为模块（资产内联结构保持；上游亦为内联实现）。
- 不改导出文档结构、主题与工具渲染器。

## Given / When / Then

- Given：会话记录中含恶意 Markdown（`[x](java\0script:alert(1))`、`![x](data:text/html,...)`、属性含引号的链接）；
- When：用户执行 HTML 导出并打开导出文件；
- Then：导出 HTML 不含可执行的 `javascript:`/`data:`/`vbscript:` URL（退化为文本），属性中的引号被转义，正常 http/https/mailto/tel/ftp 与相对链接渲染不变。

## 必须保持

- `code`/`text`/`codespan` 既有 renderer 行为（转义与高亮）不变。
- 树渲染、复制链接、主题与既有导出测试全部保持绿灯。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/coding-agent/test/export-html-runtime.test.ts`（新增 XSS 用例并入或新建同域测试文件）
- 用户流程：导出含链接/图片会话 → 打开导出文件（测试以资产行为断言替代浏览器开箱）
- 质量检查：`bun run test:impact -- <changed>`；收尾 `bun run check`

## 验收分层

- 工程验证：待执行
- 技术评审：自审
- 集成：与 frontmatter integration_status 一致
- 人工功能验收：不适用（纯净化逻辑，测试断言行为）
- 发布：未授权

## 功能验收包

- 入口与前置条件：任一会话导出 HTML
- 操作步骤或 AI 任务输入：会话含恶意与正常链接混合内容 → 导出
- 预期行为与最终产物：正常链接可点，恶意 scheme 退化为文本，无属性逃逸
- 不通过表现与已知限制：上游白名单外的自定义 scheme（如 `obsidian:`）会被拒绝——与上游一致，属预期收紧
- 验收反馈及回归案例：

## 交付记录

- 实际修改：`template.js`——`escapeHtml` 由 DOM 实现改为字符串管道（补 `"`/`'` 转义，对齐 `b3ed5459`）；新增 `sanitizeMarkdownUrl`（C0/DEL 剥离 + `http/https/mailto/tel/ftp` 白名单，对齐 `6cb23f9b`）；`marked.use` 增加 `link`/`image` renderer，被拒 URL 退化为行内文本/alt 文本。测试：新建 `export-html-xss.test.ts`——从资产源提取求值两个纯函数做行为断言（控制字符拆分 scheme、白名单放行、引号转义），并断言 renderer 接线；实现回退（如删掉净化或回退 DOM 转义）会红。
- 实际运行：定向 2 套件（export-html-xss 4 例 + export-html-runtime 4 例）全绿；`test:impact` 全量执行（归因汇总见 TASK-0313）。
- 未运行及原因：不在真实浏览器开箱逐例目验——净化逻辑为纯函数，提取求值已覆盖行为；导出运行时链路由既有 export-html-runtime 测试守卫。
- Worktree：未拆出（串行小改动）
- 剩余风险：白名单外的自定义 scheme（如 `obsidian:`）会被拒——与上游一致的预期收紧。
- 人工验收（2026-10-21）：用户在会话中确认本批次验收完成，据用户结论闭合；批次记录见 TASK-0342。
