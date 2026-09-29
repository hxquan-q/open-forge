---
name: ac-gate
description: AllstarCoding 流水产物校验技能（v1 提示词层）。主控在每个环节收口时必须加载本技能，按清单逐项核对环节产物——文件存在性、state.md 状态机合法迁移、artifacts 与实际文件对应、executions 与打回记录一致。不通过不放行下一环节。
---
<!-- Copyright The Open Forge contributors. -->

# AC 产物校验门（v1 提示词层）

目标：用硬性清单防止子代理"以为自己完成了实际没完成"。主控在每个环节收口时现读本技能，逐项核对；**任何一项不通过，本环节不放行**。

> v2 升级预留：校验逻辑未来硬化为插件注册的校验工具（真实代码执行文件检查/JSON schema 校验/git 状态断言），主控每环节必须调用且通过才放行。v1 在提示词层由主控按本清单执行。

## 校验清单（逐项执行，全部贴证据）

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

### G3 artifacts 与实际内容对应（抽查）

不只是存在——内容要配得上环节名（防"空壳文件"）：

- 需求环节：requires.md 含需求条目表与验收标准节；originModel.html 含 R# 标注与可交互元素
- 架构环节：design.md 含改动面清单（文件路径级）与"必须同步"节
- 任务环节：tasks.md 含 T# 任务卡，每卡有依赖/任务/验收标准字段
- 白盒环节：whitebox.md 含测试计划表与结果回填；test-results/ 有问题清单
- 黑盒环节：blackbox.md 每条用例带状态字段
- 评审环节：review-log.md 有本 T 条目（轮次/verdict/摘要）

### G4 executions 与打回记录一致

对照 review-log.md（或 state.md 打回计数）：

- 本环节 executions = 1 + 打回次数（首轮执行 + 每次 followup_task 打回各计一次）
- review-log.md 该环节的轮次数与 state.md executions-1 一致
- 不一致 → 以事实链（通知记录/review-log）为准修正 state.md 后重验

### G5 git 存档已执行

`git log --oneline -3`（只读）：本环节收口提交在案（提交信息含环节名）。无提交 → 补一个 git 存档子代理任务再放行。

## 执行规范

1. **证据贴对话**：每项核对贴命令输出（不是"我记得有"）。
2. **不通过处置**：定位责任（产物缺失/状态违规/存档遗漏）→ 打回对应执行者（followup_task 优先）→ 修复后重跑本门。
3. 校验本身三连失败 → 上报用户（可能是系统性问题，不是单点疏漏）。
4. 全部通过 → state.md 该环节定稿，进下一环节（invoke_skill 下一环节技能）。
