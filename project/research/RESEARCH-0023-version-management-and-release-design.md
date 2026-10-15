---
id: RESEARCH-0023
type: research
status: done
priority: P1
owner: release/product
source: upstream/dev 发布链路源码；hxquan-q/open-forge 现状；官方文档与公开项目
created: 2026-10-05
updated: 2026-10-05
related_requirement: [REQ-0005]
related_plan: [PLAN-0016]
related_tasks: []
related_issues: [ISSUE-0007]
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# 版本迭代与发版设计：上游 Vetta、业界做法与本仓现状

## 问题与范围

用户要求对照「别人怎么设计版本迭代」与「原 Vetta 怎么做」，并据此给出本仓版本管理与发版的重构方案。本记录只收证据与现状；方案在 [PLAN-0016](../plans/PLAN-0016-version-management-release-refactor.md)。

## 来源

第一方：

- 上游 `upstream/dev`：`.github/workflows/desktop-release.yml`、`desktop-promote.yml`、`desktop-upgrade-e2e.yml`、`docs/desktop/release-ci.md`、`apps/desktop/CHANGELOG.md`、`git log upstream/dev -- apps/desktop/package.json`、tags 与 GitHub Releases。
- 本仓：`apps/desktop/package.json`、`.github/release-notes/`、`scripts/release-desktop.mjs`、`scripts/release/*`、`.github/workflows/*`、根 `package.json`、`docs/desktop/release-ci.md`、[ISSUE-0007](../issues/ISSUE-0007-independent-desktop-version-baseline.md)、[ISSUE-0009](../issues/ISSUE-0009-workspace-package-release-scope.md)、[PLAN-0005](../plans/PLAN-0005-independent-release-and-fork-governance.md)。

外部（官方文档优先）：SemVer 2.0.0 与 FAQ、CalVer、Conventional Commits 1.0.0、Keep a Changelog 1.1.0；Changesets 的 `fixed`/`linked`/independent 与 `privatePackages`、semantic-release、release-please、release-drafter、Nx release / version plans、Lerna；electron-builder 自动更新（通道、`stagingPercentage`、`allowPrerelease`）与 publish（`releaseType`）；Electron 代码签名、Squirrel.Windows `RELEASES`、Apple 公证；GitHub Environments 与 required reviewers、rulesets、tag protection、自动生成 release notes、pre-release 标记。

## 当前结论

### A. 上游 Vetta 的做法

- **版本号**：`0.5.x` 连续小版本递增，`v0.5.48` 到 `v0.5.60` 带 tag 与 GitHub Release；节奏约每周一版（0.5.58、0.5.59、0.5.60 分别在 09-18、09-22、09-30）。
- **版本提升是独立提交**：`chore(release): 桌面端版本号升到 0.5.6x`（如 `b2dcbd857`、`7c873befa`），与功能提交分开。
- **说明文件**：`apps/desktop/CHANGELOG.md` 自 0.5.58 起冻结，原因写在文件头：0.5.49 到 0.5.57 的条目跨多个已发布版本、无法再可靠拆分，因此原样保留 `[Unreleased]`。此后改为 `.github/release-notes/v<版本>.md`，一版一文件，由 `desktop-release` 直接作为 GitHub Release 正文。
- **发布流水线**：由 `v*` tag 或 `workflow_dispatch` 触发；`prepare` 作业把 tag 名与 `apps/desktop/package.json#version` 比对，不匹配就跳过构建；`channel` 分 `stable` 与 `test`，`build_version` 只允许测试通道覆盖；构建与发布作业挂在 `desktop-production` 与 `desktop-test` 两个 Environment 上，构成审批门。
- **更新清单不在发版时上线**：各平台构建成功即上传安装包与 blockmap，更新清单只进 `<prefix>/pending/<版本>/`；要人工在 Actions 里跑 `desktop-promote`（填 `version`、`channel`、`platforms`，`desktop-promote.yml` 与 `promote-update-metadata-r2.mjs`，提交 `9c8376e7e`）才把清单上线。它还会合并 macOS 双架构清单、核对版本与 sha512 及大小、拒绝降级、回公网复核（CDN 60 秒缓存自动重试），并把清单附到 GitHub Release。上游 `docs/desktop/release-ci.md` 明写代价：CI 不会让任何客户端看到新版本。
- **升级冒烟**：`desktop-upgrade-e2e.yml` 手动跑「已装 baseline_version 升到 candidate_version」。

### B. 业界通行做法

