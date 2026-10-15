---
id: BUG-0012
type: bug
status: done
priority: P0
owner: workspace
source: GitHub Dependabot Alerts (hxquan-q/open-forge)
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: [TASK-0087, TASK-0088, TASK-0089, TASK-0090]
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Dependabot 检出 92 项第三方依赖安全漏洞（包含 Next.js RCE 与 Electron 隔离绕过）

## 触发场景

- Given：项目在本地开发、构建部署或桌面运行时中依赖第三方 npm 包。
- When：
  1. `apps/docs-site` 部署在服务器（尤其是 Windows 宿主）或处理用户传入的 AVIF 图像；
  2. `apps/desktop` / `packages/remote-desktop` 运行在受影响的旧版 Electron（`^34.2.0`）环境中，遭遇恶意 Webview、特制协议请求或窗口导航；
  3. 全局工作区运行测试套件或执行 ZIP 解压操作。
- Then：依赖库应当具备最新的安全补丁，防止未经身份验证的远程代码执行、沙箱逃逸、内存 UAF 崩溃及路径遍历覆盖。

## 实际行为

GitHub Dependabot 针对仓库 `hxquan-q/open-forge` 扫描检出 **92 项未修复（open）的安全告警**，归并后对应 **30 项独立的 CVE/GHSA 安全通告**，涉及 6 个核心依赖包：

1. **Critical（严重，2 项）**：
   - `next`：GHSA-p293-qw3h-jr36 / CVE-2026-75604（Windows 宿主下未经身份验证的远程代码执行 RCE）
   - `next`：GHSA-2xp9-vwfh-vxw4（Image Optimization API 处理 AVIF 时的未授权 RCE）
2. **High（高危，19 项告警 / 12 项独立通告）**：
   - `electron`：沙箱 iframe 弹窗限制绕过（GHSA-9f4c-93c8-jc8g）、跨源读取（GHSA-v3j7-r9gq-3gjw）、上下文隔离绕过（GHSA-h7rp-cf8h-j98x）、绘制与权限回调 UAF（GHSA-532v-xpq5-8h95 等）
   - `adm-zip`：4GB 内存分配与 DoS（GHSA-7q85-xj36-vmfc, GHSA-xcpc-8h2w-3j85）
   - `postcss`：`sourceMappingURL` 路径遍历与任意文件读取（GHSA-r28c-9q8g-f849, GHSA-6g55-p6wh-862q）
   - `svgo`：脚本过滤与控制字符绕过（GHSA-w27v-7q3p-w38r）
3. **Medium（中危，59 项告警 / 10 项独立通告）**：
   - `vitest`：GHSA-952p-64cx-cqcp / CVE-2026-39884（全局 15 个子包由于引入 `^3.2.4` 重复报警）
   - `adm-zip`：软链接目录遍历覆盖（GHSA-vwc7-r8mq-g2x9）
   - `electron`：协议响应头注入、下载保存对话框 UAF、ASAR 完整性绕过等
4. **Low（低危，12 项告警 / 6 项独立通告）**：
   - `electron`：剪贴板图像异常崩溃、离屏纹理 UAF 等

## 期望行为

所有已知的第三方高危及严重级别安全漏洞均得到修复：
- 文档站点及核心依赖升级到官方已修复安全版本；
- 桌面端 Electron 升级到包含安全补丁的稳定维护分支；
- monorepo 统一升级测试基础设施版本；
- 针对尚无官方补丁的包（如 `adm-zip` 软链接问题），在应用代码层增加路径安全防御。

## 最小复现

通过 GitHub CLI 查询仓库 Dependabot 状态：
```bash
gh api --paginate /repos/hxquan-q/open-forge/dependabot/alerts
```
返回 92 条状态为 `open` 的安全告警记录。

## 影响

- **远程攻击风险 (RCE)**：`apps/docs-site` 若以服务端渲染或公网部署运行，受 Next.js CVE-2026-75604 影响存在直接被黑客获取宿主权限的风险。
- **桌面沙箱与数据泄露**：Electron `34.2.0` 缺少过去数个季度的安全修复，上下文隔离和沙箱可能被通过特制脚本或协议突破，威胁客户端用户数据与本地凭证安全。
- **开发与构建安全**：测试框架及构建插件中的文件读取与代码注入漏洞可能在执行不受信代码时造成提权。

## 根因证据

1. `apps/docs-site/package.json`：锁定使用 `next@16.3.0`（要求 `>= 16.3.3`）与 `postcss@8.5.6`（要求 `>= 8.5.23`）。
2. `apps/desktop/package.json` 及 `packages/remote-desktop/package.json`：锁定使用 `electron@^34.2.0`（安全补丁版本要求 `>= 39.8.10` 或 `40.8.1` / `41.0.0`）。
3. 根目录 `package.json`：`vitest@^3.2.4`，且 14 个 `packages/*` 子包分别直接或间接依赖此范围（安全版本要求 `>= 4.1.11`）。
4. `apps/desktop/package.json`：`adm-zip@^0.5.16`（修复版本要求 `>= 0.6.1`）。

## 修复策略与任务拆解

将 92 项告警按影响模块与升级复杂度解耦为 4 个独立 Task，支持并行实施：

- **TASK-0087**：`apps/docs-site` 依赖升级（Next.js & PostCSS），消除全部 2 个 Critical 与 2 个 High 漏洞。
- **TASK-0088**：全局工作区 `vitest` 统一升级至 `>= 4.1.11`，消除 15 个 Medium 漏洞。
- **TASK-0089**（已完成）：桌面端 `electron` 升级至 `39.8.10`，消除 Dependabot 所列 Electron 安全通告的最低补丁基线。
- **TASK-0090**（已完成）：`adm-zip` / `svgo` 依赖更新，并在插件与 Skill 解压路径增加 Zip Slip / 符号链接防御。

## 验证证据

- 环境：Windows；GitHub CLI `2.101.0`，账号 `hxquan-q`；核对提交 `6df2fd757a0a9f387d1f438dbfcecf6a9eedba87`（`main`）。
- 命令与结果：

```text
gh api --paginate "/repos/hxquan-q/open-forge/dependabot/alerts?state=open&per_page=100" --jq 'length'      → 0
gh api --paginate "/repos/hxquan-q/open-forge/dependabot/alerts?state=fixed&per_page=100" --jq 'length'     → 92
gh api --paginate "/repos/hxquan-q/open-forge/dependabot/alerts?state=dismissed&per_page=100" --jq 'length' → 0
gh api --paginate "/repos/hxquan-q/open-forge/dependabot/alerts?per_page=100" --jq 'length'                 → 92
```

- 修复面核对（当前 `main`）：`apps/docs-site/package.json` 为 `next@^16.3.3` / `postcss@^8.5.23`（TASK-0087）；根 `package.json` 为 `vitest@^4.1.11`（TASK-0088）；`apps/desktop/package.json` 为 `electron@39.8.10` / `adm-zip@^0.6.1`（TASK-0089 / TASK-0090）；四个修复 Task 的 `status` 均为 `done`。
- 结论：原 92 项告警全部转为 `fixed`，无 `open`、无人工 dismiss；关闭本 Bug。

## 进度

- TASK-0087–TASK-0090 已全部落地并通过定向验证；以 `gh api` 复核 `open` 告警为 0，证据见上。本 Bug 关闭，无剩余跟踪项。
