<!-- Copyright The Open Forge contributors. -->

# 上游雷达：earendil-works/pi

本仓 `packages/ai`、`packages/agent`、`packages/coding-agent`、`packages/ecosystem-adapter` 与 `runtime-*` 部分文件派生自 [earendil-works/pi](https://github.com/earendil-works/pi)（MIT）。结构已大幅分叉（整体 merge 不可行），同步策略为 **vendor + 上游雷达 + 按修复手工移植**：每次上游发版按 CHANGELOG Fixed/Security 与 GHSA 分诊（采纳 / 不适用 / 已等价），移植时在文件头注明来源 commit。分诊证据与积压清单见 [RESEARCH-0032](../../project/research/RESEARCH-0032-pi-security-advisory-backport-audit.md)。

## 基线

- 引入基线：**v0.55.3**（`9d68043c`，2026-02-28；src 级 diff 最小点，±v0.55.4 无法再精确）。
- 扩展 API 兼容层（`extensions/pi-compat`）对照目标：pi 0.84.1（`936aff00`），与运行时基线 0.55.x 不同，勿混用。
- 上游 npm scope 已从 `@mariozechner/*` 迁到 `@earendil-works/*`（0.73.1 起）；pi-compat 同时支持两套 namespace。

## 最近一次上游评审

- 上游版本：**v1.3.0**（`c268154`，2026-10-15；v0.55.3..HEAD 约 3960 提交）。
- 评审日期：2026-10-18，结论见 RESEARCH-0032。

## 安全通告处置台账

| GHSA | 级别 | 上游修复 | 本仓状态 |
|---|---|---|---|
| GHSA-jfgx-wxx8-mp94 临时扩展路径可预测（本地提权） | high | `ea3465a8` | 受影响 → TASK-0310 |
| GHSA-r95r-rj6r-c39x 凭据文件写入竞态 | low | `135fb545` | 受影响 → TASK-0311 |
| GHSA-mqxh-6gq7-558m 项目本地扩展未经批准加载 | medium | `89a92207` | 很可能受影响 → TASK-0314 |
| GHSA-7v5m-pr3q-6453 HTML 导出 XSS | low | `6cb23f9b` + `b3ed5459` | 受影响 → TASK-0312 |

## 回移分诊摘要（v0.55.3..v1.3.0）

- **已采纳（本批）**：4 条 GHSA + Windows 进程加固（`bash-executor` windowsHide、taskkill 绝对路径 + error 监听；上游 agent 0.75.4 #4699 / 0.84.4 #6596）→ TASK-0313。
- **排队**：依赖供应链加固、流式解析修复、agent 循环健壮性、会话写入原子性、压缩与缓存、计价分档、MCP OAuth 加固（RFC 9207 等）、Provider 认证隔离、CLI 子进程 userData 路径。完整清单与优先级见 RESEARCH-0032。
- **不适用/已等价**：OAuth 打开浏览器加固（`ba6e5298`）——`apps/desktop/src/main/open-external.ts` 已有同款白名单。
- **不回移**：pi-tui/全屏 TUI、pi-durable(Pico)/chord/pi-env、上游 provider 文件拆分、typebox 0.34→1.x、扩展 API 0.84.1 后新增项（走 pi-compat 路线图）。

## 维护规则

- 上游发版后更新「最近一次上游评审」与本表；处置结论只能写 采纳 / 不适用（理由）/ 已等价（锚点）。
- 从上游新版本回移代码时，在文件头注释注明来源 commit（如 `Backport of pi@ea3465a8`）并带本仓修改声明头。
- 许可义务：NOTICE 的 pi 段落保留 MIT 全文；版权行与 Source 需与上游 LICENSE 一致（`Copyright (c) 2025 Mario Zechner`；Source 指向 earendil-works/pi 并注明基线）。
