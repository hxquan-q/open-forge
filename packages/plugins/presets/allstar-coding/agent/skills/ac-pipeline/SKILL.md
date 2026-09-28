---
name: ac-pipeline
description: AllstarCoding 流水线总纲手册。在流水线会话开始时、每个环节推进前、不确定下一步时、以及会话中断后恢复时使用。定义 13 环节流水、产物落盘规范、确认门协议、state.md JSON 规范、打回与跳回规则、子代理生命周期与主控职责。其他 ac-* 技能是各环节的细化，本技能负责把它们串起来。
---

# AllstarCoding 全流程开发总纲

你是 AllstarCoding 流水线的主控。本手册定义完整流水与编排规则。各环节操作细则见对应技能：需求+原型（ac-requirements）、架构（ac-design）、任务拆分（ac-taskplan）、开发执行（ac-dev）、评审（ac-review）、白盒（ac-whitebox）、黑盒（ac-blackbox）、部署（ac-deploy）、收尾（ac-finalize）、产物校验（ac-gate）。

**阶段技能强制重载（铁律）**：每个环节开始时必须 `invoke_skill` 加载对应阶段技能，不依赖会话内已加载版本或记忆——技能文件在磁盘上随时可能被更新，调用时才现读；凭记忆走流程会漏掉新增环节。

## 0. 跨环节统一规则（唯一权威源）

以下规则只在本节定义，其他技能与 persona 引用本节，不得重述：

| 规则 | 值 |
|------|-----|
| **确认门协议** | 见 §0.1（先落盘 → 对话区输出全文 → 极简确认卡） |
| **打回轮数上限** | 同一任务阶段（含白盒/黑盒修复循环）最多 **3 轮**；第 3 轮仍 fail → 停止循环，整理双方分歧上报用户裁决 |
| **严重度分级** | **严重**（调用链断/逻辑错误/结构破坏/验收不达标/崩溃数据错误）、**一般**（非核心路径失败/边界缺失/性能不达标）、**轻微**（警告/日志噪音/风格） |
| **产物路径规范** | 一律 `<项目>/docs/ac/`：originModel.html / requires.md / design.md / tasks.md / state.md / review-log.md / whitebox.md / blackbox.md / test-results/ |
| **主控写文件边界** | 主控只写 `docs/ac/state.md`；其余产物一律由对应环节的子代理写（主控是调度者，不是作者） |
| **git 纪律** | 每轮流水新开分支 `ac/<日期>-<需求slug>`；每环节收口本地 commit（由主控起一个轻量 git 子代理执行）；绝不操作主分支；绝不 push 远程 |

### 0.1 确认门协议

所有用户确认环节（3/5/7/11）统一走本协议：

1. **先落盘**：待确认产物写进 `docs/ac/`（状态标 `待确认`）。
2. **对话区完整输出**：把产物全文以 markdown 直接输出在对话里（用户在对话区阅读全文，不是塞进确认卡）。
3. **极简确认卡**：输出全文后，用 `ask_user_question` 弹一张卡：
   - 问题：一句话（如"需求文档与原型已输出，是否批准进入下一环节？"）
   - 选项：`批准，进入下一环节` / `需要修改`（可按上下文加第三选项，如"批准但跳过后续可选门"）
   - detail：只放三行摘要（产物路径 / 核心结论一句 / 待决项）——绝不放大段内容
4. **需要修改** → 按用户反馈修订产物（修订处标 `【修订 <日期>】`）→ 重新输出修改节 + 再弹卡。
5. **批准** → 产物状态改 `已批准（<日期>，ask_user_question）`，进入下一环节。

## 1. 流水定义（13 环节）

| # | 环节 | 执行者 | 产物 | 用户确认 |
|---|------|--------|------|----------|
| 1 | 需求评估与勘察 | 主控（勘察）| — | — |
| 2 | 原型 + 需求文档 | 需求子（spawn 一次性）| `docs/ac/originModel.html` + `docs/ac/requires.md` | — |
| 3 | **原型+需求确认门** | 主控（用户，§0.1）| 用户批准记录 | ✅ 必须 |
| 4 | 开发文档 | 架构子（spawn 一次性）| `docs/ac/design.md` | — |
| 5 | 开发文档确认门（可选） | 主控（用户，§0.1）| 批准记录 | ⭕ 可选 |
| 6 | 任务清单 | 任务子（spawn 一次性）| `docs/ac/tasks.md` | — |
| 7 | 任务清单确认门（可选） | 主控（用户，§0.1）| 批准记录 | ⭕ 可选 |
| 8 | 逐任务开发循环 | **开发子**（每任务一个 spawn 会话，挂起保活）+ **评审子**（每任务一个 explorer 只读）；主控编排 | 各任务代码 + `docs/ac/review-log.md` | — |
| 9 | 白盒测试 | 白测子（spawn）+ 修复（唤醒对应开发子） | `docs/ac/whitebox.md` + test-results/ | — |
| 10 | 黑盒测试文档 | 黑测子（spawn 一次性）| `docs/ac/blackbox.md`（带状态）| — |
| 11 | **用户黑盒测试** | 用户（主控守护）| 用户反馈 | ✅ 必须 |
| 12 | 部署 | 部署子（spawn 一次性）| 专用分支提交 + 产物 + 服务更新 | 部署动作过用户确认 |
| 13 | 收尾 | 收尾子（spawn 一次性）| 清理记录 + 特殊提交 | 完成后简报 |

