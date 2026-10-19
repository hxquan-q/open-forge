---
id: REQ-0018
type: requirement
status: ready
priority: P2
owner: apps/desktop
source: user-request
created: 2026-10-19
updated: 2026-10-19
related_plan: []
---
<!-- Copyright The Open Forge contributors. -->

# 桌面侧边栏入口命名与页面内容一致

## 用户问题

侧边栏的「能力」入口名称过宽：点开是技能、连接器（MCP）与插件的合集，标签本身无法让用户预测里面有什么，只能逐个点开确认。
「设计」入口同样宽：它与「智能客服」「自动化」等具体入口并列，但实际只承载原型设计稿与设计画廊。

## 用户结果

用户在侧边栏看到「技能与连接器」就知道那里能装技能、连 MCP；看到「原型设计」就知道那里是自己的原型设计稿，不需要先点进去试探。

## 范围

- 中英文侧边栏导航标签：「能力」→「技能与连接器」，「设计」→「原型设计」。
- 以该入口名称指代导航项的相邻文案同步改名：页面跳转目标名（`common:pageOpen.targets.skills`）、新手引导的入口标题（`project:sidebar.tour.skills.title`）、设置助手给出的路径提示（`settings:assistant.context.mcp`）。

## 不做什么

- 不改能力页（`/abilities`）与设计画廊页内的页面标题、搜索/添加按钮等以「能力」「设计」作为泛指名词的页面内文案；
- 不改路由、导航布局持久化 key、插件 id、图标与任何交互行为。

## Given / When / Then

- Given：用户打开 Desktop 侧边栏；
- When：查看置顶区与「全部」区的入口名称；
- Then：原「能力」显示为「技能与连接器」，原「设计」显示为「原型设计」；英文界面分别为「Skills & Connectors」「Prototype Design」；
- When：用户通过页面跳转确认、新手引导或设置助手被指到该入口；
- Then：指代同一入口的名称与侧边栏一致，不出现旧名。

## 必须保持

- 入口 key、路由、默认置顶顺序、用户自定义导航布局与点击行为不变；
- 中英文 catalog 同时更新，缺译回退不暴露原始 key；
- 不把「能力」「设计」在页面正文中的泛指用法一并机械替换。

## 验收标准

- 中英文侧边栏分别显示「技能与连接器」/「Skills & Connectors」与「原型设计」/「Prototype Design」；
- 上述相邻文案同步更新；
- `bun run check:quick` 与定向 i18n / 侧边栏测试通过。

## 风险与失效条件

- 若后续把「能力」重新定义为包含更多类型的产品概念，本命名需重新评估；
- 用户自定义导航布局按 key 持久化，改名不会重置其布局；若将来改成按 label 持久化，本需求失效并需迁移。
