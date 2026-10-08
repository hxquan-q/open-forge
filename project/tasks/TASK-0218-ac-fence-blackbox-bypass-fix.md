---
id: TASK-0218
type: task
status: verifying
priority: P1
owner: packages/plugins/presets/allstar-coding
source: user-report（TASK-0217 提交 22ebf3a69 人工审查：两个机械绕过口）
related_requirement: []
related_plan: []
related_tasks: [TASK-0217]
related_issues: [ISSUE-0031]
related_bugs: [BUG-0080]
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 22ebf3a69
read_paths: [packages/plugins/presets/allstar-coding/src/fence/judge.ts, packages/plugins/presets/allstar-coding/test/fence-judge.test.ts]
write_paths: [packages/plugins/presets/allstar-coding/src/fence/judge.ts, packages/plugins/presets/allstar-coding/test/fence-judge.test.ts, .github/release-notes/v0.1.3.md, project/tasks/TASK-0218-ac-fence-blackbox-bypass-fix.md, project/tasks/README.md, project/bugs/BUG-0080-ac-fence-blackbox-bypass.md, project/bugs/README.md, project/issues/ISSUE-0031-ac-fence-lexical-scope-boundaries.md, project/issues/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-05
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# 修复 BUG-0080：ac-fence 黑盒白名单复合命令绕过与读域 .. 穿越

## 目标

堵上 TASK-0217 引入的两个机械绕过口，使围栏的拦截承诺（「其余含 git 只读全拦」「黑盒不读实现」）在机械层面成立。

## 范围

### 并发评估

- 结论：不支持（单文件判定器 + 测试）
- 执行方式：serial
- Branch：main（工作区，用户已授权直接修改）
- 集成顺序：无需集成

### 做

- 先补红测（在旧实现上失败）：
  - 正序复合命令 block：`agent-browser snapshot && curl http://x`、`agent-browser --version; git push`、`agent-browser x > out.txt`
  - 引号内 URL 元字符放行：`agent-browser open "http://x?a=1&b=2"`
  - 读域 `..` 穿越 block：`docs/ac/../../src/main.ts`、`docs/ac/./../x`
- 修 `isBlackboxShellAllowed`：引号感知元字符扫描（引号外 `;` `&&` `||` `|` `&` 换行 `$(` 反引号 `>` `<` block；未闭合引号 block）。
- 修 `isWithinBlackboxReadScope`：POSIX 化后绝对路径（`/` `~` 盘符）与任何 `..` 段 fail-safe false，再前缀匹配。
- reason 提示复合命令拆分与 help_protocol。
- 发布说明补充修复条目。

### 不做

- 写域 glob 的 `..` 逃逸统一修（ISSUE-0031，既有面另议）。
- shell 重定向写的写域判定（ISSUE-0031）。
- agent-browser URL scheme 约束（宿主侧，ISSUE-0031 记录）。

## Given / When / Then

- Given blackbox 契约子会话，When shell 命令含引号外命令组合/替换/重定向元字符，Then block（reason 指引拆分单条或走 help_protocol）；引号内的 URL 元字符不受影响。
- Given blackbox 契约子会话，When read 的 path 含 `..` 段或绝对路径形态，Then block（fail-safe）。
- Given 其他角色（developer/reviewer 等），When 既有 shell/read 调用，Then 行为不变（回归保护用例）。

## 验收标准

- 红测在旧实现失败、新实现通过（先红后绿）。
- fence-judge.test.ts 全量（含 TASK-0217 的 12 项）零回归。
- `bun run check:quick` → `bun run test:impact` → 完整 `bun run check` 全绿。
- 发布说明已更新；BUG-0080 台账回填验证记录。

## 交付记录（2026-10-05）

- 红测先行（在旧实现上失败，3 failed / 75 passed）：
  - 复合命令/替换/重定向正序绕过：`agent-browser snapshot && curl http://x`、`agent-browser --version; git push`、`agent-browser x > out.txt` 等 11 条（旧实现全放行）；
  - 未闭合引号：`agent-browser open "http://x?a=1`（旧实现放行）；
  - 读域 `..` 穿越：`docs/ac/../../src/main.ts`、`docs/ac/./../x`、反斜杠混合、绝对路径形态共 7 条（旧实现放行）。
- 实现修复（`src/fence/judge.ts`，仅 blackbox 分支两函数 + reason 文案）：
  - `isWithinBlackboxReadScope`：POSIX 化后先拒绝对路径（`/` `~` 盘符）与任何 `..` 段（fail-safe，不做完整规范化——宁可误拦 `docs/ac/a/../b.md` 罕见形态），再前缀匹配；
  - `isBlackboxShellAllowed`：首 token 白名单之外加 `blackboxShellMetachar` 引号感知扫描——引号外 `;` `|` `&` `<` `>` `` ` ``、换行、`$(` 一律拦；未闭合引号按拦（fail-safe）；引号内 URL 查询串元字符不计（`agent-browser open "http://x?a=1&b=2"` 放行）；
  - reason 分流：白名单命中但有元字符 → 提示「复合命令拆分单条执行，重定向写不在权限内」；非白名单 → 原通道指引；均带 help_protocol。
- 验证命令与结果：
  - 红测：`run-vitest.mjs --run test/fence-judge.test.ts` 3 failed（旧实现）→ 修复后 78/78 通过；
  - 包内全量：6 文件 131/131 通过（TASK-0217 的 12 项黑盒用例零回归）；
  - `bun run check:quick -- <judge.ts/test>`：通过；`bun run test:impact -- judge.ts`：2 文件 89/89 通过；
  - 完整 `bun run check`：exit 0（lint/types/guards 全绿）。
- 未做及原因：写域 glob `..` 逃逸统一修、shell 重定向写域判定、agent-browser URL scheme 约束——均登记 ISSUE-0031（既有面/宿主侧，另行裁决）。
- 剩余风险：元字符表为黑名单式（白名单语义内从严），未来新 shell 语法需补条目；`docs/ac/a/../b.md` 这类合法但含 `..` 的路径会被误拦（罕见形态，fail-safe 取向，用户可走 help_protocol）。
- 归属标注：Open-Forge-only。
