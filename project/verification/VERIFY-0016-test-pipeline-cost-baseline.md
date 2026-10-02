---
id: VERIFY-0016
type: verification
status: done
priority: P2
owner: quality tests
source: TASK-0176; RESEARCH-0019
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0176, TASK-0173, TASK-0174]
related_issues: []
related_bugs: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 回归测试耗时基线与瓶颈证据（Windows 单机）

## 目的与方法

[TASK-0176](../tasks/TASK-0176-test-pipeline-cost-profiling.md) 要求在同快照、同资源、同测试集合下建立可复查基线，识别主导瓶颈，只对已证实瓶颈落一项低风险优化；无可靠改善则保留现策略并交付否决依据。

- 方法：固定提交/工作树、串行执行、每轮记录 `test:pkg` 的包级时长与 Vitest 自报的阶段分解（transform/setup/import/tests/environment），不并发其他重负载任务。
- 命令（cwd 仓库根）：`bun run --cwd apps/desktop test`、`bun run --cwd apps/cli-host test`；选择器行为见 TASK-0174。

## 环境（2026-10-03 固定）

| 项 | 值 |
|---|---|
| OS | Windows 11 专业版（10.0.26200） |
| CPU | 12th Gen Intel Core i7-12650H，16 逻辑处理器 |
| 内存 | 31.7 GB |
| Bun / Node | Bun 1.4.2 / Node v26.3.1（run-vitest 用 Node 启动 Vitest 4.1.11） |
| 并发 | Windows 默认最多 2 个 Vitest worker（本地与 CI 一致） |
| 快照 | 本会话最终工作树（TASK-0168/0174 实施后，含 8b63e0d02…b715d380f 提交） |

## 串行基线测量

固定快照（工作树与最终提交内容一致，含 8b63e0d02…a96b6f0ea 的批次改动），每轮之间无其他重负载任务：

| 组 | 范围 | 结果 | 墙钟 | Vitest 阶段（并行重叠计量） |
|---|---|---|---|---|
| desktop #1 | `bun run --cwd apps/desktop test` | 4666 通过 15 跳过 | 764.50s | transform 38.3 / setup 117.8 / import 944.9 / tests 157.1 / environment 146.7 |
| desktop #2 | 同上 | 4666 通过 15 跳过 | 709.67s | transform 33.0 / setup 111.9 / import 863.8 / tests 148.8 / environment 140.4 |
| desktop #3 | 同上 | 4666 通过 15 跳过 | 710.47s | transform 33.2 / setup 111.9 / import 867.4 / tests 148.8 / environment 139.7 |
| cli-host（参照） | `bun run --cwd apps/cli-host test` | 230 通过 14 跳过 | 513.15s | transform 6.5 / import 40.9 / **tests 463.5** / environment 0 |
| 全批有序（参照） | `bun run test`（41 包） | 41 包中仅 cli-host 一例失败（探针默认期限，已另修） | desktop 734.3 + cli 498.5 + coding-agent 112.0 + 其余 | — |

Desktop 三组中位 **710.47s**，组间极差 54.8s（≈7.7% 运行抖动）；测试断言自身时间稳定在 148.8–157.1s。

## 阶段分解与瓶颈证据

- **Desktop 是装配型瓶颈，不是断言型**：tests 仅占墙钟约 21%（≈149/710）；模块 import（863–945s 并行计量）与环境装配（setup 112–118s + environment 140s）主导。887 个测试文件的重复 transform/import 与逐文件环境注入是主要成本来源。
- **cli-host 是进程型瓶颈**：tests 占墙钟 90%（463/513），由安装制品构建、真实子进程与本地假 server 驱动；`--maxWorkers=1` 下墙钟≈测试自身时间和。
- 全批负载会放大单用例墙钟（BUG-0059 追加证据：探针用例在全批中超默认 5s、单文件/单包通过）。

## 候选优化与裁决

| 候选 | 裁决 | 理由 |
|---|---|---|
| 提高 Windows 默认 worker 数（2→更高） | **否决** | 与既有稳定性合同冲突：BUG-0059/TASK-0170 的证据链正是并发引发假超时；合同明言不得把更多并行视作已解决。 |
| Desktop 引入持久 transform/import 缓存 | **否决（本轮）** | Vitest 4 对源码 transform 无持久缓存机制；落到构建层（预打包测试入口）属架构改动，超出「低风险、可独立回滚」边界。 |
| 按文件细分 jsdom/happy-dom 环境以缩短 environment 阶段 | **否决（本轮）** | 会改变部分用例的 DOM 语义基线，收益未测量前不可宣称，风险与 TASK-0176 合同不符。 |

**结论：无优于运行抖动（±7.7%）的低风险候选，按合同保留现默认策略（2 worker、既有超时、完整测试集合），只交付基线与否决依据。** 后续若要实质缩短 Desktop 反馈，方向是测试入口预构建/缓存（需单独 Task 评估兼容与回滚）。

## 剩余风险

单机单平台观测，不是性能 SLA；三平台 CI 的时长由 GitHub Actions 自身资源决定，不可与本基线直接对比。
