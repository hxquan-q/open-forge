---
id: REQ-0027
type: requirement
status: ready
priority: P2
owner: desktop
source: user-request（2026-10-22：余额不要在主对话框显示，移到模型明细/选型面板里；默认闭眼隐藏，点击才看到）
related_requirement: [REQ-0024]
related_plan: []
related_tasks: [TASK-0363]
related_issues: []
related_bugs: []
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 余额显示移入选型面板（默认隐藏）

## 用户问题

REQ-0024 的余额小字常驻输入栏，主对话框里一直占着一行、并且随时可见；用户希望它不在主对话框出现，只在「模型的明细」里按需查看。

## 用户结果

- 输入栏不再显示任何余额（金额、图标、占位都没有）。
- 打开模型选型面板，在**当前选中模型所属 provider 的分组标题行**看到一个**闭眼图标**；点击后显示余额金额与刷新按钮，再点睁眼图标收回。
- 每次打开面板都回到隐藏态，不记忆上次状态。
- 未支持余额的 provider、查询失败、未选模型：该行**零渲染**（无图标、无空壳、无降级文案），与 REQ-0024 的 D5 一致。

## 范围

- 仅**展示落点与可见性**变化；余额数据面（主进程 IPC、DeepSeek/Kimi 支持范围、60s 缓存、打开时尊重缓存重取、手动刷新绕过缓存）**全部不变**。
- `ModelSelectorView` 的 theme-ui 共享合同**纯加法**：新增可选 `balance` prop，不传时渲染与现状一致（插件零影响）。
- 新增文案 i18n：显示余额 / 隐藏余额；刷新沿用既有 key。

## 不做什么

- 不做「点击闭眼图标才发请求」的懒加载（取数时机与现状一致）。
- 不做可见性状态记忆或设置项。
- 不在面板其他位置（搜索框、顶部、推理子菜单）显示余额。
- 不同时显示其他 provider 的余额。
- 不新增余额 provider 支持，不改主进程/preload/IPC。

## Given / When / Then

- **Given** 当前选中 DeepSeek/Kimi 模型；**When** 打开选型面板；**Then** 该 provider 分组标题行出现闭眼图标，不显示金额。
- **Given** 余额区处于隐藏态；**When** 点击闭眼图标；**Then** 同处显示已本地化金额 + 刷新按钮 + 睁眼图标。
- **Given** 已揭示；**When** 关闭再打开面板；**Then** 回到隐藏态。
- **Given** provider 不支持余额/查询失败/无选中模型；**Then** 标题行零渲染。
- **Given** 输入框区域；**Then** 不存在任何余额节点。

## 必须保持

- `useProviderBalance` 的缓存与取数语义逐字不变。
- `ModelSelectorView` 不传 `balance` 时行为与改动前一致。
- 金额格式化规则不变（ISO 币种走 `Intl` 货币格式，非法币种退「金额 + 代码」）。

## 验收标准

见 `docs/devflow/balance-in-model-panel/01-spec.md` 的 AC-1 ~ AC-13。

## 风险与失效条件

- 面板内容区为 `forceMount`：若把「打开时重置揭示状态」当成可选项删掉，会退化为「记住上次状态」，违反 AC-3。
- 分组标题行空间有限：provider 名靠 `truncate` 让位，金额文本 `truncate`；超长金额可能被截断（可接受）。
- 若未来主题/插件自行传入 `balance`，需遵守「只在该 provider 标题行渲染」的合同语义。
