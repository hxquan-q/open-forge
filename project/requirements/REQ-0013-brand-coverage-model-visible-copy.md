---
id: REQ-0013
type: requirement
status: ready
priority: P1
owner: release/desktop
source: user-request（2026-10-14：默认问 agent 仍是 Vetta / Vetta Desktop，要求其余同类残留一并更换）
related_requirement: [REQ-0003, REQ-0011]
related_plan: []
related_tasks: [TASK-0249, TASK-0250, TASK-0251, TASK-0252]
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 品牌层贯通模型可见与终端用户可见文案

## 用户问题

品牌档案（REQ-0011：默认 `distribution` = 英文 Allstr ai / 中文界面小爱ai，显式 `self` = Open Forge）目前只覆盖 Desktop i18n 渲染与打包身份。默认问 agent 时它仍自称 Vetta，并把它操作的对象叫 Vetta Desktop；内置工具描述、运行时错误、随 Desktop 发布的系统插件文案同样带遗留品牌名。结果是同一台机器上界面写「小爱ai」、agent 自称「Vetta」，两处口径互相矛盾。

## 用户结果

默认档下 agent 自称与界面品牌一致（中文界面小爱ai、英文界面 Allstr ai），显式 `VETTA_BRAND_PROFILE=self` 时为 Open Forge；模型可见文本、终端用户可见报错、系统插件文案与导出产物不再出现遗留品牌名；冻结的内部标识与兼容路径不变。

## 范围

1. `packages/coding-agent` 模型可见文本：身份行、CLI 指引、内置工具描述；产品身份词由宿主按当前档位注入，包内不再硬编码品牌。
2. `packages/runtime-node` 终端用户可见报错与工具描述（Desktop 可执行文件定位失败、OCR/PDF/图片文本提取）。
3. 随 Desktop 发布的系统插件文案与产物（`vetta-ui-design` 画布备注与导出水印、`vetta-actions` 能力用法说明、`content-creation`、`plugin-workbench`）。
4. Desktop i18n 里「Vetta Desktop」被 post-processor 拆成「小爱ai Desktop」的组合问题，以及防止回退的机械门禁。

## 不做什么

- 不改冻结兼容标识：`@vetta/*`、`VETTA_*`、`vetta:`、`vetta.remote.v1`、`X-Vetta-*`、`.vettapkg`、`APP_RUNTIME_NAME`、数据目录、appId / bundleId、可执行名。
- 不改 `apps/docs-site` 用户文档与仓库 README 的产品词（TASK-0047 / TASK-0048 另线）。
- 不改 plugin-cli 开发者文案与生成模板（`install:vetta` 脚本名属兼容合同）。
- 不替换代码注释与 ADR 里的历史词。

## Given / When / Then

1. Given 未设置 `VETTA_BRAND_PROFILE` 且界面语言为中文，When 用户在新会话里问 agent「你是谁」，Then 它自称小爱ai，回答与提示词里都不出现 Vetta / Vetta Desktop。
2. Given 显式 `VETTA_BRAND_PROFILE=self`，When 同一提问，Then 自称 Open Forge。
3. Given 任一档位，When agent 调用 PDF / OCR 类工具或工具定位失败，Then 用户看到的工具描述与错误文本不含遗留品牌名。
4. Given 用户在系统插件（设计画布、导出 mockup、能力用法）里看到产品词，When 任一档位，Then 文案与产物使用当前档位品牌名。

## 必须保持

- 角色、工具调用、错误、取消、usage、stop 语义不变：本次只改文案与身份词。
- CLI 指引里的命令名必须与 dev 与打包实际安装的命令一致。
- 两档继续共用冻结的兼容身份，切换档位零迁移。
- 现有品牌归一规则与 i18n post-processor 语义不退化。

## 验收标准

- 装配后的 Desktop 会话系统提示词不含 `Vetta` / `Vetta Desktop` 遗留词，且两档身份词正确（有回归测试）。
- 运行时错误文本、系统插件文案有对应回归测试或机械门禁。
- 定向测试、`test:impact` 与完整 `bun run check` 通过；真实 dev 界面的人工验收另行反馈。

## 风险与失效条件

- 改身份行与 CLI 指引会改变模型行为（自称与工具路由），`docs/agent/tool-routing-evaluation.md` 的路由评估与人格化提示合同需同步复核，必要时重跑评估。
- 系统提示词属缓存前缀，改动使已缓存前缀一次性失效。
- 系统插件文案由插件自行渲染：宿主注入的品牌名是唯一来源，无宿主上下文（插件单测、独立打包）需保留可复现默认。
