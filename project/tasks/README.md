<!-- Copyright The Open Forge contributors. -->
# Tasks

Task 是可执行的最小工作项，必须能被一个 Agent 或开发者在一次明确的验证闭环中完成。并行执行时必须同时遵守 [`../collaboration/README.md`](../collaboration/README.md)。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`templates/task.md`](templates/task.md)。

## 状态

```text
draft → ready → in_progress → blocked → verifying → done → archived
```

## Task 要求

- 必须关联 `REQ` 或 `BUG` / `ISSUE`；
- 说明 owner、范围、不做什么和依赖；
- 给出可观察的完成标准；
- 指定测试层级和验证命令；
- 完成后记录实际验证结果；
- 不把多个可独立回滚的 concern 塞进一个 Task。

## 当前执行焦点

- `PLAN-0002`：P0 治理 Task-0029–0032 均为 done；下一项选定 `TASK-0033`（P1 / ready，尚未开工）。
- `PLAN-0001`：`TASK-0028` done（文档处理入口已合入主工作区）；`TASK-0025`、`TASK-0026` 可评估串行顺序，仍共享 WorkspaceMode 写路径；TASK-0068 正在补齐 TASK-0027 所需的 Plugin SDK renderer/schema API，TASK-0027 等该合同完成后串行实施。
- `PLAN-0003`：`TASK-0043` verifying；`TASK-0044` done（原生 About 品牌/credits），`TASK-0045`–`TASK-0049` 继续按各自合同/外部决策保持 blocked。
- `PLAN-0004`：`TASK-0001` done，计划仍在 verifying。
- `PLAN-0005`：ISSUE-0007/0008/0009 全部裁决（首发 `0.1.0` Preview、§4(b) 文件头声明+审计、不公发 workspace 包）；TASK-0052/0055/0056/0057 done；TASK-0058 done；新增 TASK-0065（发布流水线修复）、TASK-0066（第三方清单审计）、TASK-0067（发包面硬化）。
- `PLAN-0008`：`TASK-0069`（结构化委派交接与 leader 编排纪律）、`TASK-0070`（Team 聚合视图成员归属）、`TASK-0071`（成员 handle 队内改名）done。

`TASK-0001` 已完成 Project 控制面整理；`TASK-0002`–`TASK-0007` 覆盖性能/可靠性基线且均已完成；`TASK-0008` 覆盖 Task/Artifact 合同，`TASK-0009` 记录品牌化决策冻结；`TASK-0010`–`TASK-0014` 的观测、缓存和驻留上限任务均已完成。

`TASK-0015`–`TASK-0022` 对应 `exprot/implementation-plan.md` 阶段 1–7（PLAN-0001）：0015 Task/Artifact 纵向切片（done；显式 Task API，不做自由文本升级分类）、0016 Permission/Approval（done）、0017 Work Profile（done，ADR-0128 三轴分离）、0018 文件整理（done）、0019 Coding Profile/Review（done，风险分级+Artifact 登记）、0020 共享项目目录（done）、0021 Catalog Policy（done，Profile×选择×项目策略收敛）、0022 Pi 只读条件评估（archived，ISSUE-0002 常设裁决不启动）。

`TASK-0023`/`TASK-0024` 为跨阶段 UI/UX 线（`exprot/ui-information-architecture.md`）：0023 双模式 IA 定稿、0024 WorkspaceMode Shell/Mode Switcher 落地，均已完成；0024 只控制项目布局，不改写会话 `agentMode`。

后续纵向切片：`TASK-0028` 文档处理已 done；`TASK-0025` 本地研究/引用、`TASK-0026` 数据分析共享 WorkspaceMode 写路径，须串行。`ISSUE-0006` 已裁决：普通 Chat 不自动升级，用户显式升级或注册的持久工作流入口创建 Task。`TASK-0027` 的既有依赖（0015/0016/0020/0021）已完成，新增 Plugin SDK 合同前置 TASK-0068；两步串行，不改变 PLAN-0006 预留的 TASK-0059–0064 编号。

`TASK-0029`–`TASK-0032` 对应 `RESEARCH-0004` P0-1 至 P0-4 内存治理，均为 done。`TASK-0033` 是 P1 ready 的会话执行运行时结果策略旁路跟进，已选为下一项执行任务；实际开始实施前保持 ready。

`TASK-0034`–`TASK-0042` 对应 `RESEARCH-0004` 后续路线：TASK-0034 transcript 窗口化合同已定稿；TASK-0035 视口外占位已 ready；新增 TASK-0050 游标分页和 TASK-0051 compaction 边界重放，均依赖前一阶段并保持串行；TASK-0038 compaction 事件联动/防抖依赖 TASK-0051。TASK-0036 文本双份消除、TASK-0037 事件分级背压、TASK-0040 MCP 生命周期盘点、TASK-0041 会话列表 stat 索引为 ready；TASK-0039 webview pinned 收口与 TASK-0042 powerMonitor 收缩为 P2 draft。RESEARCH-0004 P2 其他项不预登记，由触发信号驱动。

`TASK-0043`–`TASK-0049` 跟踪 PLAN-0003 剩余品牌工作：0043 品牌外置层 verifying；0044 Desktop 原生 About 品牌/credits done；0045 生态身份、0046 npm scope、0047 仓库文档、0048 公开文档站和 0049 社区目标确认按依赖/决策保持 blocked。CLI 命令名、npm 组织和社区地址未确认前不猜测或执行外部操作。

`TASK-0052` 和 `TASK-0055`–`TASK-0057` 对应 PLAN-0005 的 Desktop 双阶段发布、发行物 LICENSE/NOTICE、workspace release fail-closed 与活动范式落地，均已完成定向验证；`TASK-0058` 跟踪 ISSUE-0008 的文件级 Apache 声明迁移，决策已关闭、转 ready。`TASK-0068`（Plugin SDK Artifact Renderer 合同）→ `TASK-0027`（Desktop registry/读取集成）必须串行；二者与 TASK-0059/0061 的 IPC/Activity Panel 改动不得并发。已存在的 `TASK-0053`/`TASK-0054` 属 PLAN-0002 的 MCP 性能工作，不与本计划重用。

`TASK-0059`–`TASK-0064` 对应 `PLAN-0006`（Canvas/Browser/Terminal 右栏集成）：0059 共享合同与接缝已 done（ADR-0129）；0060 Canvas artifact 服务、0062 Browser 元素点选可并行；0061 Canvas tab 依赖 0060，0063 `browser_tab` 依赖 0062（共享 WebView 会话控制器）；0064 Terminal 右栏 tab 独立，仅与 0061 在 `builtins/index.ts` 注册行冲突。下游不要再改 IPC 聚合、preload 索引、`shortcuts.ts` 或 i18n locale。`TASK-0077`/`TASK-0074`/`TASK-0075` 收口 ISSUE-0010/0011 与 BUG-0006；`TASK-0072` 留给 WebContentsView 迁移，`TASK-0073` 是内核上下文稳定性，不要复用编号。

`TASK-0065`–`TASK-0067` 对应 `PLAN-0005` 首发前剩余工作：0065 修复 desktop-release workflow 存量缺陷（Release 标题、Linux 冒烟路径、`--prerelease`、macOS 条件化）并在 prepare 写入上游基线行；0066 已产出清单草案（VERIFY-0005）待用户终审；0067 把 `publish:private` 接入 fail-closed 守卫并给无私发意图包补 `private: true`。0058（§4(b) 文件头迁移+审计脚本）已完成：529 文件写入声明头、审计 missing=0。
