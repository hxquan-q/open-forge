---
id: TASK-0404
type: task
status: in_progress
priority: P1
owner: ci-infrastructure
requirement:
plan:
source: ISSUE-0029 / 用户请求（2026-10-26） / RESEARCH-0045
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0029]
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 4f7b676b4c75def7c325917c519dfbefbb161967
read_paths: [.github/workflows, scripts/quality, package.json, project/research]
write_paths: [scripts/ci, project/tasks, project/issues/ISSUE-0029-ci-actions-budget-exhausted.md, package.json, biome.json, .github/release-notes, .github/workflows, scripts/quality/check-modified-file-notices.mjs]
exclusive_paths: [scripts/ci]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-26
updated: 2026-10-26
---
<!-- Copyright The Open Forge contributors. -->

# GitHub 到 Codeup 单向同步与云效构建测试

## 目标

GitHub `hxquan-q/open-forge` 保持唯一写入源；由 GitHub Actions 定时同步全部远端分支、标签及其可达历史到 Codeup `Allstar_AI/ALLSTAR-AI`（7608911），在云效运行检查、测试和构建。归属 Open-Forge-only。

## 范围

### 并发评估

- 执行方式：serial；共享 main 内串行写入，只读研究与独立审查可委派原生子任务。
- Branch：main；Worktree：C:/Users/xquan/Desktop/open-forge；不新增并行写入工作区。
- 前置依赖：云效 PAT 的流水线创建权限、仓库最小凭据及触发能力须经实际查询确认。
- 独占路径：scripts/ci；Coordinator 负责索引与集成。

### 做

