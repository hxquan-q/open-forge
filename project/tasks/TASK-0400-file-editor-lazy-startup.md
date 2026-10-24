---
id: TASK-0400
type: task
status: verifying
priority: P1
owner: desktop-file-preview
requirement: REQ-0002
plan: PLAN-0002
source: user-request; RESEARCH-0044 后续实施授权
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
related_tasks: [TASK-0398]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: .
base_commit: ea67d951e8bb29a464219812465d3a4ae2939179
read_paths: [apps/desktop, packages/theme-ui, project, docs]
write_paths: ["apps/desktop/src/renderer/domains/file-preview", "apps/desktop/src/renderer/shared/shortcuts/scope-stack.ts", "apps/desktop/src/renderer/shared/theme/runtime/ThemeRuntimeProvider.tsx", "apps/desktop/src/renderer/shared/theme/runtime/ThemeRuntimeProvider.test.tsx", "apps/desktop/src/shared/i18n/locales/zh/chat.json", "apps/desktop/src/shared/i18n/locales/en/chat.json", "packages/theme-ui/src/file-preview", "packages/theme-ui/src/activity/CodePreview.tsx", "packages/theme-ui/package.json", "packages/theme-ui/README.md", "project/tasks/TASK-0400-file-editor-lazy-startup.md", "project/tasks/README.md", "project/plans/PLAN-0002-performance-reliability.md", ".github/release-notes/v0.1.3.md", "packages/theme-ui/src/settings/ssh-host-form.ts", "packages/theme-ui/src/settings/shortcut-recorder.ts", "apps/desktop/src/renderer/domains/project/components/sidebar/add-project/RemoteProjectPickerDialog.tsx", "apps/desktop/src/renderer/domains/settings/components/ShortcutRecorder.tsx", "apps/desktop/src/renderer/shared/theme/runtime/settings-startup-dependencies.test.tsx"]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-24
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# 文件编辑器启动按需加载

## 目标与范围

将未打开文件预览时不需要的编辑器组件移出应用启动静态依赖，保留主题替换、预览/编辑/保存、审批与事件入口。

- 来源：[RESEARCH-0044](../research/RESEARCH-0044-desktop-startup-resource-audit.md)；用户已要求列 Task 并实施三个 P1 优化。
- 输入：当前实现、既有行为测试、脱敏调查证据；输出：最小实现、可失败回归、受控前后证据和验收包。
- 直接修改优先；只在同步IO/重依赖或恢复入口职责阻碍测试时提取必要接缝，不新增通用调度框架。
- 不做：次级缓存/隐藏窗口/知识库优化、监控协议重写、依赖升级、真实用户状态/Provider/SSH/UI测试、完整打包与发布。
- 不变量：安全沙箱与权限不变，角色/工具/错误/取消/usage/stop不变；不更改磁盘会话格式，不删功能/断言，不以扩大超时或缩小堆上限换取指标。

## 并发与执行

- 条件支持只读设计/审查并行；三个 Task 的产品代码由 Coordinator 在 main 串行写入，避免共享工作区并行写代码及脏目录集成。
- 无代码 Worktree；保留用户和其他会话未提交文档。共享 root-layout 与Project索引由同一Coordinator按顺序维护。
- 执行顺序：TASK-0399 → TASK-0400 → TASK-0401；并非功能硬依赖，各 concern 可独立回滚。
- 原生只读子任务在合同落盘后派发，禁止写入/Git/真实实例。归属 Open-Forge-only。

## Given / When / Then

Given 主界面启动且未打开文件；When 打开文本预览→编辑→保存→关闭→重开；Then 未打开时不加载重编辑器，首次加载有可见可取消反馈，保存与重开内容正确，关闭/快速切文件不提交过期结果。

## 测试与验证

- 先记录当前 Renderer 构建依赖/字节基线；组件测试覆盖真实轻量入口到懒加载展示的连续流程与关闭/失败路径，保持已有预览/编辑测试；同一构建配置对照启动静态闭包和首次懒块。
- Node runner：在 apps/desktop 下运行 `bun ../../scripts/quality/run-vitest.mjs --run <本Task测试>`。
- 每个切片定向测试、`bun run test:impact -- <本Task路径>`；中间编辑轮 `check:quick`，三项组合结束完整 `bun run check`。公共合同/跨包变化按测试政策追加 `test:changed`。
- 性能结论仅引用可复算的受控等待、驻留条目或构建依赖指标，不宣称真实启动时间/内存下降百分比。

## 验收分层与功能验收包

- 工程：实现、定向/组合验证与完整check已完成；独立复审发现已处置。
- 集成：integrated，由承载本记录的本地main原子提交绑定；其他工作原样保留，未推送。
- 人工：verifying，等待用户确认实际启动/恢复/编辑体验；本轮未启动真实Desktop/Provider或运行verify:ui。
- 发布：未授权。
- 入口：正常启动与本Task影响的操作入口；预期为上述 Given/When/Then，具体提交和验证结果交付时补齐。

## 交付记录

