---
id: BUG-0076
type: bug
status: verifying
priority: P1
owner: desktop-build
source: RESEARCH-0022; TASK-0192 regression
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0192]
related_issues: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 开发主进程缓存遗漏部分 workspace 输出

## 用户流程与复现

主进程已构建，修改会被打包的 runtime-storage 产物后重启开发构建；预期缓存失效，实际输入清单缺该目录，可能继续运行旧 bundle。

## 环境与失败证据

0.1.3 / Windows，Node runner 的 build-dev-processes.test.ts；先保持旧输入提取测试接缝，既有输入断言通过；新增临时依赖图后，断言缺少 runtime-storage/dist 失败，1 失败/1 通过。

## 根因与修复边界

手工清单没有覆盖实际可达 workspace。遍历 Desktop 的 workspace 依赖，遇到 dev external 停止；Vite 和输入收集共用 external 定义，保留嵌套 SDK 和 toolkit 源码。不运行 dev/模型下载，不读取真实 .env。

## 回归与验证

使用实际 hashPaths 验证内容变化失效、external/无关包输出不影响缓存；原有 runtime-desktop/runtime-node 合同改为行为断言并保留。结果见 TASK-0192/TASK-0187。

编号说明：本批首个隔离提交曾使用 BUG-0073，尚未推送；另一执行流同时登记同号的队列缺陷。发布前仅将本批记录更正为 BUG-0076，历史提交保留映射，详见 WAIVER-0003。
