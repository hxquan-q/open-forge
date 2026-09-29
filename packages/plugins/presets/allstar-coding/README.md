<!-- Copyright The Open Forge contributors. -->
# @vetta/plugin-preset-allstar-coding

AllstarCoding 全流程软件工程流水线预置插件：主控 `@allstar` + 常驻辅助者 `@helper` 组成
「Allstar 流水线」团队，以 13 环节流水（需求评估 → HTML 原型 + 需求确认门 → 架构 → 任务拆分 →
逐任务开发/评审循环 → 白盒体检 → 黑盒 → 部署 → 收尾）驱动目标项目的全生命周期交付；
`docs/ac/state.md` JSON 状态机支持中断恢复，每环节收口走 ac-gate 产物硬校验。

v0.4（权限与校验体系）：任务契约 schema v2（scope glob / prohibitions / help_protocol）、
角色权限矩阵 v1（三档分级、写域互不重叠、T3 应急申请制）、reviews.md 追加制评审记录、
T 级存档制、越权处置 SOP 六步、V1-V6 硬校验节点（双证据链：git 轨迹 + 文件 mtime）。
随包分发 `scripts/ac-audit.mjs` 只读审计脚本（V2 环节收口 / V3 评审前快照 / V4 存档点），
主控在关键节点执行并贴报告留档；L2（工具层写域拦截）待内核侧排期。

## Context Boundary

```yaml
purpose: 预置（preset）插件——运行时代码贡献为空；随 manifest 铺设智能体、团队、技能与本地化声明；附带 scripts/ac-audit.mjs 只读审计脚本（主控侧 node 执行，不进渲染进程）
provides:  []
consumes:  []
internal_dependencies:
  - "@vetta-org/plugin-sdk"
  - "@vetta-org/plugin-vite"
```

