---
id: PLAN-0005
type: plan
status: in_progress
priority: P0
requirement: REQ-0005
owner: release/desktop
created: 2026-09-23
updated: 2026-09-23
depends_on: [PLAN-0003]
---

# Open Forge 独立发布与二开治理

## 背景与目标

用户已选择 Open Forge Desktop 使用独立 SemVer，上游代码基线单独记录。目标是把这一决定落实为安全的 Desktop 发布流水线、发行物许可证交付、身份隔离和低冲突上游同步范式；不在本计划中猜测首发号或执行发布。

## 当前事实

- `apps/desktop/package.json` 仍为 `0.5.59`；Release Notes 路径与 Desktop tag 校验均以此字段为源。
- 根 workspace、Desktop 和各 workspace package 存在不同版本流；根 `scripts/release.mjs` 仍假定锁步更新。
- Desktop `prepare-pack.js` 在临时 staging 中组装应用，目前没有显式 staging 根 `LICENSE`/`NOTICE` 的步骤；Linux 的 `license: Apache-2.0` 只是包元数据。
- 根目录已有 Apache-2.0 `LICENSE` 和包含上游/第三方归属的 `NOTICE`；NOTICE 仍含 Open Vetta/Vetta 署名，不可整份覆盖。
- Desktop 品牌外置层已落地但 `TASK-0043` 仍处 verifying；现有 `TASK-0044` 负责用户可见文案迁移，当前原生 About 文案仍有 Vetta。
- `APP_RUNTIME_NAME=vetta` 与 safeStorage 凭据密钥相关，应作为兼容身份保留，不能纳入无差别品牌替换。

## 候选方案与取舍

- **Desktop 独立 SemVer + upstream commit 元数据（已选）**：产品版本、tag、更新元数据和 Release Notes 共用 Desktop 版本；上游来源另记 SHA/基线，不混入 SemVer。代价是需在首发前确定初始版本并验证更新路径。
- **继续照搬上游版本序列（未选）**：改动少，但无法清晰表达 Open Forge 自己的发布生命周期。
- **Desktop 双版本号（不采用）**：能并列表达产品号和上游号，但会增加安装包、更新器、日志和支持文档的歧义；当前只记录上游 SHA。
- **workspace package 锁步版本（拒绝默认假设）**：当前 package 版本并不一致；在发布范围未明确前，根脚本应 fail closed，不得批量覆盖版本。

## 阶段

1. **决策门（done，2026-09-23 四轮决策确认）**：ISSUE-0007 定首发 `0.1.0` Preview（Win+Linux 先行、macOS 待签名凭据、Release 标 prerelease、上游基线 SHA 入说明末行、publish 用户执行）；ISSUE-0008 定署名 `The Open Forge contributors` + 文件头声明 + 动态 merge-base 审计；ISSUE-0009 定不公发包 + 发包面硬化。
2. **Desktop 发版隔离（done）**：TASK-0052 完成——`release-desktop.mjs` 拆为 `prepare`（本地可审查）与 `publish <v> --confirm-publish`（显式授权才 commit/tag/`push --atomic`），22 个定向测试通过；未运行真实发布。
3. **发行物许可交付（done）**：TASK-0055 完成——根 `LICENSE`/`NOTICE` 经 `stage-desktop-legal-resources.mjs` 进入 staging `legal/` 并注册 `extraResources`，包装合同缺文件即失败；75 项 packaging 测试与 contract 校验通过。
4. **workspace 发布防护（done）**：TASK-0056 完成——`release.mjs` 在任何写入/远端副作用前强制 `RELEASE_PACKAGE_SCOPE=lockstep` + `RELEASE_PUSH=true` + 全 cohort 同版本；当前混合版本仓库按预期被拒。独立 package 发布拓扑留给 ISSUE-0009 裁决。
5. **身份与二开规则（done）**：TASK-0057 完成——`AGENTS.md`/`CLAUDE.md`/Release Notes README 固化版本切换门禁；`NOTICE` 追加下游关系声明；误入上游 v0.5.59 说明的 fork 条目恢复上游原文并暂存 ISSUE-0007；TASK-0044 完成原生 About 品牌与 credits（TASK-0043 品牌层仍在 verifying）。Upstreamable / Open-Forge-only / Compatibility 三类归属与同步后行为合同已入 PLAN/AGENTS。
6. **首发前执行项（ready）**：TASK-0065 修复发布流水线存量缺陷（Release 标题、Linux 冒烟路径、prerelease 标记、macOS 条件化、上游基线行）；TASK-0058 已完成 §4(b) 文件头迁移与审计脚本（missing=0）；TASK-0066 已产出清单草案（VERIFY-0005）待用户终审；TASK-0067 发包面硬化完成。全部完成后由用户执行 `prepare` 审查 → `publish 0.1.0 --confirm-publish`；本计划不代执行 tag、push、npm 发布或真实商业发行。

## 不做什么

- 不将上游已发布 Release Notes 改写为 Open Forge 发行正文。
- 不把 Apache-2.0 解读为闭源插件必须开源；只对复制/改写/分发的代码和各第三方组件执行相应许可义务。
- 不改凭据运行名、持久化协议或其他已冻结兼容合同；迁移需另行评估。
- 不建立自有域名、签名证书或 npm 组织，不调用真实服务，不发布制品。

## 验证与回滚

- Desktop release CLI：纯函数测试覆盖 version 校验、prepare 不提交/tag/push、publish 缺少显式授权时拒绝；测试不调用真实 GitHub。
- Packaging：合同测试覆盖根 LICENSE/NOTICE 存在及其映射到每个平台 extraResources；定向运行 Desktop packaging tests 与 `bun run verify:desktop:contracts`。
- Identity：品牌替换边界测试覆盖 Vetta 产品称呼被替换、技术 token 保持；原生 About 选项使用同一品牌事实源。
- Workspace release：不同 package 版本输入使守卫在写入、commit、tag、push 前失败；针对具体发布策略的测试在 ISSUE-0009 决策后补齐。
- 回滚以单个 Task 为边界：移除 staging 映射或发布 CLI 改动，不回滚用户已有工作区改动；真实发布未发生，因此不需要 tag/数据回滚。

## 升级信号

- 新平台安装包或新增内置 sidecar/model/third-party binary 时，更新许可证清单和包布局合同。
- 上游合并冲突持续增长、同一热文件重复冲突或合同测试漂移时，重新评估品牌/适配层边界。
- 新增实际公开 package 发布需求时，以明确的 release scope 重开 ISSUE-0009，不恢复全仓锁步假设。
- 首次 Open Forge 用户升级、身份迁移或稳定版承诺前，重新审核 appId、safeStorage、数据目录、协议与 updater 迁移路径。

## 需要的 ADR

- ISSUE-0007/0009 决策完成后，为独立 Desktop SemVer、workspace 发布边界及来源元数据记录 ADR；当前先不写带有未决结论的 ADR。
