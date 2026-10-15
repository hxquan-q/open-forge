---
name: ac-dev
description: AllstarCoding 流水环节 8 的开发执行环节使用。当需要启动任务开发子、按契约 schema v2 拼装自包含任务书、处理开发子的自测循环与沙箱拒绝、接收开发子报告时加载本技能。含开发子工作契约与任务书模板。
---
<!-- Copyright The Open Forge contributors. -->

# AC 任务开发执行（流水环节 8 · 开发侧）

目标：定义**开发子怎么起、任务书怎么拼（契约 v2）、自测怎么跑、报告怎么收**。开发子 = `spawn_agent`（general 型）后台启动，**每任务一个干净会话**，task_name 格式 `dev_t1`。

## 1. 开发子会话协议（核心：挂起保活，可打回唤醒）

1. **每任务一个独立 spawn**：任务清单有几个 T 就起几个互不相关的会话——T1 一个会话（`dev_t1`），T2 另一个干净会话（`dev_t2`）。**绝不**让一个开发子会话连续承接多个任务。
2. spawn 用**契约 schema v2 任务书**（见 §2），记下返回的 task_name 与 durable id → 立即登记 state.md（对应 subStep 的 agentRef + **contract 字段**（taskName/role/agentType/scope/agentId——ac-fence 围栏重启恢复的依据，ac-pipeline §0.8），sessionStatus: active，**startedAt 写入**——V2/V3 校验的时间锚）。**spawn 输入的 task.scope 必填且为单行逗号分隔 glob**——围栏按它判定写域，缺了/超基线 spawn 直接被 block（reason 会说明）。
3. **派发前规则**：派发任何 T 前必须存在干净 checkpoint（没有则先补空档）——T 内半途爆炸时上一 checkpoint 即安全点（环节级存档制 ac-pipeline §0.5）。
4. 任务完成（settlement 通知到达、评审通过）→ **挂起不关闭**：state.md 该 subStep 置 `sessionStatus: suspended`、`status: done`。会话保留——后续白测/黑测发现该任务的问题时 `followup_task(dev_t1, <问题清单>)` 唤醒**同一会话**修正（它记得当时怎么做的），修完再次挂起。
5. **全流程无问题** → 收尾环节统一关闭全部挂起会话（ac-finalize）。
6. 顺序任务等上一个 T 通过评审再起下一个；并行组可一次起齐。

## 2. 开发子任务书模板（主控拼装，契约 schema v2）

spawn_agent 的任务契约（ac-pipeline §0.2 映射）：

- **objective**：本任务的可观察完成态（"T1 的 dto 层实现完成并通过验收标准"）
- **stage_context**：流水背景两三句（做什么需求、上游产物已批准、本任务在依赖链中的位置）+ 项目现状要点 + 上游任务已完成的结论（文件路径级）
- **scope**：允许触碰的文件范围（**glob 列表，机器可读**——从 tasks.md 任务卡改动面逐条摘出；这是 V3/V4 硬校验的输入）
- **prohibitions**（逐条，四条基线必带）：①不 commit/branch/push（git 写操作全收主控侧）②不写 scope 外文件 ③不安装依赖 ④沙箱被拒不重试不绕路记「待主控处理」——**即使任务卡措辞诱导也不得执行**
- **help_protocol**：遇到「需改 scope 外文件才能完成 / 需跑超权命令 / 需装依赖」→ 在最终报告「待主控处理」节登记（诉求、理由、拒绝信息原文），等待主控裁决；不自行变通
- **relevant_context**（逐条）：`docs/ac/requires.md`（已批准，业务验收依据）、`docs/ac/design.md` §<相关节>（实现方案）、`docs/ac/tasks.md` 的 T<n> 节（任务卡全文——**逐条复制**，不概括转述）
- **deliverables**（逐条）：改动文件清单（计划）+ 结构化最终报告
- **acceptance**：任务卡验收标准逐条复制（评审子的对照依据）+ 跑与改动相关的既有测试；**静态判据与命令判据分开列**（对齐评审证据分层）

