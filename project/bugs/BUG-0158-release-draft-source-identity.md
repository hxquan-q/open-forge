---
id: BUG-0158
type: bug
status: verifying
priority: P1
owner: desktop-release
requirement: REQ-0002
source: TASK-0405 independent review a5f933ea5c91b0e1a
related_requirement: [REQ-0002]
related_plan: []
related_tasks: [TASK-0405]
related_issues: [ISSUE-0029]
created: 2026-10-29
updated: 2026-10-29
---
<!-- Copyright The Open Forge contributors. -->

# 缺标签时恢复旧目标 draft 可错配发布源码

## 用户流程与实际行为

Given：当前候选为提交 B，远端没有版本标签，但同版本 GitHub draft 的 targetCommitish 保存旧提交 A。When：重试发布，workflow 恢复 draft、上传 B 制品并公开 Release。Then：必须在上传和发布前拒绝无法证明指向 B 的 draft；当前恢复分支只编辑 notes/prerelease，身份守卫只检查缺 tag，可能让 GitHub 沿用 A 创建标签。

## 环境、根因与影响

2026-10-29，基于 f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0 的 TASK-0405 未提交候选。独立只读评审从 workflow 的恢复控制流构造该状态；没有执行真实 GitHub 发布，也不声称已发生误发布。新建 draft 带 --target GITHUB_SHA，既有 draft 没有目标校验；两次允许缺 tag 的检查不能证明其保存目标。影响是制品与标签源码身份不一致，严重度 P1。

## 最小复现与回归合同

1. 在新隔离 Git 仓库创建候选 B 和本地 bare origin，不创建版本标签。
2. GitHub CLI 状态替身返回同版本、isDraft=true、targetCommitish=A 的 draft。
3. 执行真实 workflow 的发布 shell，以替身记录 upload/edit --draft=false 副作用。
4. 旧实现会完成上传与发布；修复必须提前失败且不产生这两种副作用。

正常流程同时覆盖缺 tag 的同候选 draft、正常创建、重试；错误流程覆盖远端异 SHA 标签、draft 查询失败、非 draft、错误 tag、分支名/缩写 SHA 和无效结构。替身只放 GitHub CLI 外部边界，不调用网络或真实发布。

## 修复与验证

TASK-0405 已在最终上传前接入 --github-draft：先验证远端 Git 身份，再校验 draft 元数据，缺 tag 时仅接受候选完整 SHA；不修改目标或现存标签。真实 workflow shell 的旧实现完成上传/公开而使拒绝断言失败，形成有效 red；修复后身份与 workflow 两文件 69/69 通过，覆盖创建、恢复、上传失败重试及 R2 附属发布。Windows 夹具仅替换 gh 进程边界，保留真实 Git。

独立只读复审 a5f933ea5c91b0e1a 确认原 P1 代码缺口已补齐，未发现新增实质缺陷；未代跑测试。第三次完整批次 quality 700 项及完整 check 通过，整体因两个 Desktop 市场超时仍红，后续 fixture 隔离修复与最终完整门禁见 TASK-0412/0414，因此处于 verifying、不提前关闭。真实 Linux、四平台 CI 与发布未执行；既有 v0.1.3 身份阻塞保持。
