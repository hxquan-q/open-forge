---
id: BUG-0074
type: bug
status: verifying
priority: P1
owner: plugin-git
source: RESEARCH-0022; TASK-0193 regression
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0193]
related_issues: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# Git 提交详情错误解析特殊路径和重命名

## 用户流程与复现

查看包含 file[1].txt 与 file1.txt 的提交，点击前者；旧 diff 同时包含后者。查看重命名文件时只传新路径，旧实现显示新增文件而非 rename。含 tab/newline 的 name-status 文件名也被拆开。

## 环境与失败证据

Windows / Open Forge 0.1.3；隔离 Git 临时仓库，空配置/模板/钩子，不访问真实用户仓库。Node runner 的 parseLog.test.ts / log.test.ts：7 失败/1 通过，包括真实 Git 的邻居误匹配、rename 缺失与 NUL/截断合同。首次测试文本转义书写错误导致收集失败，修正后才获得上述有效红测。

## 根因与修复

name-status 使用按行/tab 解析，diff 未启用 literal pathspec 且只传新路径。改为 NUL 数据，截断/畸形输出显式失败；diff 保留旧 path 参数并可选传原路径，详情消费者接线一致。不引入破坏性 Git 动作或权限扩张。

## 回归与验证

覆盖真实 Git 命令、NUL 特殊字符、空提交和失败，最终记录见 TASK-0193/TASK-0187。