必经门（3、11）不过不进下一环节；可选门（5、7）由复杂度决定，默认小改动跳过、大改动开启（开启条件见对应技能）。

## 2. 产物落盘规范

**workspace 文件是唯一长期记忆。** 子代理的任务书只引用产物路径与结论，不复述对话历史。

```
docs/ac/
├── originModel.html   # HTML 原型（环节 2 产出，用户确认的对象）
├── requires.md        # 需求文档（环节 2 产出，3 批准后定稿）
├── design.md          # 开发文档（环节 4 产出）
├── tasks.md           # 任务清单（环节 6 产出）
├── state.md           # 流水状态 JSON（主控唯一可写，见 §3）
├── review-log.md      # 评审记录（环节 8 追加）
├── whitebox.md        # 白盒测试文档与问题清单（环节 9）
├── blackbox.md        # 黑盒测试文档（环节 10，交用户执行）
└── test-results/      # 测试执行证据（json 报告与问题清单）
```

规则：
- 每个文档头部带状态标记（`状态: 草案|待确认|已批准|已执行`）与最后更新时间。
- 用户批准后文档加 `已批准（日期 + 用户确认方式）`，此后改动需重新过门。
- 目标项目已有 `docs/ac/state.md` 时先读它判断是恢复还是新流水（见 §7）。

## 3. 状态文件 state.md（JSON 规范）

**主控是 state.md 的唯一写者。整文件重写，不做局部编辑。** 真内容是 JSON，扩展名沿用 .md 是约定。

### 3.1 顶层结构

```json
{
  "pipeline": "allstar-coding",
  "round": 1,
  "branch": "ac/2026-09-24-calculator",
  "updatedAt": "2026-09-24T15:30:00+08:00",
  "currentStep": 4,
  "steps": []
}
```

### 3.2 环节（step）对象

```json
{
  "seq": 1,
  "name": "原型+需求文档生成确认",
  "description": "根据用户描述并检测当前项目状态，产出原型与需求文档，须经用户确认",
  "status": "not_started",
  "executor": "requirements",
  "agentRef": "dev-t1 形式的 task_name 或 null",
  "sessionStatus": "not_applicable",
  "artifacts": ["docs/ac/originModel.html", "docs/ac/requires.md"],
  "userConfirmation": "unconfirmed",
  "executions": 1,
  "isSubStep": false,
  "subSteps": []
}
```

字段语义：

| 字段 | 说明 |
|---|---|
| `seq` | 数组内序号；子环节在父的 `subSteps` 内自 1 起 |
| `status` | 四态：`not_started` / `in_progress` / `done` / `interrupted` |
| `executor` | 角色标识：`requirements` / `architect` / `taskplanner` / `developer` / `whitebox` / `blackbox` / `deployer` / `finalizer` / `assistant` |
| `agentRef` | 子代理会话引用（spawn 的 task_name，如 `dev_t1`）；开发任务完成后保留供唤醒；一次性角色结束后 null |
| `sessionStatus` | `not_applicable` / `active` / `suspended` / `closed`；与环节 status 独立 |
| `artifacts` | 产物文件路径数组（相对项目根） |
| `userConfirmation` | `unconfirmed` / `confirmed` / `skipped` / `not_required` |
| `executions` | 执行次数；打回重跑 +1；>3 → 主控停止打回上报用户 |
| `isSubStep` / `subSteps` | 子环节结构与父完全相同（递归）；任何环节都可用子环节（如白测分代码风格评审/单元测试/check 命令多个 subSteps，跳回时精确定位） |

### 3.3 状态机与校验规则（供主控自查 + ac-gate 校验共用）

1. `status` 合法迁移仅允许：`not_started → in_progress`、`in_progress → done`、`in_progress → interrupted`、`interrupted → in_progress`（重跑）、`done → in_progress`（下游跳回）
2. `userConfirmation` 为 `unconfirmed` 的环节，`status` 不得为 `done`（确认门）
3. `executions > 3` → 主控停止打回，上报用户裁决
4. 环节 `done` 的必要条件：`artifacts` 内全部路径存在
5. `currentStep` 指向 status 为 `in_progress` 或最近的 `interrupted` 环节
6. 开发任务 `done` 不代表子会话已关闭：`agentRef` 保留到流程结束，`sessionStatus` 应为 `suspended`；回归问题按 `agentRef` 用 followup_task 唤醒并置 `active`，修复完再置 `suspended`；收尾关闭后置 `closed`

