---
id: PLAN-0003
type: plan
status: in_progress
priority: P0
requirement: REQ-0003
owner: release/desktop/brand
source: exprot/rebrand-plan.md and exprot/development-paradigm.md
created: 2026-09-22
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# Open Forge 品牌化施工

## 顺序

```text
A. 决策冻结
→ B. 构建与更新身份
→ C. 品牌外置骨架
→ D. 用户可见文案与生态身份
→ E. 数据目录与远端足迹
→ F. 文档与社区
```

## 范式

采用“薄壳 fork + 品牌外置 + 增量产品层”：尽量不修改上游高频文件，新功能通过新增包、扩展点和独立 Renderer domain 接入。

在域名、更新基建和 Marketplace 坐标未冻结前，不进入发布身份施工。

## 进度

- **A 决策冻结**：完成（TASK-0009 / ISSUE-0001，15 项最终值已定）。
- **B 构建与更新身份**：完成——更新链硬校验（generic fail-closed、开源默认 `hxquan-q/open-forge`）、Marketplace 常量、打包身份（`prepare-pack`、electron-builder、`installer.iss`、Windows launcher/产物名、Linux 元数据）、`openforge://` scheme（桌面注册 + OAuth + 配对 + Android 解析）均已切换；E 阶段的数据目录（`~/.openforge` + `~/.vetta` 一次性 rename 迁移 + dev 变体）与远端 helper 足迹（`openforge-ssh-helper` + `~/.cache/openforge/helper/` + 旧目录清理）提前并入本阶段完成。
- **C 品牌外置骨架**：实现完成，正在验证；`TASK-0043` 已建立 Desktop 品牌单一事实源与受控替换层，定向测试通过，完整 typecheck 受当前工作区的其他 runtime/project 改动阻塞。
- **D 用户可见文案与生态身份**：`TASK-0044` 正在串行落地原生 About 与 credits 品牌；`TASK-0076` 已完成 Desktop 前端品牌收尾（窗口标题、托盘、导出 HTML/文件名、错误消息、OAuth client_name、marketplace UA、硬编码 fallback）并顺带修复 `BUG-0008`（appshot helper 解析名与产物名不一致）；`TASK-0045` 已完成（2026-09-26：CLI 命令 `openforge` 直接切换、IM/MCP/插件外显身份、`openforge-serv` 代号同步）；`TASK-0046` 受 `@openforge` npm 组织注册确认阻塞，不会执行 npm 发布。
- **E 数据目录与远端足迹**：主要迁移已随 B 完成；仅保留遗留足迹复核，若审计发现具体缺口再登记独立 Task。
- **F 文档与社区**：部分开展——产品定义、仓库首页和开发指南已有本地更新；剩余仓库文档由 `TASK-0047` 跟踪，公开文档站由 `TASK-0048` 跟踪，社区目标确认由 coordination-only 的 `TASK-0049` 跟踪。外部域名或社区目标未确认前保留当前有效链接，不编造新地址。

## Task 分解与依赖

```text
TASK-0043（C 品牌外置层，verifying）
  ├─ TASK-0044（D Desktop 可见文案，blocked）
  ├─ TASK-0076（D 前端品牌收尾 + BUG-0008 修复，done）
  └─ TASK-0045（D 生态身份，done）
       ├─ TASK-0046（D 已发布 npm scope，blocked；待组织注册确认）
       ├─ TASK-0049（F 社区目标确认，blocked / coordination-only）
       ├─ TASK-0047（F 仓库文档，blocked）
       └─ TASK-0048（F 文档站，blocked）
```

`TASK-0047`、`TASK-0048` 还依赖 `TASK-0044`、`TASK-0045`、`TASK-0049`；以上 Task 的详细验收、路径边界和验证方式见各自条目。
