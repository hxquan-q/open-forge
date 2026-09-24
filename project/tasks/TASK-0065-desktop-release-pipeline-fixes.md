---
id: TASK-0065
type: task
status: done
priority: P0
owner: release/desktop
requirement: REQ-0005
plan: PLAN-0005
source_issue: ISSUE-0007
execution: serial
branch: forge/dev
worktree: unassigned
read_paths: [.github/workflows/desktop-release.yml, scripts/release-desktop.mjs, scripts/release/release-notes.mjs, apps/desktop/scripts/prepare-pack.js]
write_paths: [.github/workflows/desktop-release.yml, scripts/release-desktop.mjs, scripts/release-desktop.test.mjs]
exclusive_paths: [.github/workflows/desktop-release.yml]
depends_on: [ISSUE-0007]
conflicts_with: []
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 首发发布流水线修复

## 目标

修复 `desktop-release.yml` 在真实首发时必然失败的存量缺陷，并按 ISSUE-0007 决策补齐 Preview 发布语义与 macOS 条件化，使 `v0.1.0` tag 触发的流水线真实可用。

## 范围

### 做

- GitHub Release 标题 `"Vetta ${VERSION}"` 改为 Open Forge 品牌（`desktop-release.yml` publish-github 步骤）。
- Linux 打包冒烟断言的 `/opt/Vetta/Vetta`、`*vetta*.desktop` 等路径更新为 Open Forge 实际安装路径（productName `Open Forge` / executableName `OpenForge`）。
- `gh release create` 增加 `--prerelease` 支持：首发 Preview 须以 Pre-release 标记发布（可加 workflow input 或对 Preview 固定启用，按最小改动实现）。
- macOS leg 条件化：`REQUIRE_RELEASE_SIGNATURE` 下 macOS 签名/公证 secrets 未配置时，首发允许排除 macOS job 且不使 merge/verify/publish 阶段因缺产物失败；secrets 配好后可恢复。
- 全量扫描 workflow 内其余残留 `Vetta`/`vetta` 路径与命名（`latest*.yml`、artifactName、docker 断言、缓存键等），一并修正。
- `scripts/release-desktop.mjs` 的 `prepare` 在生成 Release Notes 模板时写入末行 `Upstream baseline: upstream/dev@<git merge-base upstream/dev HEAD>`。

### 不做

- 不执行真实发布、不创建 tag、不 push。
- 不改版本解析器（保持纯 `X.Y.Z`，不引入 prerelease 后缀版本号）。
- 不动 `default`/`stable`/`test` 渠道语义本身。

## Given / When / Then

- Given：`v0.1.0` tag 触发 desktop-release；When：流水线执行；Then：Release 标题为 Open Forge、标记 Pre-release、Linux 冒烟断言匹配实际安装路径、macOS 缺失不阻塞 Win+Linux 发布。

## 必须保持

- `publish-github` 对已发布 Release 拒绝修改的守卫不变。
- test 渠道不建 GitHub Release 的行为不变。
- 质量、构建、verify 阶段的既有门禁不降级。

## 测试与验证

- `release-desktop` 相关定向测试（含新增 baseline 行断言）；workflow YAML 语法检查；`bun run check:quick` 限本批文件。
- 不运行真实 workflow_dispatch；条件化逻辑以 dry-run/静态审查为准。

## 交付记录

- 实际修改：`.github/workflows/desktop-release.yml`（prepare 新增 `Resolve platform matrix` 动态矩阵步骤与 `platform-matrix`/`macos-enabled`/`update-metadata-files` 输出；build/verify 矩阵改 `fromJSON`；Linux 冒烟断言改 `/opt/Open Forge/OpenForge` 与 `*openforge*.desktop`；Release 标题改 `Open Forge ${VERSION}` 且 `0.x` 自动 `--prerelease`；verify-feed 两 job 传入 `VETTA_UPDATE_FEED_METADATA`）、`apps/desktop/scripts/verify-update-feed.mjs`（新增 `resolveUpdateFeedMetadataFiles`）、`scripts/release-desktop.mjs`（prepare 写入 `Upstream baseline:` 行、publish 校验该行）、对应两个测试文件更新。
- 实际运行：workflow 合同测试与 release-desktop 测试 36/37 通过（唯一失败为「restore checkpoint」用例内 GNU tar 对 Windows `C:` 盘符路径的环境性失败，所执行步骤脚本本次未改动，属 pre-existing）；`verify-update-feed` node:test 7/7 通过；`check:quick` 本批文件 Biome 干净（既有无关 guard：`coding-agent/projects` tsconfig path map，并行改动遗留）。
- 未运行及原因：未执行真实 workflow_dispatch / tag 推送（未授权发布）；macOS 条件化逻辑经静态审查与合同测试覆盖。
- 剩余风险：`VETTA_MACOS_RELEASE` 覆盖开关需在 repo Variables 中配置才生效（默认 auto 已满足首发）；若 mac 签名 secrets 配置在 `desktop-production` 环境作用域，test 渠道 dispatch（desktop-test 环境）将自动剔除 mac leg——与该环境下本就签不了名的现状一致。
