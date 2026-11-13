---
name: ap-contract
description: 内部手册：通用子代理任务契约模板。主会话决定 spawn 子代理执行流水环节前调用。给出对齐 spawn_agent 实际槽位（history/current_state/objective/scope/constraints/relevant_context/deliverables/validation）的契约拼装规则与可复制样例。
---
<!-- Copyright The Open Forge contributors. -->

# AP 子代理契约模板（工具手册 · lite）

主会话（你）决定派通用子代理执行某个流水环节时，按本模板拼 `spawn_agent` 任务书。**槽位名是内核合同，一个都别改**：`task.history / current_state / objective / scope / constraints[] / relevant_context[] / deliverables[] / validation[]`，外层 `task_name`（snake_case，本会话内唯一）+ `agent_type: "general"`。

子代理不见你的会话历史——**契约即它的全部输入**。指针式给料：路径 + 一句话定位，不复述内容。

## 1. 槽位填写规则

| 槽位 | 填什么 | 纪律 |
|---|---|---|
| `history` | 任务从哪来：用户原话（一两句）+ 已完成环节的结论（如"原型已确认，R1-R5"） | 只留决策相关，不贴对话 |
| `current_state` | 已核实的现状：项目形态、相关既有实现、上游产物路径与状态 | 给路径与事实，不给猜测 |
| `objective` | 本环节的单一可观察完成态（"原型落盘且按 ap-prototype 完成判定全过"） | 一个环节一个 objective |
| `scope` | 写域：允许新增/修改的路径（glob 或显式路径） | 见 §2 写域基线 |
| `constraints[]` | 行为边界 | 必带 §2 四条基线 + 任务特有约束 |
| `relevant_context[]` | 输入指针清单；**第一条固定：`invoke_skill: ap-<环节>（开工先现读本手册并遵照执行）`** | 后续条目 = 上游产物路径 + 一句话定位 |
| `deliverables[]` | 交付物路径级清单（产物文件 + 结构化报告） | 与 objective 对应 |
| `validation[]` | 完成前必须通过的检查（A# 逐条 / 手册完成判定） | 可执行判据，不写"做好" |

## 2. constraints 基线（每份契约必带四条，可按任务收紧不可放宽）

1. `写域限定：<写域路径>；其余一律不改`——过程产物写 `<工作区>/pipeline/<slug>/`（或其子目录）；代码改动才落项目根，且仅限改动面清单内文件。
2. `交付即停：完成本环节（objective）即输出最终报告，不自动续做后续环节`。
3. `不安装依赖；不执行 git commit/push（改动留在工作区）`。
4. `工具被拒/需越域/环境失败 → 原样记入报告"受阻项"，不重试不绕路`。

## 3. 汇报合同（写进 deliverables 最后一条，子代理最终回复的固定结构）

```
已完成: <文件清单 + 每处一句说明>
自测结果: <跑了什么命令/检查、结果；validation 逐条状态>
受阻项: <无则写"无">
风险: <发现的隐患与范围外问题，无则写"无">
```

## 4. 可复制样例（原型环节，JSON）

```json
{
  "task_name": "proto_library",
  "agent_type": "general",
  "task": {
    "history": "用户要求做一个前后端图书管理系统（原话见 requirements 要点）；本会话已路由为 L3 标准流水，本子代理承担原型环节。",
    "current_state": "项目为空目录起步；无既有实现。<工作区>/pipeline/2026-11-13-library-mgmt/ 已建，本环节产物写在此。",
    "objective": "按 ap-prototype 手册产出可交互原型 prototype.html 与需求要点 requirements.md，完成判定全过。",
    "scope": "<工作区>/pipeline/2026-11-13-library-mgmt/**",
    "constraints": [
      "写域限定：<工作区>/pipeline/2026-11-13-library-mgmt/**；其余一律不改",
      "交付即停：完成原型环节即输出最终报告，不自动进入开发",
      "不安装依赖；不执行 git commit/push",
      "工具被拒/需越域/环境失败 → 原样记入报告\"受阻项\"，不重试不绕路"
    ],
    "relevant_context": [
      "invoke_skill: ap-prototype（开工先现读本手册并遵照执行）",
      "用户材料：<Excel 路径>（藏书清单 sheet，字段以此为准）"
    ],
    "deliverables": [
      "<工作区>/pipeline/2026-11-13-library-mgmt/prototype.html",
      "<工作区>/pipeline/2026-11-13-library-mgmt/requirements.md",
      "结构化最终报告（按 ap-contract 汇报合同）"
    ],
    "validation": [
      "prototype.html 双击可开、主流程可点通、交互元素有 R# 标注",
      "业务字段有 F# 标注且与 requirements.md 字段清单一一对应",
      "推断全部标【推断】，开放问题已列"
    ]
  }
}
```

## 5. 拼装纪律

1. **一个环节一个子代理一个 objective**；并行分工（前端/后端）各自成契，scope 互不重叠。
2. 写域从 §2 基线收紧可以、放宽违规：没有代码改动就不要给项目根写域。
3. `<工作区>` 用系统提示 "Project AI workspace root" 行的路径原样替换；系统提示无此行时按 ap-router §8 退化规则解析并写死实际路径。
4. 子代理报告回来：先读"受阻项"，有 → 你裁决（改契约重派 / 换路径 / 上报用户）再交付；然后向用户转达交付（产物路径+一句话）。
5. 修订召回：`followup_task(<task_name>, <修改要求：R#/P# 指认>)`——在跑则自动排队，不要另起新子代理重做。
6. spawn 数量最小化；可并行才并行（无依赖的分工），否则串行。

## 6. P2 扩展位（本版本不填）

`delegation`（预留）：P2 支持"按成员定义起子代理"后，契约可加 `delegation: <成员定义引用>`，由内核按定义装配 persona 与工具面；当前版本一律省略，`agent_type` 恒为 `general`。
