<!-- Copyright The Open Forge contributors. -->
# Requirements

这里记录稳定的用户目标、产品边界和可验收行为，不记录具体实现步骤。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`TEMPLATE.md`](TEMPLATE.md)。

## 当前需求索引

| ID | 名称 | 状态 | 现有证据 |
|---|---|---|---|
| `REQ-0019` | 任务合同驱动的自主研发全流程 | ready | [PLAN-0019](../plans/PLAN-0019-autonomous-development.md) |
| `REQ-0018` | 桌面侧边栏入口命名与页面内容一致 | ready | [TASK-0319](../tasks/TASK-0319-sidebar-nav-labels.md)（verifying：catalog 改名与相邻文案已落地，定向 132 例与完整 check 全绿，待人工验收） |
| `REQ-0017` | 桌面端「智能客服」直连 WeKnora | ready | [TASK-0318](../tasks/TASK-0318-weknora-customer-service.md)（verifying：实现与测试完成，待人工验收） |
| `REQ-0016` | 受管编码工具环境自诊断（doctor） | ready | [TASK-0307](../tasks/TASK-0307-managed-tool-inspect-and-version-marker.md)（ready）、[TASK-0308](../tasks/TASK-0308-doctor-cli-and-diagnostics-export.md)（ready）、[RESEARCH-0030](../research/RESEARCH-0030-managed-coding-tool-doctor-inspection.md) |
| `REQ-0015` | 实体表单电子化二期（eform-craft 三版块团队化） | ready | [TASK-0273](../tasks/TASK-0273-eform-team-preset.md)（verifying：五步验证链全绿，团队行为面待实机验收） |
| `REQ-0014` | 实体表单电子化一期（eform-craft 预置插件） | ready | [TASK-0272](../tasks/TASK-0272-eform-craft-preset.md)（verifying：五步验证链全绿，@eform 行为面待实机验收） |
| `REQ-0013` | 品牌层贯通模型可见与终端用户可见文案 | ready | [TASK-0249](../tasks/TASK-0249-agent-identity-and-cli-guidance-brand.md)（in_progress）、[TASK-0250](../tasks/TASK-0250-runtime-user-visible-brand-strings.md)、[TASK-0251](../tasks/TASK-0251-system-plugin-brand-copy.md)、[TASK-0252](../tasks/TASK-0252-desktop-i18n-brand-composition-guard.md) |
| `REQ-0012` | SSH 远程项目文件传输（上传/下载） | ready | [TASK-0240](../tasks/TASK-0240-ssh-file-transfer.md)（verifying：三切片已落地，待人工验收） |
| `REQ-0011` | 品牌档案默认口径（dev 与打包 = 外部分发） | ready | [TASK-0224](../tasks/TASK-0224-brand-profile-default-distribution.md) |
| `REQ-0010` | MCP 工具暴露粒度（按 server / 工具选择常驻或按需） | draft | [RESEARCH-0024](../research/RESEARCH-0024-pi-workflow-post-design-review.md)、[PLAN-0017](../plans/PLAN-0017-mcp-tool-exposure-granularity.md) |
| `REQ-0009` | Desktop 外观字体偏好 | ready | [RESEARCH-0020](../research/RESEARCH-0020-desktop-font-preferences-and-licenses.md) |
| `REQ-0008` | 非手机上游能力选择性适配 | ready | [PLAN-0014](../plans/PLAN-0014-selective-upstream-nonmobile.md) |
| `REQ-0001` | work/coding 本地 Desktop MVP | ready | [`exprot/mvp-scope.md`](../../exprot/mvp-scope.md)、[`ISSUE-0006`](../issues/ISSUE-0006-conversation-task-promotion-policy.md) |
| `REQ-0002` | Runtime 性能与可靠性基线 | ready | [`exprot/session-memory.md`](../../exprot/session-memory.md)、[`exprot/differential-testing-observability.md`](../../exprot/differential-testing-observability.md) |
| `REQ-0003` | Open Forge 品牌化发布 | ready | [`exprot/rebrand-plan.md`](../../exprot/rebrand-plan.md) |
| `REQ-0004` | AI 自主工程交付与人工功能验收 | ready | [`project/CONVENTIONS.md`](../CONVENTIONS.md)、`.agents/skills/open-forge-task-intake/SKILL.md` |
| `REQ-0005` | Open Forge 独立发布与二开合规 | ready | [`PLAN-0005`](../plans/PLAN-0005-independent-release-and-fork-governance.md)、[`ISSUE-0007`](../issues/ISSUE-0007-independent-desktop-version-baseline.md) |
| `REQ-0006` | Agent Team 编排协作对齐参照系 | ready | [`RESEARCH-0008`](../research/RESEARCH-0008-multi-agent-orchestration-comparison.md)、[`PLAN-0008`](../plans/PLAN-0008-agent-team-orchestration-alignment.md) |
| `PRODUCT` | 产品定义基线 | active | [`PRODUCT.md`](PRODUCT.md) |

## 需求文件最低结构

```yaml
---
id: REQ-xxxx
type: requirement
status: draft
priority: P1
owner:
source:
related_plan: []
updated: YYYY-MM-DD
---
```

正文必须包含：问题、用户结果、范围、不做什么、Given/When/Then、必须保持的不变量、验收标准和风险。
