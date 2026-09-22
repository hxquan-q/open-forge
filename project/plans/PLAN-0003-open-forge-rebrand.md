---
id: PLAN-0003
type: plan
status: in_progress
priority: P0
requirement: REQ-0003
owner: release/desktop/brand
source: exprot/rebrand-plan.md and exprot/development-paradigm.md
created: 2026-09-22
updated: 2026-09-22
---

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
- **C 品牌外置骨架 / D 用户可见文案 / F 文档与社区**：未开始。E 阶段仅剩遗留项复核（如有）。
