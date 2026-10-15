---
id: ISSUE-0026
type: issue
status: verifying
priority: P3
owner: apps/desktop + packages/runtime-*
related_requirement: []
related_plan: [PLAN-0013]
source: 开发团队实测会话（91c32cf7）审计员/开发员会话日志
created: 2026-09-26
updated: 2026-09-27
related_tasks: [TASK-0123]
related_issues: [ISSUE-0025]
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 团队成员会话内无 in-app WebView，渲染验证被迫绕行

## 背景

团队任务中开发员与审计员都需要验证生成的 HTML 页面。成员会话调用 `browser_tab` 返回
`no_browser_session: the in-app WebView is not available.`——成员会话没有绑定的应用内 WebView。

成员各自找到了降级路径（自建 `python -m http.server` + 调用 agent-browser/headless Chrome），
任务未阻塞、验证也真实完成；但每次绕行都要额外消耗十余次工具调用去探接口、起服务、收端口，
且依赖宿主机恰好装有可用的外部浏览器工具——换个环境可能无路可退。

## 已知事实

- 审计员会话日志确认 `browser_tab` 调用结果为上述错误，随后改用 agent-browser headless 完成
  渲染取数与逐行比对；开发员同样自建本地 http server 做渲染验证，结束时清理端口。
- 会话内可用工具清单含 `browser_tab`（出现在成员的 toolDefinitions 中），但成员会话上下文里
  它没有可用 WebView 后端——**工具广告了不可用能力**，模型要撞上错误才知道降级。
- 主会话（普通 agent 会话）的浏览器能力走的是哪个后端、为何团队成员会话拿不到同一能力，
  尚未核实。
- **DSH 子系统的标准解法（fail loud, no silent degradation）**：`ctx.subagents` 要求
  提供方用静态 `SubagentCapabilities` 描述符声明启动期能力（`agentOptions`/`outputSchema`/
  `depthLimit`/`toolFilter`/`persona`），服务在 `start()` **之前**校验——请求需要的能力
  提供方不具备时以类型化错误 `UNSUPPORTED_CAPABILITY` 拒绝，绝不接受后静默忽略。
  更进一步的 `toolFilter` 语义是「one visibility」：被过滤的工具**从子 agent 的 prompt
  消失且执行期拒绝**，两层一致。我们的问题是同一类缺陷的实例（广告了不可用的
  `browser_tab`），解法应升级为类：工具装配时按宿主实际可用能力显式收窄，而不是
  等运行时撞错。

## 未决问题

1. 成员会话拿不到 WebView 是设计决定（成员不应操纵用户可见浏览器）还是实现缺口？
2. 若为设计决定，`browser_tab` 是否应从成员会话工具清单中剔除或改为声明式降级提示，
   避免模型先调错再绕行？
3. 成员需要的究竟是「可见 WebView」还是「headless 渲染/截图/取数」？后者或许该有独立工具。
4. 降级路径（起 http server + 外部浏览器）的清理责任与端口冲突风险是否要由宿主接管？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A 成员会话工具清单剔除/标注 browser_tab 不可用在团队上下文 | 立即消除撞错绕行 | 小 | 成员失去任何浏览器入口 |
| B 提供 headless 渲染工具（截图/取 DOM/取 console）给成员会话 | 正中需求；能力边界清晰 | 新工具实现与安全面设计 | 渲染任意本地文件的安全策略需定义 |
| C 让团队会话共享/派生 in-app WebView | 复用现有能力 | 生命周期与多成员并发复杂 | 用户可见浏览器被成员占用干扰主会话 |

## 推荐

先 A（声明不可用，附降级建议文案），B 作为正式解法评估；C 不建议——成员可见性需求是
「验证渲染」而非「操作界面」。

## 决策触发条件

- 若团队任务普遍需要渲染验证（生成 HTML/报告类任务已成为常态），优先 B。
- 若确认 WebView 不提供给成员是安全决定，A 应立即做。

## 后续 Task

- （待立）核实成员会话 browser_tab 不可用的具体判定路径与意图来源。
