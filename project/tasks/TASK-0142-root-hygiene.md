---
id: TASK-0142
type: task
status: done
priority: P2
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
source: user-request
related_requirement: [REQ-0003, REQ-0004]
related_plan: [PLAN-0003, PLAN-0004]
related_tasks: [TASK-0141]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 5a2d5504917df71c567de2486717653ff8b0a0ed
read_paths: [test.sh, vetta-test.sh, banner.txt, open-vetta.code-workspace, .devin, packages/coding-agent/banner.txt, packages/coding-agent/package.json, apps/desktop/scripts/prepare-pack.js, scripts/quality, project]
write_paths: [test.sh, vetta-test.sh, banner.txt, open-vetta.code-workspace, open-forge.code-workspace, .devin, scripts/quality/check-modified-file-notices.mjs, scripts/quality/quality-gates.test.mjs, project/tasks, .github/release-notes/v0.1.3.md]
exclusive_paths: [open-vetta.code-workspace, open-forge.code-workspace]
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行）
created: 2026-10-01
updated: 2026-10-01
---
<!-- Copyright The Open Forge contributors. -->

# 根目录历史入口与冗余文件清理

## 范围与证据

Open-Forge-only。用户已批准上一轮保守清理清单；串行，不触碰已有 desktop/vendor 改动。

- 删除空 .devin/skills 与 .devin，仅在两者为空且不是链接时操作。
- 退役 test.sh：旧入口会移动真实用户凭据后执行 npm test；不运行此脚本、不读取或操作凭据，以现有 Bun 测试入口替代。
- 退役 vetta-test.sh：实际调用的 packages/coding-agent/src/cli.ts 已不存在；现有 CLI 在 apps/cli-host，不建立旧名适配。
- 删除根 banner.txt：与 packages/coding-agent/banner.txt 哈希相同；prepare-pack.js 从 packages/coding-agent 取资产，保留包内文件。
- open-vetta.code-workspace 改为 open-forge.code-workspace，文件夹显示名改为 open-forge，保留 path 与 settings。
- 工作区文件采用 VS Code 的 JSONC 注释声明，版权守卫增加对应格式识别与测试，不放宽基线。
- 不做：删除依赖/缓存、Docker 配置、许可证、归档、其他工具配置；大文档治理另行处理。

## Given / When / Then

- Given 根目录清单，When 清理完成，Then 废弃脚本与重复根 banner 消失，包内打包资产和当前 Bun 入口保留。
- Given 新工作区文件，When 解析其 JSONC 配置，Then 仍打开同一仓库，只改变文件名和显示名。
- Given .code-workspace 文件，When 版权守卫分类，Then 识别为支持双斜线注释的格式，而非跳过。

## 验证

定向格式回归；解析与路径/资产保留核对；删除路径 test:changed 与现有质量套件；完整 check。没有新业务逻辑，不为已废弃脚本新增执行测试，更不运行会触碰真实状态的旧脚本。实际结果完成后补充。

## 实测记录

- 删除/移动前核实全部目标绝对路径、非链接、无已有修改；只删除两层空目录，不递归清理其他内容。
- 新工作区 JSONC 解析后与旧配置比较，仅 folders[0].name 改变，path 与 settings 保持不变；包内 banner 与清理前根 banner 字节一致。
- .code-workspace 格式回归先失败（返回未分类），加入注释格式后定向 94 例通过；test:impact 运行质量套件 35 文件 / 464 例通过。
- 删除/更名路径运行 test:changed，未触达可测试包；根文件由 33→30、目录由 15→14。
- 不运行旧脚本、不读取或操作真实凭据；不运行 UI、发布或全量构建。完整 `bun run check` 退出码 0；既有 CRLF 与版权基线收缩提示保留，没有放宽基线。

- 内部清理按用户已批准的文件清单、配置等价核对与检查结果验收；不运行 VS Code/产品实机，也不要求用户逐文件重新确认。未推送。
