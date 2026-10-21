---
id: REQ-0024
type: requirement
status: ready
priority: P1
owner: desktop
source: user-request（2026-10-20：首次未配置 API Key 时点发送「弹一下就没了」，应提示并引导去配置；2026-10-21 指定按钮文案「去配置模型 key」）
related_requirement: []
related_plan: []
related_tasks: [TASK-0327]
related_issues: []
related_bugs: []
created: 2026-10-20
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 未配置模型 Key 时的发送引导

## 用户问题

首次使用、尚未配置任何模型服务商 API Key 时,点发送会出现"弹了一下之后就没反应"。要求改为明确提示并引导配置。

## 成因(调研,2026-10-20)

净零配置点发送 → 建会话阶段抛 `requires at least one available model` → 错误虽上屏,但同一帧被 `restoreStagedNewSessionSend` 整表清空(**"闪一下"真凶**)→ 用户无任何配置入口(模型选择器在无可用模型时整块不渲染)。

## 用户结果

点发送时前置闸门拦下(不派发、不建会话、零副作用),弹出常驻对话框(标题+「您当前没有配置通用模型的 API Key,请去配置哦」+【取消】+【去配置模型 key】);【去配置模型 key】直达 设置 → 模型 → 预设服务商。有可用模型时发送行为逐字符不变。

## 交付记录

- T01 发送闸门+对话框+跳转(206fad2bd / 66e8c55e0);T02/T03(闪一下机制修复/错误分类加固)按用户 2026-10-21 裁定**缓做**。证据链见 `docs/devflow/missing-api-key-guidance/`(本地过程文档)。
- 本地编号(REQ-0024/TASK-0327)与 origin/dev 撞车(dev 已至 TASK-0338),推送前统一改号。