- 初始准入时未修改生产代码/测试；后续各切片的实际证据按时间补记如下。
- 实施前复核发现：全局主题加载器静态发布整个 theme-ui namespace、只读代码预览为语言名称导入全部编辑器语法、file-preview barrel 重导出编辑器，均可绕过单点 lazy。因此必要调整为默认主题分支懒载 Federation、纯语言标识拆分、兼容新增 file-preview/core 轻量公开入口、11处轻量消费者迁移及实际编辑器消费懒载；不升级依赖、不移除旧公开导出。
- 同配置基线构建已通过：`bun run build:renderer --mode startup-audit --outDir C:/Users/xquan/Desktop/open-forge/temp/TASK-0400-before-20261024 --manifest`；Sentry上传和遥测公开构建值用当前进程空值覆盖，未上传。renderApp静态闭包9个JS，共4,560,307字节，gzip 1,393,404字节；renderApp主块4,073,783字节。构建既有图标与大块警告保留，非本Task新增。
- 仅一个串行Writer实施本Task；TASK-0399已冻结，Coordinator只读审查其他切片。默认主题收益与外部自定义主题恢复分开验证，后者仍需按既有合同加载共享模块。
- 新增加载失败反馈需区分编辑器模块与文件读取，写域补入 chat zh/en 的 `fileEditor.errorLoadEditor` 和 `fileEditor.retry`（common.actions.retry当前不存在，不扩大common目录）。Coordinator仅维护合同，产品/测试/catalog仍由单一Writer修改。
- 实现已冻结：默认主题按需加载Federation、core轻量公开入口、纯语言标识、11处轻量消费迁移、编辑器绘制后懒载及局部错误/重试。旧红覆盖默认主题/预览/语言提前求值；关闭pending read后文档再次驻留也已旧红→通过effect清理作废请求修复。
- Writer定向结果：Desktop九文件38项通过、theme-ui五文件17项通过；测试包含真实编辑读取/修改/保存/关闭释放/重新打开流程，外部FS和CodeMirror浏览器叶子替身，未mock业务hook。代码未提交；完整检查、跨包测试、同配置afterbuild与独立复审待Coordinator完成。
- 首次afterbuild已通过（同startup-audit配置）：静态JS闭包4,560,307→3,668,103字节，减少892,204（19.56%）；gzip 1,393,404→1,131,831（18.77%）。EditableTextFileView/themeLoader均独立动态entry且不在startup闭包；但产物CM标记仍存在，不能声称全部CodeMirror已移出。独立复审正在追其他设置barrel路径，必要补修后重新构建比较。


- 独立复审确认残余CM来自settings barrel的JsonConfigInputView顶层样式注册；默认SSH项目对话框和快捷键审批Recorder两条链均需切断。补入两个settings公开叶子入口、两个运行时消费者和冷导入依赖回归写域，保留legacy导出；下一串行写入窗口实施后重新构建。
- 两轻入口补修与独立复审已通过。冷导入完整settings catalog回归旧1≠0→新0，另Recorder录制/重置与既有SSH项目流程共两文件12项通过。直接mock CM依赖因物理依赖副本未拦截，不计有效红，改测真实聚合入口加载边界。
- 最终组合构建通过（含0401小范围恢复接线）：静态JS闭包4,560,307→3,219,653字节，减少1,340,654（29.40%）；gzip 1,393,404→984,835（29.32%）。编辑器/外部主题均为startup闭包外的动态entry；CodeMirror plugin crashed、cm-scroller、codemirror标记归零，残留cm-content为快捷键目标选择器。外部自定义主题仍可按需加载共享模块；该证据不代表实机首屏/RAM百分比。

## 本轮工程交付（2026-10-24）

- 默认启动切出文件编辑器、外部主题及设置聚合入口；保留公开API/主题恢复，局部加载/失败重试与关闭后的请求失效均有连续流程。最终组合静态JS 4,560,307→3,219,653字节（-29.40%），gzip -29.32%；编辑器/主题为动态入口。Desktop定向38、theme-ui定向17与补修12项通过，独立复核无剩余P1/P2。
- 组合验证：按test:changed影响图，externals/kanban 102、theme-ui 236、内置xianxia 1项通过；Desktop整包6155通过、3项进程型超时、18原跳过，隔离复跑相关3文件11通过、2原平台skip，覆盖全部先前超时及修正后的主题夹具。不是单次test:changed全绿；初轮WSL bash环境不符的运行已中止，不计通过。验证仅在当前进程将Git Bash放在PATH首位，未改持久环境/超时/断言。
- 采用更保守的完整命中包测试替代重复impact筛选；完整 `bun run check` 最终退出0，lint、全部类型、设计、模块边界、声明头和Project合同均通过。本机日志：`temp/desktop-performance-check-accepted.log`、`temp/desktop-performance-desktop-validated.log`、`temp/desktop-performance-final-recheck.log`。
- 无代码Worktree：全程单一串行Writer切换，原生只读分域调查和独立审查；源码/测试按本Task路径提交。共享导航在工作区同步，提交例外见WAIVER-0007，不夹带他人记录。
- 验收入口：重启开发版后观察启动响应、首次文件编辑及上次会话恢复；更早历史可向上加载、主动完整加载可用。真实安装版/系统性能采样及人工体验尚未执行，不以构建字节或夹具条目推算实际RAM/CPU降幅；未发布、未推送。
