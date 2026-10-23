---
id: TASK-0391
type: task
status: verifying
priority: P2
owner: desktop
requirement:
plan:
source: 用户请求（公开仓库后需要一个只出 macOS 测试包的廉价入口）
related_requirement: []
related_plan: []
related_tasks: [TASK-0159]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0367-desktop-macos-test-workflow
worktree: ../open-forge-wt/task-0367-desktop-macos-test
base_commit: 2f9d42762e2638601c5907bb1edfd88b36e0e68c
read_paths:
  - .github/workflows/desktop-release.yml
  - .github/workflows/desktop-packaged.yml
  - .github/workflows/desktop-cache.yml
  - .github/actions/desktop-download-cache/action.yml
  - .github/actions/install-bun-dependencies/action.yml
  - .github/actions/prepare-desktop-resources/action.yml
  - apps/desktop/package.json
  - apps/desktop/scripts/run-electron-builder.js
  - apps/desktop/scripts/desktop-build-environment.mjs
write_paths:
  - .github/workflows/desktop-macos-test.yml
  - docs/dev/quality-gates.md
  - project/tasks/TASK-0391-desktop-macos-test-workflow.md
  - project/tasks/README.md
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0197, TASK-0223]
integration_status: integrated
created: 2026-10-22
updated: 2026-10-22
---
<!-- Copyright The Open Forge contributors. -->

# 新增 macOS 测试包手动构建工作流

## 目标

给测试同学一个「只出 macOS 未签名 DMG」的手动入口。正式链路 `desktop-release` 要先过全量 `bun run check` 与 release notes 校验，再跑 Windows、Linux 两个 leg 和 packaged E2E，只为拿一个 mac 测试包时等待与配额成本都不合理。

## 范围

### 并发评估

- 结论：支持串行执行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无（不改动 `desktop-release` / `desktop-packaged` 语义）
- 冲突文件/独占路径：`project/tasks/README.md` 与 `project/tasks/` 索引区与 TASK-0197、TASK-0223 的写路径重叠，已登记 `conflicts_with`；本 Task 只追加一行索引，不重排既有行
- Branch：`task/TASK-0367-desktop-macos-test-workflow`
- Worktree：`../open-forge-wt/task-0367-desktop-macos-test`
- 集成负责人：Coordinator
- 集成顺序：先入 `dev`，随后随 `dev → main` 稳定晋升进入默认分支（`workflow_dispatch` 注册与按钮都以默认分支为准）

### 做

- 新增 `.github/workflows/desktop-macos-test.yml`：`workflow_dispatch` 触发，输入 `arch`（`arm64` / `x64` / `both`）、`brand_profile`（`distribution` / `self`）、`notes`。
- 每个架构使用匹配的托管 runner（`macos-15` / `macos-15-intel`），复用 `desktop-download-cache`、`install-bun-dependencies`、`prepare-desktop-resources` 三件套。
- 构建命令为 `bun run dist:opensource -- --platform mac --arch <arch> --target dmg`：开源版环境、无 `.env` 依赖、不签名不公证。
- 产物以 `macos-<arch>-<version>` 上传 Artifacts（DMG + `latest-mac.yml`，保留 14 天），并在运行摘要写入版本、架构、品牌档案与安装提示。
- 在 `docs/dev/quality-gates.md` 的 CI 章节说明该手动入口与它的边界。

### 不做

- 不改动 `desktop-release` / `desktop-packaged` / `desktop-cache` 的任何既有行为。
- 不签名、不公证、不发布（无 GitHub Release、无 R2、不合并 `latest-mac.yml`）。
- 不产出 zip/blockmap，因此不承诺可用于自动更新验证。
- 不替换正式发版路径；正式包仍只能由 `desktop-release` 产出。

## Given / When / Then

- Given：仓库为公开仓，`main` 上已注册该 workflow，被选运行 ref 上存在同一文件。
- When：手动触发并选择 `arch=arm64`。
- Then：只启动一个 macOS runner，跳过 quality/Windows/Linux/packaged E2E，Artifacts 中出现未签名 `*.dmg`，运行摘要标注版本与架构。

## 必须保持

- `desktop-release` 的发布门禁（签名/公证必填、tag 与版本一致性、release notes 校验）不被削弱。
- 未签名包里 `prepare-pack` 生成的「修复已损坏.app」DMG 版式与现状一致，不新增绕过 Gatekeeper 的静默手段。
- 品牌档案语义不变：默认 `distribution`（Allstr ai），显式 `self` 才回到 Open Forge。
- 仓库变量 `VETTA_MACOS_RELEASE`、`VETTA_SKIP_SANDBOX_ARTIFACT_CHECK` 的含义不被本次改动改变。

## 测试与验证

- 定向测试：无新增代码逻辑，未新增单元测试；workflow YAML 用仓库自带 `yaml` 解析校验结构（jobs/inputs/matrix 均符合预期）。
- 用户流程：首次真实运行即验证——dispatch（`arch=arm64`）→ build 成功 → 下载 Artifacts 中的 DMG → 在 Apple Silicon 机器右键打开安装。
- 质量检查：改动仅涉及 workflow 与文档，未运行 `bun run check`（本地 WSL 环境无 bun/node PATH）；由 PR 上的 `quality` 覆盖。

## 验收分层

- 工程验证：待执行；尚无真实运行记录，首次 dispatch 的 build job 日志与 Artifacts 即为证据。
- 技术评审：自审；风险点是 `workflow_dispatch` 的注册条件（文件必须在默认分支），已在文档与 PR 说明中写明。
- 集成：`integration_status=integrated`；PR #21 合入 dev（merge `427427cac`），随后随 `dev → main` 晋升进入默认分支（`5833041dc`）。
- 人工功能验收：待验收；需要测试同学在真机装一次并反馈安装/启动结果。
- 发布：不适用，本 Task 不产出对外发布物。

## 功能验收包

- 入口与前置条件：GitHub Actions → `desktop-macos-test` → Run workflow；默认分支上已有该文件。
- 操作步骤或 AI 任务输入：`arch=arm64`，`brand_profile=distribution`，`notes` 随意。
- 预期行为与最终产物：约 30–40 分钟结束，Artifacts 内 `macos-arm64-0.1.3/*.dmg` 可安装。
- 不通过表现与已知限制：DMG 未签名，首次需右键打开或运行包内「修复已损坏.app」；不能验证自动更新；不适用于对外分发。
- 验收反馈及回归案例：无（尚无运行记录）。

## 交付记录

- 实际修改：`.github/workflows/desktop-macos-test.yml`（新增）、`docs/dev/quality-gates.md`（+2 行）、本文件与 `project/tasks/README.md` 索引行。
- 实际运行：仅本地 YAML 结构解析；未运行任何 workflow。
- 未运行及原因：无 bun/node 的 WSL 环境无法执行 `bun run check`；真实构建只能在 GitHub runner 上验证。
- Worktree：已创建 `../open-forge-wt/task-0367-desktop-macos-test`（`git worktree add -b`，base `2f9d42762`），未清理。
- 剩余风险：首次运行前无法证明 `dist:opensource -- --platform mac` 在托管 runner 上的完整耗时；若仓库配置了 `VETTA_MACOS_RELEASE=never` 等无关变量不影响本 workflow（它不读 `desktop-release` 的矩阵逻辑）。