- **SemVer 与 0.x**：`0.y.z` 明确「公共 API 不应视为稳定」，`1.0.0` 才定义公共 API；预发布用 `-alpha.1` 这类后缀，`+` 构建元数据不参与优先级比较。本仓桌面端处于 `0.1.x`，属初始开发期。
- **CalVer**：适合作用域持续变化、时间敏感或面向非技术受众的产品；它刻意不表达破坏性变更，必须配变更日志与基于时间的弃用策略。
- **节奏**：release train（Rust 6 周、Firefox 4 周、Chrome 已压到 2 周）对 trunk-based「从主干发布、缺陷 fix forward」。特性冻结分支是 Git Flow 的做法，原作者本人对其在持续交付团队中的适用性有保留。
- **变更日志工具**：Changesets 以「PR 内提交 intent」为核心，评审发生在 PR 阶段；semantic-release 从 Conventional Commits 推导 bump，零人工但强依赖提交规范；release-drafter 以 PR 为粒度、不改版本文件；`standard-version` 已弃用。
- **monorepo 版本策略**：Changesets 的 `fixed`（同组始终一起 bump）、`linked`（各自有变更才 bump，版本取组内最高）、independent；私有且永不发布的 app 需要 `privatePackages` 才会被追版本与打 tag。
- **桌面端专有**：electron-updater 三通道 latest/beta/alpha；GitHub provider 不识别版本后缀，要显式设 `channel`；`allowPrerelease` 只在 GitHub provider 生效，为真时才允许降级；灰度靠手工在清单里加 `stagingPercentage`，撤回坏版本只能发更高版本号；发布前必须给 `--publish` 明确范围。Windows 自 2023-06 起需要 EV 证书，macOS 10.15 起强制公证且 `altool` 自 2023-11-01 停收。
- **授权与保护**：GitHub Environments 的 required reviewers 把发布授权落到平台层（最多 6 个用户或团队、一人批准即可、可开禁止自审、待审 30 天自动失败）；ruleset 的 restrict creations/updates/deletions 可限制 `v*` tag 的创建、改写与删除，让「移动已发布 tag」不可为。
- **典型反模式**：版本号散落多文件而失同步；从脏或未验证分支发版；说明事后补写；未发布版本的说明带上发布日期（Keep a Changelog issue #326）；移动或强推已发布 tag；minor/patch 级夹带破坏性变更（`colors.js`、`faker.js` 事件）。

### C. 本仓现状与缺口

现状：

- 首发决策见 ISSUE-0007：独立 SemVer、首发 0.1.0 Preview、Win+Linux 先行、GitHub Release 打 pre-release、不引入预发布后缀（保持纯 `X.Y.Z`）、上游基线行自动取 merge-base、publish 由用户亲自执行。
- 发版驱动 `scripts/release-desktop.mjs`：`prepare` 校验干净工作区与分支，跑 `check:lint`、desktop typecheck、`check:guards`，只改 `apps/desktop/package.json`、`bun.lock` 与说明文件；说明模板写 `发布日期：待定` 与自动基线行。`publish <X.Y.Z> --confirm-publish` 在提交、打 tag、`push --atomic` 之前要求说明满足四件事：标题等于版本、日期不含「待定」、至少一个有条目的小节、基线行格式合法。
- 发布工作流 `desktop-release.yml`：prepare、quality、build、verify、publish-r2 与 publish-github、verify-feed，挂 `desktop-production` 与 `desktop-test`。
- ISSUE-0009：不公开发布任何 workspace 包；`scripts/release/package-release-policy.mjs`、`publish-private.mjs` 与各包 `private: true` 做 fail-closed。

缺口：

1. **发布状态在仓库里不可分辨**：`v0.1.3` 无 tag 无 Release，但 `v0.1.3.md` 已写 `发布日期：2026-09-29`。设计本意是 `prepare` 写「待定」、`publish` 前才确认；当前实现只拒绝「仍含待定」，无法区分「发布日期提前写」和「发布时确认」，于是这条约定在唯一生效点被绕过。
2. **两个版本事实源**：`apps/desktop/package.json#version` 与说明文件名、标题。发布脚本在 publish 时检查标题，`check` 只检查文件存在；CI 阶段没有「文件名版本等于 manifest 版本等于标题」的断言。
3. **说明文件是并行任务的热文件**：一版一文件、所有任务往里追加；本次会话合并 `origin/chenxvhua` 时唯一的冲突就是它，TASK-0197 的记录也把它列为共享冲突路径。
4. **上游锁步发版机器的残留**：根 `package.json` 仍有 `version:patch`、`version:minor`、`version:major`（`npm version -ws` 加 `scripts/sync-versions.js` 加 `rm -rf node_modules ... package-lock.json`）、`release:patch`、`release:minor`、`release:major`（指向 `scripts/release.mjs`，脚本头自称 Legacy lockstep workspace package release）、`publish`、`publish:dry`、`publish:private`。它们与 ISSUE-0009 冲突，且 `version:*` 会锁步改写包括 `apps/desktop` 在内的全部 workspace 版本。
5. **版本号散落且无成文政策**：根 `package.json`、`apps/docs-site`、`packages/runtime-knowledge` 仍是继承来的 `0.55.3`；`apps/cli-host` 0.0.1；`apps/mobile` 在 `package.json` 与 `app.json` 各写 1.0.0；`apps/kotlin` 用 `versionCode` 与 `versionName`；`apps/im-gateway` 用 Makefile 的 `VERSION`；插件包各有独立版本。
6. **更新清单直发**：本仓 `desktop-release.yml` 在发布阶段直接上线更新清单，没有上游的 pending 暂存与 `desktop-promote` 上线门；本仓 `docs/desktop/release-ci.md` 已按缓存与重跑重写，不再描述该门。代价是发布作业一成功客户端就能看到新版本，且缺少上游清单上线时的降级拒绝与 sha512、公网复核。