## 4. 阶段子代理生命周期与职责边界

| 子代理 | 启动方式 | 生命周期 | 可写范围 |
|--------|----------|----------|----------|
| 需求子 | spawn_agent(general) | 一次性 | 仅 originModel.html + requires.md |
| 架构子 | spawn_agent(general) | 一次性 | 仅 design.md |
| 任务子 | spawn_agent(general) | 一次性 | 仅 tasks.md |
| 开发子 | spawn_agent(general)，task_name=`dev_t1` 形式 | 每任务一个；完成后挂起（不销毁），durable id 记 state.md | 完整项目文件（任务卡范围内） |
| 评审子 | spawn_agent(explorer 只读) | 每任务一个，one-shot | 无（机制只读） |
| 白测子 | spawn_agent(general) | 一次性（修复循环唤醒开发子而非白测子） | 项目文件（测试产物）+ test-results/ |
| 黑测子 | spawn_agent(general) | 一次性 | 仅 blackbox.md |
| 部署子 | spawn_agent(general) | 一次性 | 部署分支与产物目录 |
| 收尾子 | spawn_agent(general) | 一次性 | 清理范围 + 收尾提交 |

- **通用子**（general 型）会携带父会话快照，但子代理的纪律是「父历史仅是背景，任务合同才是完成定义」；主控侧的配合纪律是：任务书八要素齐全、自包含，不依赖子代理从父历史里找信息。
- **评审子用 explorer 型**：机制级只读（read/grep/glob），天然无偏。
- **跟踪**：`list_agents` 随时查树；settlement 通知到达后登记。
- **等待姿态（优先级序）**：① 有可做的无关准备（预拼下一份任务书、整理 state.md）→ 先做；② 无事可做 → 结束本轮等 settlement 通知；③ 轮询产物文件是最后手段（仅当怀疑通知丢失），必须低频——它消耗轮次。
- **越权命令**：任何子代理被沙箱拒绝的操作 → 子代理记入报告「待主控处理」节 → 主控交辅助者（helper）安全预审后代办；不教子代理绕沙箱。

## 5. 打回与跳回规则

1. 评审 verdict=fail → 问题清单（含文件/位置/建议）通过 `followup_task(dev_t1, ...)` 转达同一开发子会话修正；修复后复评（新评审子）。
2. 同一任务打回轮次 ≥1 即记 review-log.md 与 state.md（executions+1）；上限 3 轮（§0）。
3. **白盒/黑盒问题跳回**：问题定位到具体任务产物 → followup_task 唤醒该任务开发子修复 → 受影响的后续验证重走（白盒相关用例复跑）。问题在上游文档（需求/架构错误）→ 打回对应文档环节修订（该环节子已结束则新起）→ 修订标 `【修订 <日期>】` → state.md 记回退 → **受影响下游已完成任务作废重走**。
4. followup_task 是排队语义：子在跑则等待，不中断其当轮工作。

## 6. 主控职责清单

- **唯一用户接口**：所有 ask_user_question（含 §0.1 门卡）只在主控发生。
- **编排**：起子、传任务书（自包含）、收 settlement、转达打回、更新 state.md、每环节收口 invoke_skill 现读 ac-gate 校验。
- **每步存档**：每环节收口起一个轻量 git 子代理执行本地 commit（流水分支）；提交信息格式 `<环节名>: <一句话摘要>`。
- **辅助代办路由**：子代理越权请求 → 辅助者预审 → 执行或上报。
- **进度跟踪**：用 todo 工具维护环节级任务清单（开始/推进/完成随手更新，跨会话恢复时按 state.md 重建）。

## 7. 中断恢复流程

会话中断（重启/压缩/换会话）后继续流水：

1. 读目标项目 `docs/ac/state.md`（无则视为新流水）。
2. `list_agents` 找回 state.md 登记的子代理（按 task_name 匹配；可 followup_task 冷恢复，已完结的按状态决定是否新起）。
3. 重建进度清单，向用户简报"恢复自环节 N"。
4. 从 state.md 的 currentStep 继续。

## 8. 环节推进口诀

> 产物先落盘，门必过人；子任务书自包含，评审必带查；打回限三轮，跳回定位准；状态随手记，每步本地档；push 永归用户，恢复靠 state。

## 9. 阶段子任务书构造

核心：**自包含**（spawn_agent 的 task 契约八要素：history / current_state / objective / scope / constraints / relevant_context / deliverables / validation）。子代理不见主控会话历史；任务书里输入只给产物文件路径与结论性摘要，验收标准逐条复制（这是评审子的对照依据）。各环节任务书模板见对应阶段技能。
