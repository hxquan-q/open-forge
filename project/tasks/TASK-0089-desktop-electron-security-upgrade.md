---
id: TASK-0089
type: task
status: done
priority: P1
owner: apps/desktop
source: BUG-0012
execution: serial
branch: forge/dev
worktree: unassigned
base_commit: forge/dev
read_paths: [apps/desktop/package.json, packages/remote-desktop/package.json, apps/desktop/src]
write_paths: [apps/desktop/package.json, packages/remote-desktop/package.json]
exclusive_paths: [apps/desktop/package.json, packages/remote-desktop/package.json]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0012]
---
<!-- Copyright The Open Forge contributors. -->

# 桌面端 Electron 核心运行时版本与安全补丁升级（消除 66 项安全告警）

## 目标

升级 `apps/desktop` 与 `packages/remote-desktop` 中使用的 `electron` 版本至官方安全维护版本（要求至少 `>= 39.8.10`，推荐对齐当前受支持的 LTS/稳定分支），彻底消除 Dependabot 报出的 66 项（涵盖 25 个独立 CVE/GHSA，含 7 项 High、12 项 Medium、6 项 Low）安全漏洞。

## 交付记录

- 将 `apps/desktop` 与 `packages/remote-desktop` 的 `electron` 固定为 `39.8.10`（满足 GHSA 要求的最低安全基线）。
- 曾尝试 `^44.4.0`：Clipboard / PrintToPDF 等类型合同破坏面过大，回退到 39.8.10；后续若要对齐仍在维护的 42+/44 线需单独任务。
- 适配 Electron 39 类型：`app.dock` 可选，以及 Vitest 4 Mock 在若干 Desktop 测试中的强制断言。
- 验证：`bun --cwd apps/desktop typecheck` 通过；`bun --cwd packages/remote-desktop test` 通过；`bun run check:quick` 针对变更文件通过。
- 未跑：全量 `bun run build:desktop`（耗时长；类型与包测试已覆盖依赖声明）。

## 背景事实

- 当前 `apps/desktop/package.json` 与 `packages/remote-desktop/package.json` 中配置的为 `"electron": "^34.2.0"`。
- Dependabot 扫描检出 66 项安全告警（两包各 33 项），集中在：
  - 沙箱 iframe 弹窗突破（CVE-2026-70608，要求 `>= 39.8.10`）；
  - 自定义协议跨源读取（CVE-2026-70604，要求 `>= 39.8.10`）；
  - 上下文隔离绑定劫持（CVE-2026-70601，要求 `>= 39.8.9`）；
  - 绘制回调、权限回调、PowerMonitor、下载确认框等组件的释放后重用 (UAF) 漏洞；
  - 注册表路径注入与 Windows 协议处理缺陷等。
- Electron 大版本升级会连带更新内置 Chromium 与 Node.js 运行时，可能对主进程/渲染进程 API、Webview 行为及打包脚本产生影响，因此需要独立作为桌面端重点任务实施与验证。

## 范围

### 并发评估

- **并发结论**：**建议串行执行（serial）**
- **执行方式**：在独立工作区分支中专门实施与回归验证，避免与频繁变动 desktop 业务代码的 Task 冲突。
- **可并行 Task**：`TASK-0087`（docs-site 完全独立）
- **前置依赖**：无
- **冲突文件/独占路径**：`apps/desktop/package.json`, `packages/remote-desktop/package.json`
- **Branch**：`forge/dev`
- **Worktree**：主工作区或独立 Worktree
- **集成负责人**：本 Task 执行者

## 行为规范

- Given：Open Forge Desktop 依赖 Electron 运行主进程、预加载脚本、Webview 代理与浏览器沙箱。
- When：升级 Electron 依赖至修补版本，并适配可能变更的废弃 API 或构建选项。
- Then：
  1. Desktop 启动、主窗口加载与 IPC 通信保持稳定无报错；
  2. Webview 代理沙箱隔离及元素拾取能力正常；
  3. 打包脚本与二进制测试正常通过；
  4. GitHub Dependabot 中 66 项 Electron 安全告警全部关闭。

## 验收标准与验证命令

1. **依赖升级**：
   - `apps/desktop/package.json` 与 `packages/remote-desktop/package.json` 中的 `electron` 版本满足安全基线要求（`>= 39.8.10`）。
2. **构建与类型验证**：
   - 运行 `bun --cwd apps/desktop typecheck` 零错误通过。
   - 运行 `bun --cwd packages/remote-desktop test` 单元测试通过。
   - 运行 `bun run build:desktop` 桌面端预打包构建通过。
3. **安全与质量门禁**：
   - 运行 `bun run check:quick -- apps/desktop/package.json packages/remote-desktop/package.json`。
