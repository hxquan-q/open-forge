---
id: PLAN-0010
type: plan
status: in_progress
priority: P1
requirement: REQ-0002
owner: apps/desktop
source: RESEARCH-0013（microsoft/vscode 源码取证，commit ab52f2c82c4677a5983435d7f706380eaac43c09）
created: 2026-09-24
updated: 2026-09-24
depends_on: [RESEARCH-0003, RESEARCH-0011]
---
<!-- Copyright The Open Forge contributors. -->

# 桌面端内存与发布体积优化（VS Code 借鉴）

## 背景与目标

`RESEARCH-0013` 对 `microsoft/vscode` 做了一手源码取证，坐实了 VS Code 在运行时内存与安装体积两个维度上的工程机制。本计划把其中对本仓库真实有价值的条目落成可执行任务；与 `PLAN-0002`（性能与可靠性基线）同域，本计划负责「外部参照移植」这一段，`PLAN-0002` 继续承载既有基线与窗口化链路。

目标：在不改变用户可见行为的前提下，降低 Desktop 启动期与驻留内存、收紧安装包内容、给后台进程与初始化建立统一治理形状。

## 当前事实

- VS Code 侧机制证据见 `RESEARCH-0013`「事实来源」表（固定 `ab52f2c8`）；收益均为机制级判断，无实测数字——量化依赖 `RESEARCH-0003` P0-1 基线与 `ISSUE-0020`。
- Open Forge 现状缺口（`RESEARCH-0013` 现场抽查）：
  - `prepare-pack.js` 的 `stageDepTree` 整目录 `cpSync`，依赖的 test/docs/构建残留随包发布；
  - `vite.main.config.ts` 显式 `minify:false`；
  - main 启动序列与 renderer 非首屏工作无统一相位/idle 预算框架；
  - 无「对象尺寸 → 功能降级」硬闸（大 transcript / 大 artifact / 大文本文件）；
  - 后台进程（speech-input、session-search、uiohook、sidecar）各自实现 crash 处理与内存归因；
  - i18n locale JSON 全量静态进 bundle。
- 已具备、不重复立项：列表/树虚拟化、`VETTA_CLOUD_ENABLED` 常量折叠裁 chunk、按平台选原生负载、`app.asar`+`asarUnpack` 白名单、Inno `lzma2/max`+非 solid（为 blockmap 增量刻意选择）。

## 候选方案与取舍

- **逐机制移植（采纳）**：按 `RESEARCH-0013` 优先级表逐项立项，每项先找本仓库等价物再动手；P1 全做，P2 按依赖排序做。
- **整体引入 VS Code 架构层（否决）**：DI 容器、contribution registry、AMD/ESM 全套是另一套架构血统，与本仓 Jotai/Vite/Bun 栈不兼容；只借形状不抄实现。
- **翻转 asar 分层 / Inno solid 压缩（否决）**：见 `RESEARCH-0013` 被否决方案，两边各自自洽，无证据需要翻转。

## 阶段

- 阶段 A（打包体积，先见效）：`TASK-0103` staged 依赖清洗、`TASK-0104` main bundle minify 评估、`TASK-0109` `.vettapkg` 资源 minify 与 sha256。
- 阶段 B（启动与驻留）：`TASK-0105` phase+idle 治理、`TASK-0106` 尺寸阈值降级、`TASK-0107` 后台进程健康契约。
- 阶段 C（防长尾）：`TASK-0108` Disposable 所有权约定 + dev 泄漏 tracker。
- 条件触发项（不立 Task）：watcher 高热目录默认排除（M7，等递归/工作区级 watch 需求出现）；V8 code cache 按 commit 分区（M9，等 profile 显示 JS 解析成本显眼）。

## 不做什么

- 不做 piece-tree 文本模型移植（`RESEARCH-0013` M4：热点是 transcript 对象驻留，由 `PLAN-0002` 窗口化链承担）；
- 不做 renderer OOM 自动重载（已证伪，VS Code 也是弹窗交用户决策）；
- 不引入统一堆上限到全部子进程（VS Code 用隔离+重启预算，不设 `--max-old-space-size`；现有单点上限保留）；
- 不改动插件 `.vettapkg` 的包格式版本（只加资源 minify 与完整性指纹，兼容性照旧）；
- i18n 外置（S3）不进本计划 Task，走 `ISSUE-0021` 产品裁决。

## 验证与回滚

- 体积项以打包产物 diff 为准：`prepare-pack` staged `node_modules` 字节数、main bundle minify on/off 产物大小、`app.asar` 清单；回归走 `desktop-packaging-layout`/`verify-*` 既有脚本。
- 内存项以 perf 快照为准：`app-monitor` per-role `privateKb` 归因、降级闸前后大对象场景曲线；不留基线的改动不宣称收益。
- 每项 Task 独立可回滚；`minify` 类变更若出问题回退单行配置即可。

## 升级信号

- 基线显示启动期 RSS/首帧仍超标 → 提前 `TASK-0105` 并补 code cache 评估；
- 递归 watcher/工作区索引需求出现 → 先落 M7 默认排除清单再开；
- 插件市场出现「包内容被篡改/版本漂移」类问题 → `TASK-0110` 提前。

## 需要的 ADR

暂不需要。所有条目均为局部实现层改进；若 `TASK-0105` 落地时引入新的初始化相位合同，再评估是否补 ADR。
