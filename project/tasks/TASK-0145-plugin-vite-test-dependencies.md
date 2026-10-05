---
id: TASK-0145
type: task
status: done
priority: P1
owner: packages/plugins/plugin-vite
source: user-request
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 68b62c74cbdc921552a883cf1f32ea55dd58dafc
read_paths: [packages/plugins/plugin-vite, packages/plugins/docs/module-federation.md, package.json, bun.lock, project/collaboration]
write_paths: [packages/plugins/plugin-vite/package.json, bun.lock, project/tasks, .github/release-notes/v0.1.3.md]
exclusive_paths: [bun.lock]
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行）
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 补齐插件 Vite 测试依赖并解除 dev 推送阻塞

## 目标与范围

Upstreamable。用户授权修复测试依赖后推送当前 main 到 origin/dev；仅声明测试实际需要的 React 开发依赖并同步锁文件，不改运行时 API、测试断言、超时或发布权限。串行执行，无需 Worktree，不向 upstream 提交。

## 根因证据

- 同一测试在完整批次与单文件执行中均有 2 失败 / 1 通过：正常启动和 locale 热更新都无法解析 react/jsx-dev-runtime；错误模块拒绝测试正常通过。
- plugin-vite 的测试临时项目在包内创建，使用 automatic JSX；该包未声明 react/react-dom，本地解析失败，而 apps/desktop 的解析成功。
- Module Federation 既有约定要求这些共享模块在构建/测试侧存在本地开发依赖，import:false 只表示运行时由宿主供应，不代表可以不安装。
- 文档中的 19.1.1 示例已落后于根 package.json 的 overrides；本任务按实际配置使用 19.2.8，不降低现有版本。

## 方案与不变量

直接补 devDependencies 即可，不需要改 Vite 解析、外部化策略、公开合同或测试。不给根目录制造隐式依赖，不用临时 node_modules 链接掩盖声明缺失。依赖升级不在范围，发布仍由明确授权控制。

## Given / When / Then

- Given 隔离安装的工具包，When 启动测试插件，Then JSX、MF manifest、React preamble、HMR 和 CSS 均正常。
- Given 插件运行中，When locale 改变，Then 发布定向资源更新。
- Given 插件模块语法错误，When 启动，Then 在 ready 前拒绝；保留现有负向断言。

## 验证与推送

复用实际会失败的 dev-server 集成测试，不新增重复测试或 Mock。先定向红绿，再包级测试与 origin/dev 差异测试、完整 check；全部通过后检查干净工作区与待推日志，fast-forward 推 dev。真实 Provider、Desktop 用户实例、tag/Release 不使用。

## 实测进展

- bun install 后清单与锁文件各仅新增两行，版本与现有 overrides 一致；本地 react/jsx-dev-runtime 和 react-dom/client 均可解析。
- 缺依赖失败解除后出现独立的首次静态导入/关闭竞态，由 TASK-0146 修复，不通过加超时或替换断言规避。
- 两项修复集成后 plugin-vite 13 文件 / 46 例通过，包级 tsgo build 通过。根 Biome includes 不覆盖嵌套 plugin-vite，未将该路径的空扫描报告为 lint 通过。
- 整批验证使用 Vitest 官方支持的 VITEST_MAX_WORKERS=4 控制本地资源并行度；不删用例、不更改 testTimeout/hookTimeout，不持久化修改 CI 配置。

## 最终行为验证

- 四 worker 的 test:changed --base origin/dev 选择 40 个工作区，其中 39 个通过，只有 cli-host 的 4 个用例失败/超时；保留该次非零结果，不伪称整条命令返回 0。
- cli-host 按包配置注明的 Windows CI 串行模式单独全包复验：VITEST_MAX_WORKERS=1，49 文件通过 / 1 跳过，225 用例通过 / 14 跳过，退出码 0；测试范围、断言和超时均未改，跳过数量与首次相同。
- 两次验证之间没有更改生产代码，合并同一代码状态下的逐包证据作为本批验收；此结论不保证任意本地并行度都稳定。
- 修复按内部开发工具的集成测试验收；推送只允许 origin/dev，实际推送结果以最终 Git 回执为准。
- 最终完整 `bun run check` 退出码 0；首次批次与串行复验日志分别保存在本次 TEMP 日志中，未改测试断言、超时或 CI 配置。