- 两条可审查的云效流水线配置、同步执行器、引导脚本与安全摘要；通过用户已认证的 PowerShell 执行云端创建，凭据不跨进程导出。
- 同步仅使用 GitHub 当前 refs/heads/* 与 refs/tags/*，保留完整历史，拒绝非快进/同名标签冲突；重复事件可幂等重跑。
- Codeup 测试构建固定代码版本，复用仓库的 Bun/Node 依赖安装、检查与测试命令；先验证 Linux 执行环境，再评估既有跨平台覆盖。
- 真实资源和运行结果回读验收；缺权限/凭据时给出具体、可执行的最后一步。

### 不做

- 不删除分支、覆盖历史、强推，不同步本地未发布引用或 upstream 引用。
- 不部署、不发布 Release/tag、不购买资源、不改造无关旧流水线。
- 新链路验收前不关闭现有 GitHub Actions；Windows/macOS 覆盖不足时保留原检查并准确记录。

## Given / When / Then

- Given：源/目标已有相同历史，GitHub 新增分支、提交或标签；When：触发同步；Then：所有源引用及完整可达历史进入 Codeup，已有相同引用无额外修改。
- Given：目标独有提交或同名不同标签；When：同步；Then：失败并保留双方历史，不强推、不启动依赖成功结果的任务。
- Given：Codeup 收到提交；When：CI 运行；Then：检查、测试与构建使用同一可识别 SHA，任一步失败整条流水线失败，普通分支不接触同步写凭据。
- Given：PAT/连接不可用；When：引导；Then：只输出安全错误摘要，不存储或输出密钥、不修改无关资源，可修复后继续。

## 必须保持

- GitHub 唯一写入源；云端同步控制脚本不能从被同步的不可信分支加载执行。
- 密钥不入 Git、命令参数、回执或日志；Codeup 写凭据与 CI 测试隔离。
- 源事件、源引用、目标 SHA 与构建证据一致；现有质量门禁和跨平台检查不被削弱。

## 测试与验证

- 本地临时 Git 仓库连续流程：全分支/标签/历史、重复运行、新分支、冲突拒绝与失败退出。
- 配置/引导合同：命令映射、凭据隔离、触发与失败行为；PowerShell 语法及合成自测。
- 定向测试走仓库 Node runner；运行 test:impact 和完整 bun run check。
- 云端验收：回读创建的两条流水线、触发配置及一次非发布执行；无实际回执不能宣称完成。

## 验收分层

- 工程验证：待执行。
- 技术评审：待独立只读评审。
- 集成：pending；不夹带其他待推提交。
- 人工功能验收：待验收；以真实触发与运行回执为准。
- 发布：未授权。

## 功能验收包

- 入口：待实现的引导脚本；用户现有 PowerShell 已设置云效组织与 PAT。
- 操作：一次运行引导，按实际缺项补充最小权限/仓库连接后重跑，回读安全摘要。
- 产物：两个云效流水线 ID、源/目标引用摘要、构建测试运行结果。
- 限制：同步由 GitHub Actions 定时任务承担（待进入 `main`）；云效公共集群到 GitHub 不稳定；私有 macOS/Windows runner 待确认。

## 交付记录

- 已完成 intake；2026-10-26 修复 `Initialize-YunxiaoPipelines.ps1` 的流水线列表归一化（平面/嵌套/信封响应）、ID 单值校验与创建回执解析，并新增只读 `-Probe` 形状诊断。
- 本地已验证：PowerShell 语法解析通过，`-SelfTest` 无网络通过，`scripts/ci` 两个 Node 测试 7 例通过。
- 云端落地：同步流水线 5346917、构建流水线 5347074 已创建/更新；变量组 `allstar_codeup`（UI 创建，私密 `CODEUP_GIT_TOKEN`）已关联；Codeup 服务连接在 YAML 中须写 UUID `e35k9qkwkyicf6yy`（数字 914722 被校验拒绝）；GitHub push Webhook 已添加（hook 703267182，URL 不入库）。
- 环境适配：公共集群无法拉取 Docker Hub `node:22-bookworm`，改用官方 `build-steps-public-registry.cn-beijing.cr.aliyuncs.com/build-steps/alinux3:latest`，任务内 `dnf install -y nodejs`（20.20.2）；构建任务使用 `LARGE_4C8G`。
- 同步链路调整：云效公共集群到 github.com 多次连接超时（run 3/4），同步改由 GitHub Actions 定时任务执行（`.github/workflows/codeup-sync.yml`：默认分支每 5 分钟 + `main` push + 手动，公网仓库标准 runner 免费）；写凭据存于 Actions secret `CODEUP_GIT_TOKEN`。云效只保留 Codeup 构建流水线 5347074；同步流水线 5346917 与变量组 `allstar_codeup` 保留为人工备用，GitHub webhook 已删除。
- 真实同步验收：本机执行 `node scripts/ci/codeup-sync.mjs` 返回 `{"branches":24,"tags":1,"updated":1}`；GitHub 与 Codeup 的 24 个分支 + `v0.1.2` 标签逐项 SHA 一致（`chenxvhua` = c5700985d）。
- 本地验证：`scripts/ci` 三个测试文件 9 例通过；`bun run check` 通过（修正 `.ps1` 声明头风格分类）；`check-project-indexes` 与 Release Notes 汇编/校验通过。
- 推送与 Actions 验收：提交 2fc5147f5 已推 `origin/dev` 与 `origin/main`；`codeup-sync` 运行 40276666496 成功（19 秒），推送后 GitHub/Codeup 25 个 refs 仍完全一致（`main`/`dev` = 2fc5147f5）。
- 云效构建环境：首次 run 卡在从 GitHub 下载 Bun；改用 npmmirror 同一归档（SHA-256 与仓库钉值一致）并设置 `BUN_CONFIG_REGISTRY`，取消卡住的 run 1/2，重跑结果待完成。
- 未运行/待办：云效构建重跑结果待完成；GitHub 定时任务可能延迟、仓库 60 天无活动会自动停用，需运营确认；Flow 同步流水线仅作人工备用。
- 触发配置：同步源使用官方 `branchesFilter: .*` 覆盖全部分支；构建源限 `^dev$`，避免首次导入 24 个分支各触发一次构建。云效定时触发目前只有 UI 配置说明，未找到公开 YAML 字段。
- Worktree：主工作区串行，不存在并行写入者。
