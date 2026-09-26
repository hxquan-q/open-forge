---
id: WAIVER-0002
rule: Apache-2.0 §4(b) 修改声明头审计（scripts/quality/check-modified-file-notices.mjs）
status: active
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
