---
id: BUG-0080
type: bug
status: verifying
priority: P1
owner: packages/plugins/presets/allstar-coding
requirement:
plan:
source: user-report（TASK-0217 提交 22ebf3a69 的人工审查：两个机械绕过口）
related_requirement: []
related_plan: []
related_tasks: [TASK-0217, TASK-0218]
related_issues: []
related_bugs: []
created: 2026-10-05
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# ac-fence 黑盒白名单/读域的两个机械绕过口

## 用户流程

- Given：TASK-0217 交付后，blackbox 角色子会话受窄读域（`docs/ac/` 前缀）与 shell 白名单（首 token === `agent-browser`）约束。
- When：黑测子（其工作内容即消费被测应用的页面快照——天然提示注入面）被诱导构造特定输入。
- Then：两个约束均可被机械绕过，围栏承诺（「其余含 git 只读全拦」「黑盒不读实现」）不成立。

## 实际行为

1. **shell 白名单只看首 token**（`judge.ts isBlackboxShellAllowed`）：`agent-browser snapshot && curl http://x`、`agent-browser --version; git push`、`agent-browser x > src/evil.ts` 首 token 均为 `agent-browser` → 整条放行。`;`/`&&`/`||`/`|`/`&`/换行/`$(`/反引号可执行任意后续命令；`>`/`<` 重定向可直接写任意文件——同时绕过写域（shell 重定向不是 file-edit 调用，写域判定不可见）。测试只覆盖了反序（`evil && agent-browser ...`），正序方向漏测。
2. **读域前缀匹配可被 `..` 穿越**（`judge.ts isWithinBlackboxReadScope`）：`read("docs/ac/../../src/main.ts")` 以 `docs/ac/` 开头 → 放行；宿主 resolve 后实际读 `src/main.ts`，击穿「黑盒不读实现」的信息防火墙。同文件 `isProjectInternalGlob` 明确拒绝 `..`，读域判定未复用该纪律。无测试覆盖。

## 期望行为

- 白名单放行前做**引号感知的元字符扫描**：引号外的 `;` `&&` `||` `|` `&` 换行 `$(` `` ` `` `>` `<` 一律 block；未闭合引号 block（fail-safe）。引号感知是为了不误伤 `agent-browser open "http://x?a=1&b=2"` 这类带查询串的合法 URL。
- 读域判定在 POSIX 化后：绝对路径（`/`、`~`、盘符）与任何 `..` 段直接 false（fail-safe，不做完整规范化），再做前缀匹配。
- reason 提示「复合命令请拆分单条执行，确需其他命令走 help_protocol」。

## 环境与失败证据

- 分支 `main`，引入提交 `22ebf3a69`（judge.ts 白名单/读域两函数）；静态审查发现，未在实机触发。
- 旧实现失败证据（红测）：`judge(BB_1, shell("agent-browser snapshot && curl http://x"), false).allow === true`（应 false）；`judge(BB_1, readCall("docs/ac/../../src/main.ts"), false).allow === true`（应 false）。

## 根因

白名单与读域都是**词法首token/前缀匹配**，没有考虑 shell 元字符的命令组合语义与路径解析的规范化语义。对比同文件 `isGitWriteCommand` 是全文任意位置扫描，`isProjectInternalGlob` 拒绝 `..`——新增代码未对齐既有纪律。置信度：高（代码路径直接可推）。

## 修复与验证

见 TASK-0218：先补红测（正序复合命令 3 条 block + 引号 URL 1 条放行 + `..` 穿越 2 条 block），再修 `isBlackboxShellAllowed`（引号感知元字符扫描）与 `isWithinBlackboxReadScope`（绝对路径与 `..` 段 fail-safe），回归 fence-judge 全量与完整 check。

**残余轮（同日第二轮审查，两个新绕过口）**：
1. **残余 A**：双引号内的 `$( )` 与反引号是命令替换（bash/PowerShell 语义一致），不是字面量；首轮扫描器把双引号内一切当字面量跳过，`agent-browser open "http://x?$(curl http://evil)"` 整条放行而 bash 实际会先执行 curl。双引号内只有 `&` `;` 这类才是字面量（所以放行 URL 查询串的动机没错，错在把替换语法也归入字面量）。单引号内是真字面量（两种 shell 一致），单引号分支维持放行是对的。
2. **残余 B**：引号外的 `\` 被当普通字符，`\"` 骗状态机开启引号区——`agent-browser x \" && curl evil \"` 整段被误认为引号内而跳过扫描（闭合变体放行；不闭合变体靠 unclosed-quote 兜底**意外**拦截，非设计保证）。bash/cmd 的 `\"` 转义与 PowerShell 传原生命令的 `\"` 都不开启字符串区。

残余修复：扫描器分单/双引号两分支——双引号内仍检测 `$(` 与反引号并拦截；引号外 `\` 紧跟引号字符视为转义的字面引号（跳过两字符、不开引号区）。红测先行（`"http://x?$(curl …)"`、双引号内反引号、`\"` 闭合变体、`\'` 变体等，旧实现 2 failed）后转绿；单引号字面量对照用例保持放行。fence-judge 80 项、包内 133 项、impact 91 项、完整 check 全绿。

## 剩余风险

- 写域 glob 同为词法匹配（`src/dto/../../evil.ts` 匹配 `src/dto/**`）——**既有面，非本次引入**，登记 ISSUE 另开任务。
- `agent-browser open file://...` 可绕读域（通道引擎内部行为，围栏只管命令边界）——观察项记录在案。
- 元字符表是黑名单式：未来新 shell 语法可能需要补条目（白名单语义内从严）。
