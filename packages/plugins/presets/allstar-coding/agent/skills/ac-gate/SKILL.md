---
name: ac-gate
description: AllstarCoding 流水产物校验技能。主控在每个环节收口时必须加载本技能，执行 V1-V6 硬校验节点（含 scripts/ac-audit.mjs 机器校验）与 G1-G5 清单核对——文件存在性、state.md 状态机合法迁移、artifacts 与实际文件对应、executions 与评审记录一致、环节级存档（T 档/stage 档）在位。不通过不放行下一环节。
---
<!-- Copyright The Open Forge contributors. -->

# AC 产物校验门（v2：机器校验 + 提示词清单）

目标：用硬性校验防止子代理"以为自己完成了实际没完成"，并抓取**越权写入**。主控在每个环节收口时现读本技能，逐项执行；**任何一项不通过，本环节不放行**。

> 分层：机器可判部分由 `scripts/ac-audit.mjs`（插件包内自带，只读）执行，主控贴报告为证；语义可判部分（内容配得上环节名等）由主控按清单核对。**事中拦截已由 ac-fence 围栏承担**（ac-pipeline §0.8：子代理越权工具调用在执行前 block，拦截记录落 `docs/ac/fence-log.jsonl`）；本技能的 V2/V3/V4 校验是事后双链对账——围栏 fail-open 放走的越权仍会被这里抓到，两层缺一不可。

## 0. ac-audit.mjs 用法速查

在目标项目根执行（`<插件目录>` = 本插件安装路径；报告全文贴对话留档）：

```
node <插件目录>/scripts/ac-audit.mjs matrix                                # 打印权限矩阵（V1 自查对照）
node <插件目录>/scripts/ac-audit.mjs snapshot --scope "<glob>,<glob>"      # V3 评审前快照
node <插件目录>/scripts/ac-audit.mjs checkpoint --scope "<glob>,<glob>"    # V4 存档点
node <插件目录>/scripts/ac-audit.mjs gate --since <startedAt> --roles <角色,角色> --scope "<契约scope>"   # V2 环节收口
```

退出码：0=PASS，1=越权 FAIL，2=环境错误（也视为不放行）。时间锚取 state.md 该环节 `startedAt`（ISO 8601 带时区）。git 轨迹链与 mtime 链均已排除 state.md（主控预期写入）。

## 1. 校验清单（逐项执行，全部贴证据）

### V1 派发前（spawn 任何子代理前）

- [ ] 契约 scope ⊆ §0.3 权限矩阵该角色写域（`ac-audit.mjs matrix` 打印对照；开发子等动态写域角色则核 scope ⊆ 任务卡改动面）
- [ ] state.md 当前步 artifacts 声明与将派发的 deliverables 一致
- 声明越域 → **拒绝派发**，主控自查修正契约后再来。

### V2 环节收口（核心节点，先于 G 清单）

```
node <插件目录>/scripts/ac-audit.mjs gate --since "<本环节 startedAt>" --roles "<本环节参与角色>"
```

- [ ] 报告结论 PASS（双链并集 ⊆ 参与角色写域并集；开发子环节附 `--scope "<该T契约scope>"`）
- FAIL → 越权清单进 §0.6 SOP：冻结 → 核查 → 订正 → 记录 → 处置完毕后**重跑本节点**再继续。
- [ ] `docs/ac/fence-log.jsonl` 本环节时间段内无未处置拦截记录（有 → 按 §0.6 处置：子代理确实越权未走 help_protocol，或契约 scope 拼错需扩域重派）

### G1 产物存在性

对本环节 state.md 声明的每个 `artifacts[]` 路径：

```
node -e "const fs=require('fs');for(const p of [<逐个路径>]){try{const s=fs.statSync(p);console.log(p, s.size+'B')}catch(e){console.log(p, 'MISSING')}}"
```

判定：全部存在且非 0 字节 → 通过。任一 MISSING 或 0B → 不放行，环节打回（executor 子仍可用则 followup_task，否则新起）。

### G2 state.md 状态机合法性

读 `docs/ac/state.md`（JSON parse；parse 失败本身即不通过——state.md 必须始终是合法 JSON）：

