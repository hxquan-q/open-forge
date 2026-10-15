---
id: BUG-0078
type: bug
status: verifying
priority: P1
owner: packages/coding-agent
requirement:
plan:
source: user-report（Desktop 会话中 browser_tab 连续两次 0.000s 返回 invalid browser_tab tool input）
related_requirement: []
related_plan: [PLAN-0006]
related_tasks: [TASK-0063]
related_issues: []
created: 2026-10-05
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# browser_tab 拒绝回传 snapshot 打印的 elementRef 编码串

## 用户流程

- Given：用户在 Desktop 会话里打开应用内 Browser WebView，模型可用 `browser_tab` 工具（TASK-0063 已交付）。
- When：模型先 `browser_tab {action:"snapshot"}` 取回交互元素列表，再对其中某个元素执行 `click` / `fill` / `inspect`，并把 snapshot 输出里的 `elementRef` 按原样（形如 `v1:5:e3`）作为 `elementRef` 参数传回。
- Then：工具在 0.000s 内直接失败，界面显示 `invalid browser_tab tool input`；宿主函数从未被调用，用户看到回合内报错。

## 实际行为

`readBrowserTabToolInput` 用 `Value.Check(BrowserTabToolInputSchema, value)` 校验，而 schema 里 `elementRef` 是 `BrowserElementRefSchema`（`Type.Object`，只接受 `{ id, pageRevision }`）。字符串形式的编码串 `v1:<pageRevision>:<id>` 被判非法 → `validateInput` 抛 `invalid browser_tab tool input`，`execute` 兜底分支返回同文本的 `invalid_input`。两条路径都不会到达宿主。

## 期望行为

snapshot 打印给模型的 `elementRef` 是一个不透明令牌，应当可以原样回传。无论回传编码串还是 `{ id, pageRevision }` 对象，都应在工具输入边界被规范化（解码）为对象后交给宿主；`e1`、`v1:-1:e1`、缺 `pageRevision` 的对象等仍判非法。

## 环境与失败证据

- 应用版本：0.1.3；分支 `main`，报告时提交 `d4366ebdb`；Windows 11，模型为 DeepSeek 兼容网关。
- 失败证据：用户报告两次 `browser_tab` 调用均在 `0.000s` 返回 `invalid browser_tab tool input`（0.000s 说明在工具输入校验阶段即被拒，未进入宿主调用）。
- 基线对照：合同模块本身可被 `bun -e` 直跑复现（见下），非环境问题。

## 最小复现

1. 取一次 snapshot 的模型可见文本：`formatBrowserTabToolResult({ok:true,action:"snapshot",pageRevision:5,nodes:[{elementRef:{id:"e3",pageRevision:5},role:"button",name:"提交"}]})` → 首行 `snapshot pageRevision=5 ...`，节点行 `- v1:5:e3 role=button name="提交"`。
2. 把该字符串原样回传：`readBrowserTabToolInput({ action:"click", elementRef:"v1:5:e3" })` → `undefined`（旧实现失败点）。
3. 对照：`readBrowserTabToolInput({ action:"click", elementRef:{ id:"e3", pageRevision:5 } })` → 通过。

在 `packages/coding-agent` 目录执行：

```bash
bun -e 'import { readBrowserTabToolInput } from "./src/features/browser-tab/browser-tab-tool-contract.ts"; console.log(readBrowserTabToolInput({ action: "click", elementRef: "v1:5:e3" }))'
```

## 影响

- 模型唯一能拿到的 ref 值就是 snapshot 打印的编码串（`encodeBrowserElementRef` 只在成功结果文本里输出）。因此所有需要 `elementRef` 的动作——`inspect`、`click`、`fill`、`press`、`scroll`、`wait`、局部 `screenshot`——在模型按最自然方式回传时都失败，`browser_tab` 的写类动作基本不可用。
- 严重度：命中即在回合内报错，用户需重试；不产生数据破坏，但使应用内浏览器自动化能力形同不可用。

## 根因证据

- `encodeBrowserElementRef` 的输出只在 `formatBrowserTabToolSuccess`（`browser-tab-tool-contract.ts`）以明文行 `- v1:<rev>:<id> role=… name=…` 打印给模型；模型学到的 ref 就是该编码串，工具描述也只说 “elementRef values that embed pageRevision”。
- `readBrowserTabToolInput` 只做 `Value.Check(BrowserTabToolInputSchema, value)`，其 `elementRef` 为 `BrowserElementRefSchema`（`Type.Object`），**未**经过同时接受字符串与对象的解码函数 `readBrowserElementRef`。
- `readBrowserElementRef` 当前仅被宿主侧 `webview-element-ref.ts#validateBrowserElementRef` 调用，位置在工具输入边界**之后**；边界在此之前已判非法。即编码/解码本已兼容，只是工具输入边界漏接。
- 置信度：高。错误文本、0.000s 时长与 schema 形状一一对应，且可用 `bun -e` 确定性复现。

## 回归测试

`packages/coding-agent/test/features/browser-tab/browser-tab-tool-contract.test.ts` 增加：

- 回传 snapshot 打印的编码串（`v1:3:e1`）时 `readBrowserTabToolInput` 返回规范化后的对象 ref；
- 对外 `BrowserTabToolInputSchema` 接受编码串、拒绝畸形串与缺 `pageRevision` 的对象；
- `createBrowserTabTool` 的 `validateInput` 接受编码串，`execute` 把解码后的对象 ref 传给宿主，不再返回 `invalid_input`；
- 穿过真实 session-extension 装配时，宿主函数收到的是解码后的对象 ref；
- desktop 宿主 `validateBrowserElementRef` 接受编码串（含过期 revision 判 `stale_reference`）；
- 仍拒绝畸形编码串 `e1`/`v1:-1:e1`/`v1:3:` 与缺 `pageRevision` 的对象。

## 修复与验证

- 修复：`readBrowserTabToolInput` 在校验前用 `readBrowserElementRef` 规范化字符串形式的 `elementRef`（新增 `normalizeBrowserElementRefInput`），对象形式保持不变、畸形串仍原样交给 Schema 判非法；发射给 Provider 的入参 Schema 在 `elementRef` 上改为「对象或编码串」联合（9 个动作分支改由按 elementRef 形态生成的工厂产出，避免两份动作定义），运行时校验仍用纯对象 Schema，因此交给宿主的 `BrowserTabToolInput` 保持对象形态；工具描述补一句 ref 可原样回传。
- 测试：`bun scripts/quality/run-vitest.mjs --run packages/coding-agent/test/features/browser-tab/browser-tab-tool-contract.test.ts packages/coding-agent/test/features/browser-tab/browser-tab-session-extension.test.ts`（14/14 通过）；`bun run test:impact -- ...`（coding-agent 31 文件 119 用例、desktop 3 用例）；desktop 包内 `bun run test -- src/main/browser-automation/webview-element-ref.test.ts src/main/browser-automation/in-app-browser-tab-host.test.ts`（12/12）。
- 检查：`bun run check:quick`、`bun run check`（含 root tsgo、lint、guards）通过。
- 未运行及原因：未做真实 Provider + Desktop 实机的 browser_tab 全流程验证（需授权并运行真实用户环境）；真实模型是否还会以其他畸形形状回传，需实机观察。
- 提交：见 TASK-0207 交付记录。
