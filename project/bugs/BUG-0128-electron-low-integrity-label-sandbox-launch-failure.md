---
id: BUG-0128
type: bug
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: user-report
related_requirement: []
related_plan: []
related_tasks: [TASK-0301, TASK-0302, TASK-0303]
related_issues: []
created: 2026-10-17
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# 工作区被标为 Low 完整性级别后，仓库内 Electron 的 Chromium 子进程创建失败（GPU/renderer error 18）

## 用户流程

- Given：Windows 开发机上检出 Open Forge，仓库树（含 `node_modules`）带有 Low 强制完整性标签；渲染器构建已完成。
- When：在 `apps/desktop` 运行 `bun run dev`，使用默认启动参数。
- Then：桌面端应正常启动并渲染页面，Chromium 子进程沙箱保持启用。

## 实际行为

- Electron 启动后 GPU 进程创建失败：`GPU process launch failed: error_code=18`，随后 `FATAL: GPU process isn't usable. Goodbye.`，进程退出 `-2147483645`（`0x80000003`，bun 报为 code 3）。
- 同一次失败中 renderer 也以 `launch-failed`、`exitCode: 18` 结束，页面空白。
- 追加 `--no-sandbox` 可启动；追加 `--disable-gpu-sandbox` 仍失败（renderer 仍走沙箱）。

## 期望行为

- 默认 `bun run dev` 不因文件完整性标签失败；启动器应在不关闭 Chromium 沙箱的前提下恢复正常启动。
- 只有真实的 GPU/驱动故障才使用 `--no-sandbox` 作为兜底，而不是日常工作路径。

## 环境与失败证据

- 应用版本/提交：Open Forge 0.1.3 开发树，HEAD `e0c3040c5`（TASK-0301 自动回退已提交）。
- 运行环境：Windows 11 Pro 10.0.26200；Electron 39.8.10；Chromium 142.0.7444.265；Node 22.22.1；bun。
- 文件标签：仓库根显式 `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)`，`apps/desktop/node_modules/electron/dist/electron.exe` 显示 `Mandatory Label\Low Mandatory Level:(I)(NW)`；整个仓库树继承 Low。
- 时间线（NTFS ChangeTime / 应用日志）：
  - 02:44 启动成功（argv 无 `--no-sandbox`，`did-finish-load` 与首帧均正常）。
  - 03:18:35–03:19:54 仓库树 ACL/元数据整体变化（ChangeTime；LastWriteTime 未变），所有 Electron dist 文件为 03:19:15。
  - 19:11 启动成功，但 argv 已含 `--no-sandbox`。
  - 19:13 使用 `--disable-gpu-sandbox` 启动，renderer `launch-failed exitCode 18`。
- A/B 对照（同一 Electron 39.8.10，最小 Electron 探针）：
  - 未标 Low 的干净副本：`start`/`ready`/`loadURL ok`/`process exit 0`。
  - 标 Low 的副本：GPU `error_code=18`、FATAL、`EXIT:-2147483645`。
  - 标 Low 后仅把 `electron.exe` 改为 Medium：GPU 不再报 18，但 renderer 崩溃（`loadURL failed ERR_FAILED (-2)`）——说明 DLL 也受同一限制。
  - 把整个 dist 改为 Medium：`loadURL ok`、exit 0。
  - 由 **Medium 完整性进程**（计划任务 `RunLevel Limited`，whoami 显示 `S-1-16-8192`）执行 `icacls <dist> /setintegritylevel Medium /T /C /Q`：78 个文件成功，随后同一 Medium 进程启动 Electron 探针（无 `--no-sandbox`）→ `ready`/`loadURL ok`/exit 0。
  - 同一 Medium 进程执行 `icacls <dist> /save <file> /T /C /Q`：保存文件（UTF-16LE）中包含 75 条 `(ML;;NW;;;LW)`，可作为低权限下精确识别 Low 标签的探针。
- 归属排查（2026-10-18 修订定案，完整证据见 [RESEARCH-0028](../research/RESEARCH-0028-windows-agent-mic-low-label-attribution.md)）：
  - 打标者定案为 DeepSeek Harness（DSH）workspace-write 沙箱的物化，工具级高置信：仓库根 ACL 呈现其 README 描述的三件套——能力 SID 允许 ACE（`S-1-4-243177478-769424498:(OI)(CI)(W,D,DC)`）、上层删除权拒绝（`Everyone:(CI)(DENY)(DC)`）、继承式 Low 标签；`~/.dsh` 取证显示 open-forge 自 2026-10-01 注册为 DSH 工作区，`session-7f930410` transcript 最后写入 `03:19:55.229`，与标签窗口结束（03:19:54）秒级吻合，另一会话 `0267d2ae` 存活 03:01–04:10 全程覆盖；其「每工作区每机一次」物化与现场一次性打标一致。同症状报告见 DSH Discussions #8048（`error_code=18` / `0x80000003` / `(OI)(CI)(NW)` Low）。
  - Codex 排除（撤销本节早前推断）：`openai/codex` 源码 0 处 `setintegritylevel`、本机 codex.exe 0.163.0 无相关字符串、`cap_sid` 为合成 SID 方案、官方博客明确 MIC 方案设计期被否决；根 ACL 上 `CodexSandboxUsers:(I)(M,DC)` 为继承授权，与标签无关。gemini-cli 亦排除（根 DACL 无 Low SID 授权、`~/.gemini/tmp` 无标签、无 `.geminiignore`，且事发当天 `~/.gemini` 零文件活动；其每命令重打模式与现场一次性打标不符）。应用自身 runtime sandbox 不打完整性标签且事发时未运行。
  - 会话级触发点未钉死：具体哪个 DSH 会话、何种模式触发物化在 zstd transcript 内未解压；不影响工具级定案与修复。
  - 与 git 无关：02:53:51 的合并 `1ebf8ea6e` 只改 allstar-coding locales 与 eform-craft skills；无 post-merge hook；03:18 无提交；ACL 是文件系统元数据，不进入 git。

