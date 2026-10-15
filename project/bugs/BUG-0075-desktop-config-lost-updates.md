---
id: BUG-0075
type: bug
status: verifying
priority: P1
owner: desktop-config
source: RESEARCH-0022; TASK-0151 regression
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0151, TASK-0187]
related_issues: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 桌面配置并发读改写丢失更新

## 用户流程与复现

并发关闭通知并修改默认执行模式；两个操作读取相同快照，后写将前者恢复为旧值。用 GeneralSettingsService 正常入口、临时真实配置文件和双读屏障稳定复现，应该两项修改都保留。

## 环境与失败证据

0.1.3 / Windows，Node runner + Desktop config；收敛服务装配及代理纯逻辑导入后，配置/通用设置/代理三文件 1 失败/22 通过，唯一失败为 notificationsEnabled 实际 true、期望 false。早期 Electron 收集失败和冷转译超时已另记 TASK-0151，不作为缺陷复现。

## 根因与修复边界

原子写只保护单次文件替换，不保护读取—更新—写回事务。中心队列串行执行 updater 并迁移所有产品读改写入口；保留未知字段、SSH 独立文件和旧整快照兼容入口。回调失败不得阻塞后续事务，不承诺跨进程 CAS。

## 回归与验证

正常入口并发、失败后恢复、无修改跳过、异步等待及旧数据/SSH 保护见 TASK-0151/TASK-0187。未访问真实用户状态或远端服务。
