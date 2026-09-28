<!-- Copyright The Open Forge contributors. -->
# @vetta/plugin-preset-allstar-coding

AllstarCoding 全流程软件工程流水线预置插件：主控 `@allstar` + 常驻辅助者 `@helper` 组成
「Allstar 流水线」团队，以 13 环节流水（需求评估 → HTML 原型 + 需求确认门 → 架构 → 任务拆分 →
逐任务开发/评审循环 → 白盒体检 → 黑盒 → 部署 → 收尾）驱动目标项目的全生命周期交付；
`docs/ac/state.md` JSON 状态机支持中断恢复，每环节收口走 ac-gate 产物硬校验。

## Context Boundary

```yaml
purpose: 预置（preset）插件——运行时无代码贡献，仅随 manifest 铺设智能体、团队、技能与本地化声明
provides:  []
consumes:  []
internal_dependencies:
  - "@vetta-org/plugin-sdk"
  - "@vetta-org/plugin-vite"
```