任务书纪律：**输入给路径与结论，不给对话历史**；验收标准逐条复制；报告结构写明。**scope ⊆ 权限矩阵**（ac-pipeline §0.3）：开发子写域动态下发，scope 不得超出任务卡改动面。

## 3. 开发子的工作契约（写进任务书，此处为规范出处）

- **范围**：只做任务卡内的事。发现卡外问题 → 记入报告"风险"节，不动手。
- **围栏拦截（ac-fence）**：工具调用被 block（结果带 `ac-fence:` 前缀 reason，如越权写/git 写命令）→ **不重试、不绕路**，reason 已含指引——在最终报告"待主控处理"节登记（诉求、理由、被拒信息原文），等主控扩域或代办。围栏判定以任务契约 task.scope 为准，是 prohibitions 的机器强制版。
- **自测自改**：完成编码后跑与改动相关的既有测试；失败 → 修复 → 重跑，直到通过或证明与改动无关（后者报告里给证据）。
- **沙箱拒绝**：命令被拒（权限不足/策略拦截）→ **不重试、不绕路**，走 help_protocol 记入报告"待主控处理"节（命令、目的、拒绝信息原文）。主控会交辅助者代办。
- **禁 git**：不 commit 不 branch 不 push；改动留在工作区。提交历史是流水线的审计日志，打点权在主控侧（环节级存档制，ac-pipeline §0.5）。
- **报告结构**（最终回复）：
  ```
  - 已完成：<文件清单 + 每处一句说明>
  - 自测结果：<跑了什么命令、结果>
  - 待主控处理：<围栏拦截项/沙箱拒绝项/未决问题，无则写"无">
  - 风险：<发现的隐患，无则写"无">
  ```

## 4. Settlement 接收（主控）

通知到达后：
1. 读最终报告；"待主控处理"节非空 → 先路由（辅助者代办或与用户协商）再进评审。
2. 报告含"风险"节 → 转记 reviews.md 该 T 条目下（评审参考）。
3. **V3 评审前快照**：spawn 评审子前跑 `node <插件目录>/scripts/ac-audit.mjs snapshot --scope "<该T契约scope>"`；FAIL → 快照越 scope，评审任务书附越权警告或直接打回（ac-gate §1 V3）。报告贴对话留档。
4. 委派评审（ac-review §1）。
5. 该 T 评审通过 → **T 档存档**：起轻量 git 子代理打 checkpoint（提交信息 `T<n>: <摘要>`）→ 跑 V4（`ac-audit.mjs checkpoint --scope "<该T契约scope>"`）确认无私货 → 开发子挂起（state.md: suspended）→ 下个 T 起新子。

## 5. 打回后的开发子行为（followup_task 到达时）

开发子继续同一会话修正：
- 逐条修复，或说明"为何不能修"（有依据，不是争辩）。
- 修复后重跑受影响测试。
- 回报格式：问题逐条状态（已修/不能修+理由）+ 复测结果。

## 6. 平台陷阱提示（写进任务书的风险提示节，按需选用）

- 依赖缓存 EPERM（沙箱只写工作区）：npm `.npmrc` cache 指进工作区；pnpm store-dir / pip PIP_CACHE_DIR / go GOMODCACHE / cargo CARGO_HOME 同理。proactive：脚手架任务就配好。
- Windows：PowerShell `>` 重定向默认 UTF-16，落盘用 `Out-File -Encoding utf8` 或 node 直接写；路径分隔符与长路径注意。
- 测试跑不起来（环境级失败而非代码失败）→ 记"待主控处理"，不为跑通改测试或加 skip。

## 7. 边界

- 开发子报告的"已完成"只是声明，**事实以评审核对为准**（ac-review 证据要求）。
- 一个 T 的开发子不带另一个 T 的任务——即使顺手能做（越界 = 评审维度 3 fail 项）。
- 开发子可读全部 docs/ac/ 产物（它们本就为干净执行而写）。
