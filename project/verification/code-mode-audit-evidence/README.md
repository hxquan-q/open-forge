<!-- Copyright The Open Forge contributors. -->
# Code 模式审计证据与复核

本目录配套 [2026-10-30 完整审计报告](../VERIFY-0024-code-mode-audit-2026-10-30.md) 和 [TASK-0425](../../tasks/TASK-0425-code-mode-comprehensive-audit.md)。报告的历史基线是 `98f7de9e6` **加当时未提交的候选修改**；不能仅凭该提交重建同一工作树，也不能将当时数字当成当前产品状态。

## 文件与保真边界

- `code-mode-behavior.probe.tsx`：当时 12 场景的行为探针。除版权声明头外保留原始内容；使用合成项目、事件及 UI 替身，目的是保留原始断言，不属于正常测试发现。
- `audit.vitest.config.mts`：该探针的 opt-in Vitest 配置；已从个人绝对路径改为基于本文件定位仓库和 Desktop 的依赖，沿用 Desktop 测试 setup 及单 worker 限制。
- `terminal-output-memory-probe.mts`：合成字符串的 Node/V8 堆保留对照；采样逻辑保留原意，仅将生产模块导入改为仓库相对路径。该诊断不是 Electron 浸泡测试，不证明 OOM 根因。
- 九份 `*.log.txt`：原历史 `.log` 文件的文本归档；测试数、状态、堆数值、断言和栈信息保留，个人检出/辅助工作区路径替换为 `<REPO>`、`<WORKSPACE>` 或 `<EVIDENCE>`，测试意外回显的工作区指令正文替换为 `[REDACTED WORKSPACE INSTRUCTION]`；另规范化行尾空格和文件末尾空行。因此它们是**经脱敏的历史输出，不是逐字节原始日志**；扩展名增加 `.txt` 以作为可跟踪文本保存。原始日志未修改。

## 按需复核

仅在已安装本仓依赖、确认隔离测试环境并获任务授权时使用。Desktop 测试 setup 会在系统临时目录下创建隔离 `VETTA_HOME` 并清理其新建目录；如执行环境要求临时文件位于授权工作区，应先将 `TEMP`、`TMP` 和 `TMPDIR` 指向该工作区中专门建立的空临时目录，并核对其身份。不要使用真实会话目录或已运行 Desktop。

```bash
# 从仓库根目录运行；诊断，不是正常测试门禁
bun scripts/quality/run-vitest.mjs --config project/verification/code-mode-audit-evidence/audit.vitest.config.mts --run

# Node 需支持 --experimental-strip-types；该探针会分配若干合成大字符串
node --expose-gc --experimental-strip-types project/verification/code-mode-audit-evidence/terminal-output-memory-probe.mts
```

2026-10-30 的行为探针结果是 **10 失败、2 对照通过**，用于记录当时反例；当前源码、测试 API 和能力合同已演进，可能通过、失败或不兼容，须单独分析，不能期待固定红灯或将其当作现在的回归结果。内存读数受 Node/V8、平台和生产实现版本影响，原始堆数值只代表当时样本。探针不主动连接 Provider，但行为探针会加载真实内部模块及 Desktop 测试 setup，不可据此保证所有未来模块副作用为零。

## 本次入仓复验（2026-11-25）

- Node 26.13.1 下的内存探针从仓库相对路径成功运行；当前生产函数在合成 3×16MiB 和 100×50KiB 样本上的堆增分别约 0.01MiB 与 0.22MiB。该读数不是历史重放或 OOM 根因结论。
- 行为探针经独立配置、隔离临时目录运行：12 场景中 6 通过、6 失败，exit 1；与旧基线 2 通过／10 失败不同。至少 F08/F09 因旧测试替身缺少现有 `agentTeams.listSidebarConversations` 而在建立场景时失败；F01/F04 等场景仍按旧入口和事件形状设置，不能仅凭本次历史探针断言当前功能回归。F05/F07 是原报告已区分的能力边界或未承诺行为。此运行仅证明探针能加载和执行，不能作为当前完整回归门禁或覆盖结论。

不要用本目录作为全量 `test:changed`、impact、真实模型、UI 或发布的授权；这些行为遵循当前仓库规则和用户当次授权。原始历史记录或用户数据不在此目录之外自动读取。