- [ ] 本环节 status 迁移合法：`not_started → in_progress` → `in_progress → done`（或本环节为 interrupted/重跑场景，见 ac-pipeline §3.3 迁移表——不在表内的迁移一律违规）
- [ ] `userConfirmation` 为 `unconfirmed` 的环节 status 不为 `done`（确认门完整性）
- [ ] 本环节 `executions ≤ 3`；>3 → 已该上报用户（核对是否已上报记录）
- [ ] `currentStep` 指向本环节（刚完成的环节序号）或下一环节（已推进时）
- [ ] 开发任务 subStep：`status: done` 时 `agentRef` 非空且 `sessionStatus ∈ {suspended, closed, not_applicable}`（done 却 active = 未挂起，违规）
- [ ] 子环节（subSteps）的 seq 在父内连续、结构与父同构
- [ ] `startedAt`/`endedAt` 时间锚在位（V2 双链比对的边界，缺失即违规）

### G3 artifacts 与实际内容对应（抽查）

不只是存在——内容要配得上环节名（防"空壳文件"）：

- 需求环节：requires.md 含需求条目表与验收标准节；originModel.html 含 R# 标注与可交互元素
- 架构环节：design.md 含改动面清单（文件路径级）与"必须同步"节
- 任务环节：tasks.md 含 T# 任务卡，每卡有依赖/任务/验收标准字段
- 白盒环节：whitebox.md 含测试计划表与结果回填；test-results/ 有问题清单
- 黑盒环节：blackbox.md 结果总表两列（自测/核验）覆盖全部用例，取值合法（✓/✗/豁/空），✗ 与豁必有对应 P# 条目；头部含执行模式/探测记录字段
- 评审环节：reviews.md 有本 T 条目（§0.4 节格式：`## T<n> · 第 <轮> 评审` + verdict + 问题清单 + 证据）

### G4 executions 与评审记录一致

对照 reviews.md（ac-pipeline §0.4）与 state.md 打回计数：

- 本环节 executions = 1 + 打回次数（首轮执行 + 每次 followup_task 打回各计一次）
- reviews.md 该 T 的轮次数与 state.md executions-1 一致；**最新节 verdict == 开发子/评审子口头回报的 verdict**（不一致 = 报告与落盘脱节，以落盘为准并按 §0.6 记录）
- 不一致 → 以事实链（通知记录/reviews.md）为准修正 state.md 后重验

### G5 存档已执行（每环节收口）

- [ ] 开发循环环节：评审 pass 的每个 T 都有对应 T 档提交（`git log --oneline` 核对 `<T编号>: <摘要>` 在案）
- [ ] 其余（子）环节 done：有对应 stage 档提交（`stage <seq>/<环节名>: <摘要>` 在案），或按 §0.5 归并规则并入相邻档（门环节无独立改动 / 环节 8 收口与最后 T 档重合时）
- [ ] 最新 checkpoint 跑过 V4：`ac-audit.mjs checkpoint --scope "<该档写域>"` PASS（提交带私货 → 拒绝打点，回 V2 处置）
- 无存档 → 补 git 存档子代理任务（打点 + V4 复核）后再放行。

## 2. 执行规范

1. **证据贴对话**：每项核对贴命令输出（不是"我记得有"）；ac-audit 报告全文贴。
2. **不通过处置**：定位责任（产物缺失/状态违规/存档遗漏/越权写入）→ 打回对应执行者（followup_task 优先）或走 §0.6 SOP → 修复后重跑本门。
3. 校验本身三连失败 → 上报用户（可能是系统性问题，不是单点疏漏）。
4. 全部通过 → state.md 该环节定稿（`endedAt` 写入）→ **打档**（§0.5：T 档或 stage 档，经轻量 git 子代理 + V4）→ 进下一环节（invoke_skill 下一环节技能）。

## 3. V5/V6 节点（非收口时机）

- **V5 会话恢复**：中断恢复时先 G2（state.md 完整性）+ V2 重放（`--since <恢复点 startedAt>`，恢复点之后的改动重查）。账本损坏 → 停在恢复门，上报用户裁决（不自动修复）。
- **V6 终局**：收尾环节做全流水 git 轨迹总对账——每个 commit 落在某 T 写域内 + artifacts 全存在 + 无游离提交。游离提交/缺失产物 → 收尾报告列出，用户门裁决（详见 ac-finalize）。