## 最小复现

1. 在 Windows 上准备一份 Electron dist 副本，对整棵树执行 `icacls <dist> /setintegritylevel '(OI)(CI)Low' /T /C /Q`（或直接使用被 Codex 沙箱标记过的工作区）。
2. 用该副本启动一个最小 Electron 应用，参数不加 `--no-sandbox`。
3. 观察 stderr 的 `GPU process launch failed: error_code=18` / `GPU process isn't usable. Goodbye.`，renderer 以 `launch-failed exitCode 18` 结束。

## 影响

- 本机所有默认 `bun run dev` 启动被阻断；只能用 `--no-sandbox`（削弱沙箱）或 `VETTA_DESKTOP_DISABLE_GPU=1`（软件合成）绕行。
- 影响范围是开发工作区：打包安装的应用不在仓库树内，不受该标签影响；任何被 agent 沙箱以 Low 标签供给工作区的 Windows 检出都会复现。
- 全树 Low 并非只影响 Chromium：按微软 MIC 取低值规则，树内任何 Low 标签 exe（如 node_modules 内的 esbuild.exe）启动即为 Low 进程，向 `%APPDATA%`/`%LOCALAPPDATA%`/Temp 等树外 Medium 目标写入被拒。因此 2026-10-18 由 TASK-0303 执行仓库根整体重置（root-only `(OI)(CI)Medium`，NTFS 继承自动翻转全树）。
- 不是 Open Forge 业务代码缺陷，但启动器可以在自己可控的范围内自愈；不修复则每次开发都要人工改 ACL 或关沙箱。

## 根因证据

置信度高（直接 A/B、完整性级别对照、时间线与 ACL 证据）：

1. Chromium 在 Windows 上为沙箱子进程设置 `PROCESS_CREATION_MITIGATION_POLICY_IMAGE_LOAD_NO_LOW_LABEL_ALWAYS_ON`（不加载带 Low 强制标签的映像）。`electron.exe` 及其同目录 DLL 被标为 Low 后，`CreateProcess` 返回 `SBOX_ERROR_CREATE_PROCESS = 18`。
2. 该失败同时打掉 GPU 与 renderer；GPU 侧表现为 `GPU process launch failed: error_code=18` → `GPU process isn't usable` → `0x80000003`。
3. `--no-sandbox` 不启用该子进程缓解策略，因此能启动；`--disable-gpu-sandbox` 仍保留 renderer 沙箱，所以 renderer 继续报 18。
4. 把 Electron dist 恢复为 Medium 后，沙箱与 GPU/renderer 都恢复正常（Medium 进程实测）。
5. Low 标签是 03:18–03:19 通过文件系统 ACL 落下的，晚于 02:44 的成功启动；不是代码提交或依赖升级导致。

## 回归测试

- `apps/desktop/scripts/run-dev-electron.test.mjs`：`icacls /save` 输出解析（Low/Medium/无标签/UTF-16 BOM/异常输入）、修复决策（仅 Windows + Low）、修复命令参数（`/setintegritylevel Medium /T /C /Q`）、探针失败不阻断、非 Windows 跳过。
- 行为验证：对仓库内 Electron dist 执行启动器的自愈后，用同一 Electron 启动最小探针且不加 `--no-sandbox`，应得到 `loadURL ok` / exit 0，stderr 无 `error_code=18`。
- 用户流程：`bun run dev` 默认参数启动，GPU/renderer 存活、页面 DOM 正常；不再需要 `--no-sandbox` 或 `VETTA_DESKTOP_DISABLE_GPU=1`。

## 修复与验证

- 修复：TASK-0302（`d8e1b7e45`）——dev 启动器在 spawn 前用 `icacls /save /T` 探针检查 Electron dist 是否含 Low 标签；仅当存在 Low 时执行 `icacls <dist> /setintegritylevel Medium /T /C /Q`，保留 Chromium 沙箱。TASK-0301 的 `--no-sandbox` 自动回退保留为真实 GPU 故障的兜底。
- 归因修订与环境根治：TASK-0303——依据 RESEARCH-0028 把归因定案为 DSH（撤销 Codex 推断），并一次性把仓库根标签恢复为 Medium（全树继承翻转），消除树内 exe 以 Low 进程运行的次生风险；dev 启动器自愈继续作为复发时的边界。
- 测试：定向 `run-dev-electron.test.mjs` 18/18 通过；仓库 Electron 78 个文件 Low→Medium 后，沙箱探针（无 `--no-sandbox`）`loadURL ok` / exit 0；重新标 Low 后 `bun run dev` 出现自愈日志、`ready-to-show` / `did-finish-load` 正常且日志无 `error_code=18`。
- 检查：`bun run check:quick` 与 `bun run check`（lint、types、guards、mobile-lint）均 exit 0；`node scripts/release/release-notes.mjs --check` 通过。
- 未运行及原因：用户人工验收待做；`test:impact` 因 `.mjs` 不在桌面 vitest include，整包回退 suite 含 BUG-0107 存量红且未跑完，已停止并用定向文件替代；`verify:ui:*` 未获授权且非必需。
