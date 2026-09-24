---
id: PLAN-0007
type: plan
status: draft
priority: P2
requirement: REQ-0001
owner: apps/desktop
created: 2026-09-23
updated: 2026-09-23
depends_on: [PLAN-0006]
---
<!-- Copyright The Open Forge contributors. -->

# Agent Workspace Phase 2：Browser 调试闭环 + Canvas 富交互

## 背景与目标

PLAN-0006 交付「Agent Workspace v1」（产出沉淀 Canvas、元素点选进草稿、`browser_tab` 操作同一 WebView、右栏终端）。本计划收编三个已确认的 Phase 2 项：Browser console/network 日志、Canvas 内 HTML 点选、Agent 操作可见指示，外加 Canvas 消费插件 renderer registry 的收口。

**本计划为 draft：v1 演示与 0.1.0 首发反馈可重排内部顺序或增删项，转 ready 前重新评审。**

## 当前事实

- ADR-0129 已预留 console/network 落盘路径约定与 `read_logs` 动作形态；Phase 1 明确不采集，仅预留。
- 元素点选基建（overlay/点击拦截/capsule schema `vetta.browser.element-selection` v1）由 TASK-0062 交付；Canvas HTML 预览同为 `<webview>` 承载，基建可复用。
- `browser_tab` 写类动作走 Tool Approval，读类动作静默执行——Agent 在用户页面里连续操作无可见性，是已确认的信任缺口。
- 插件 renderer registry 由 TASK-0068（SDK 合同）→ TASK-0027（registry 集成）交付；Canvas v1 只做「已知类型跳 surface + 未知类型元信息卡」，通用消费归本计划。

## 阶段

```text
Lane A（Browser 调试闭环）：
  console/network 采集落盘（本地 fixture 可断言）→ `read_logs` 动作扩展 browser_tab 合同
Lane B（Canvas 富交互）：
  Canvas HTML 点选（复用 0062 picker 基建）→ capsule 附加草稿，与 0062 同构
Lane C（信任与汇入）：
  Agent 操作可见指示（browser_tab 生命周期驱动，非阻断横幅/边框）
  Canvas 消费 renderer registry（依赖 TASK-0027；插件 artifact 由对应 renderer 打开）
```

三条 lane 互相独立，可各自拆 TASK；Lane C 的 registry 消费硬依赖 TASK-0027 完成。

## 不做什么

- 多选/框选/标注、多页签、Canvas 直接编辑、图片/媒体 artifact、browser partition 隔离——维持 PLAN-0006 推迟项，各有独立触发条件。
- 操作指示不阻塞用户输入、不构成模态；仅提供可见性。
- 日志不注入 Agent 上下文——文件落盘，`read_logs` 按需读取。

## 验证与回滚

- console/network：本地 fixture 页产生已知日志与请求，断言落盘格式与 `read_logs` 输出；敏感头/cookie 不落盘。
- HTML 点选：Agent 产出的 HTML artifact 内点选→capsule→草稿；拦截点击不触发页面副作用。
- 可见指示：`browser_tab` 活跃期间横幅/边框可见，取消/超时/异常路径不留残影；与审批流互不干扰。
- registry 消费：插件 artifact 在 Canvas 列表由对应 renderer 打开；无 renderer 时回退元信息卡。
- 回滚：各项独立、能力驱动注册，撤除即整项下线。

## 升级信号

- v1 演示或 0.1.0 首发反馈暴露更痛缺口 → 重排本计划内部顺序或拆分新增项。
- PLAN-0006 升级信号触发（partition 隔离、多页签诉求成立）→ 晋升为本计划新 lane。

## 需要的 ADR

- 无新增：console/network 落盘形态已在 ADR-0129 预留；若实现期偏离预留路径，在同变更中修订。
