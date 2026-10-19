---
id: BUG-0120
type: bug
status: verifying
priority: P2
owner: apps/desktop
requirement:
plan:
source: RESEARCH-0027; 全量保留日志 195 条 ENOENT 与源码接线核对
related_requirement: []
related_plan: []
related_tasks: [TASK-0277]
related_issues: []
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 远程项目的 Skill 展示读取把远端绝对路径当本机路径

## 用户流程

- Given：用户在 SSH 远程项目（`ssh://<hostId>/...`）下打开能力/技能列表。
- When：宿主构建技能展示索引，解析每个技能声明的展示图标。
- Then：期望远端技能被正常列出且展示读取不报错；实际每次列表都产生一批 ENOENT 警告，展示降级。

## 实际行为

`SkillService.list` 从资源运行时拿到 skill 后，把 `filePath`/`baseDir` 直接交给 `loadSkillPackagePresentationIcon`；该函数使用本机 `readFileSync`/`statSync`。远程项目的资源运行时被 `presentRemotePathsAsSeenByTools` 包装，`getSkills()` 已把这两个字段从 `ssh://host/path` 改写成远端绝对路径 `/home/ubuntu/...`，因此在 Windows 本机落到 `C:\home\ubuntu\...` 读取失败。

## 期望行为

技能列表消费方不应把「给模型/工具看的远端绝对路径」当成宿主本机路径去读文件；远端技能的展示图标要么走远端资源访问端口解析，要么明确跳过且不产生告警噪音。

## 环境与失败证据

- Windows，源码 HEAD `a4ccf2938`；开发实例日志 `dev/main/2026-10-16.log`。
- 保留日志共 195 次，跨 2026-10-08 ~ 2026-10-16；最近锚点 `dev/main/2026-10-16.log:2250`。
- 典型栈：`readFileSync → loadSkillPackagePresentationIcon → SkillService.list`，报文如 `[skills] skill pr presentation ignored Error: ENOENT: no such file or directory, open 'C:\home\ubuntu\.agents\skills\pr\SKILL.md'`（`dev/main/2026-10-16.log:2240` 起连片出现）。
- 代码锚点：`apps/desktop/src/main/agent-runtime/resource-runtime.ts:102`、`:118-128`；`apps/desktop/src/main/skills/skill-service.ts:193-199`；`apps/desktop/src/main/abilities/presentation/skill-package-presentation.ts:34-36`。

## 最小复现

1. 建一个 `ssh://` 项目（可用回环 SSH 夹具，见 `apps/desktop/src/main/agent-runtime/resource-runtime.remote.test.ts`）。
2. 在该项目下放一个带 `metadata.vetta.presentation.icon` 的技能。
3. 调用技能列表入口，观察 `loadSkillPackagePresentationIcon` 对本机相对/绝对路径读取失败。

## 影响与根因证据

P2：技能展示图标缺失、每次列表产生大量告警噪音；不影响技能执行。根因是「工具面向路径包装」被宿主展示消费者复用——包装的立意（`resource-runtime.ts:105-112`）明确是「交给模型之前必须换成远端绝对路径」，而技能列表是宿主 UI 消费方。置信度：高（源码接线 + 日志报文逐字吻合）。

## 回归测试

从技能列表公开入口加载远端项目技能，断言不再产生展示读取警告；同时断言 `getSkills()` 对模型可见的远端绝对路径契约未被破坏（`resource-runtime.remote.test.ts` 既有断言保持绿）。

## 修复与验证

- 修复：待实施（见 TASK-0277）。
- 验证：待回写。
- 未运行及原因：待回写。