## 被否决的方案与原因

- **照搬上游 0.5.x 序列**：ISSUE-0007 已否决，无法表达 Open Forge 自己的生命周期。
- **Desktop 双版本号（产品号加上游号）**：PLAN-0005 已否决，安装包、更新器、日志与支持文档的歧义成本高。
- **改用 semantic-release 从 Conventional Commits 自动推导版本与说明**：本仓说明是面向用户的中文散文，且要求与代码改动同任务完成；自动化产出会把用户可见文案降级成提交标题的堆叠。
- **整体引入 Changesets**：本仓 workspace 包不发布（ISSUE-0009），Changesets 的主要价值用不上；但其「任务内提交意图加发布时汇编」的形态可借鉴。

## 代码锚点

- `scripts/release-desktop.mjs`：`releaseNotesTemplate`（写「待定」）、`upstreamBaselineSha`（`git merge-base upstream/dev HEAD`）、`assertReleaseNotesReady`（标题、日期、小节、基线四处校验）、`desktopPublishCommands`（commit、tag、`push --atomic`）。
- `.github/workflows/desktop-release.yml`：`prepare` 的 tag 与 version 比对、两个 Environment。
- `.github/release-notes/README.md`、`docs/dev/agent-rules/delivery.md`：一版一文件、四节结构、已发布版本不再修改。
- 根 `package.json`：`version:*`、`release:*`、`publish*` 脚本。
- `scripts/release/package-release-policy.mjs`、`scripts/release/publish-private.mjs`：workspace 发包 fail-closed。

## 结论失效条件

- 上游改用新的版本方案或发布工具链时，A 节需复核。
- 本仓决定公开发布其他 workspace 包（推翻 ISSUE-0009）时，monorepo 版本策略需重新评估。
- 桌面端进入 1.0，或改为以 beta/canary 通道分发时，「纯 X.Y.Z、无预发布后缀」的决定需要重审。

## 下一步触发信号

- 用户对 PLAN-0016 的阶段取舍给出方向（是否恢复上线门、是否把说明拆成碎片）。
- `v0.1.3` 真正发版时，验证「发布日期只在发布时写」的守卫是否生效。

## 外部来源

- SemVer：https://semver.org/spec/v2.0.0.html 、https://semver.org/#faq
- CalVer：https://calver.org/ 、https://calver.org/overview.html
- Conventional Commits：https://www.conventionalcommits.org/en/v1.0.0/
- Keep a Changelog 与未发布版本带日期的混淆：https://keepachangelog.com/en/1.1.0/ 、https://github.com/olivierlacan/keep-a-changelog/issues/326
- Changesets：https://changesets.dev/guide/cli 、https://github.com/changesets/changesets/blob/main/docs/versioning-apps.md 、https://changesets-docs.vercel.app/fixed-packages.html 、https://changesets-docs.vercel.app/linked-packages.html
- semantic-release：https://semantic-release.org/usage/configuration/ ；release-please：https://github.com/googleapis/release-please ；release-drafter：https://github.com/release-drafter/release-drafter
- Nx release：https://nx.dev/docs/guides/nx-release/file-based-versioning-version-plans ；Lerna：https://lerna.js.org/docs/features/version-and-publish
- electron-builder：https://www.electron.build/docs/features/auto-update 、https://www.electron.build/docs/publish/
- Electron 签名与更新：https://electronjs.org/docs/latest/tutorial/code-signing ；Apple 公证：https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- GitHub Environments 与审批：https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments ；rulesets：https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets ；自动生成说明：https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes
- 节奏参考：https://forge.rust-lang.org/release/process.html 、https://developer.chrome.com/blog/chrome-two-week-release 、https://trunkbaseddevelopment.com/release-from-trunk/
- 移动已发布 tag 的代价：https://www.git-automation.com/git-workflow-architecture-branching-strategies/release-tagging-versioning/moving-or-deleting-a-published-tag/
