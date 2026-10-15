---
id: TASK-0146
type: task
status: done
priority: P1
owner: packages/plugins/plugin-vite
source: TASK-0145 validation
related_requirement: []
related_plan: []
related_tasks: [TASK-0145]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 68b62c74cbdc921552a883cf1f32ea55dd58dafc
read_paths: [packages/plugins/plugin-vite, packages/plugins/docs/module-federation.md]
write_paths: [packages/plugins/plugin-vite/src/dev-server.ts, packages/plugins/plugin-vite/test/dev-server.test.ts, packages/plugins/plugin-vite/test/dev-server-watcher.test.ts, project/tasks, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/plugins/plugin-vite/src/dev-server.ts]
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行）
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 等待首次静态导入收敛后宣告开发服务器就绪

## 范围与根因证据

Upstreamable。补齐 React 后，原先未能抵达的正常路径暴露稳定清理超时：dev-server 测试主体通过，但关闭钩子超过原有 10 秒。重复单文件执行可复现，locale 更新和语法错误拒绝用例通过。

定向 vite:deps 日志显示第一用例在静态导入扫描尚未结束时开始关闭；Vite 的 environment.close 同时取消扫描并等待 pending requests。使用现有 waitForRequestsIdle() 在模块图验证后等待首次导入完成，3 个用例转绿，无需延长超时或 sleep。

## 方案与不变量

- 最小等待屏障优于重写 Vite 关闭逻辑或修改第三方代码；不新增状态机、定时重试或错误吞没。
- ready 字段/协议、共享配置、watcher 更新和错误拒绝保持不变，只让既有就绪语义覆盖初始静态导入。
- 正常用例增加 ready→HTTP 资源读取→显式关闭→入口不可访问的连续流程，不删除原断言；错误启动用例不发 ready。
- 与开发依赖修复分开提交，二者集成后跑完整批次；不向上游推送、不发布。

## 验证记录

旧路径单文件多次出现关闭 hook 超时；单行等待屏障后原 3 例通过。完整包级和批次测试待记录。

- 更新 watcher 单测的外部 Vite 替身以提供真实 API 的 waitForRequestsIdle；不修改 watcher 不阻塞 ready 的原断言。

- 连续单文件复跑 3/3 通过；完整包 13 文件 / 46 例通过；tsgo 包级 build 通过。现有就绪字段、locale 更新与语法错误拒绝断言保留。

## 最终行为验证

- 四 worker 的 test:changed --base origin/dev 选择 40 个工作区，其中 39 个通过，只有 cli-host 的 4 个用例失败/超时；保留该次非零结果，不伪称整条命令返回 0。
- cli-host 按包配置注明的 Windows CI 串行模式单独全包复验：VITEST_MAX_WORKERS=1，49 文件通过 / 1 跳过，225 用例通过 / 14 跳过，退出码 0；测试范围、断言和超时均未改，跳过数量与首次相同。
- 两次验证之间没有更改生产代码，合并同一代码状态下的逐包证据作为本批验收；此结论不保证任意本地并行度都稳定。
- 修复按内部开发工具的集成测试验收；推送只允许 origin/dev，实际推送结果以最终 Git 回执为准。
- 最终完整 `bun run check` 退出码 0；首次批次与串行复验日志分别保存在本次 TEMP 日志中，未改测试断言、超时或 CI 配置。
