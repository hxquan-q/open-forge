---
id: WAIVER-0002
rule: Apache-2.0 §4(b) 修改声明头审计（scripts/quality/check-modified-file-notices.mjs）
status: resolved
owner: scripts/quality
reason: fork 相对上游的修改文件中存在 671 条存量声明头缺失（2026-09-27 快照）；仓库处于多会话并行活跃期，一次性 --write sweep 会与在途编辑大面积冲突，按 ISSUE-0023 推荐先落地 ratchet 门禁
risk: 存量缺失在 sweep 前持续存在，Apache 修改声明合规面不完整；基线文件若无人收缩会长期化
compensation: check-guards 以 --baseline ratchet 运行，快照之外的新增缺失一律判负，存量只允许减少；修复声明头后用 --write-baseline 收缩快照；出现无并行代码线的安静窗口时执行一次性 --write sweep 并删除基线
created: 2026-09-27
expires: 2027-03-31
---
<!-- Copyright The Open Forge contributors. -->

# 修改声明头存量缺失基线豁免

## 适用范围

`scripts/quality/baselines/modified-file-notices.txt` 快照中列出的存量缺失路径。
快照之外（新文件、新修改文件）缺失声明头一律不豁免。

## 复审

到期前由 owner 评估：已出现安静窗口并完成 sweep → 删除基线文件、本 waiver 置
`resolved`；仍需延期 → 新建 waiver 并附剩余规模证据（`missing=` 计数）。

## 销账记录（2026-11-18，TASK-0127）

- 实测清零：`node scripts/quality/check-modified-file-notices.mjs` 输出
  `changed=3129 covered=2880 excluded=249 missing=0 unclassified=0`；带基线运行同样为
  `missing=0 unclassified=0`、`ratchet: waived=0 new=0`，快照 651 条全部修复，
  不再存在需要抵扣的存量。
- 尾量处置：机器生成的 `docs/architecture/dependents.md` 改为在
  `scripts/quality/context-boundary-lib.mjs` 的 `renderDependents()` 多输出一行声明头，
  随 `--write-dependents` 重生成，未手改产物；其余 6 个修改文件各插入一行声明头。
- 门禁切换：删除 `scripts/quality/baselines/modified-file-notices.txt`；
  `scripts/quality/check-guards.mjs` 中该守卫去掉 `--baseline` 参数，改为纯审计运行，
  `missing!=0` 即非零退出。本 waiver 不再作为任何门禁放行依据。
- 残余风险：门禁失去 ratchet 抵扣后，任何修改文件缺声明头立即判负；同时失去
  `--baseline` 分支里「无 `upstream` remote 时回落基线 sha、仍不可用则告警放行」的兜底，
  环境缺少 `upstream/dev` 时守卫会直接报错而非跳过，需要在有 `upstream` 的主检出或先
  `git fetch upstream` 后运行。
