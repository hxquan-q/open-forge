---
name: esign-craft
description: "电子表单工坊·板块2 电子签名手册：向已生成的电子表单页（form.html）注入电子签名组件。当队长派工任务要求注入签名、表单含 [电子签] 字段、或用户要求签名/重签/签名锁定能力时加载本技能。覆盖身份验证弹窗、手写笔迹录入、缩放回填、清空重签、审核锁定全流程。"
---
<!-- Copyright The Open Forge contributors. -->

# 电子表单工坊·板块2 电子签名（esign-craft）

目标：把 form.html 里的 signature 占位框升级为完整的电子签名能力——用户点击签名框 → 弹窗身份验证（演示账号）→ canvas 手写录入 → 笔迹缩放回填签名栏 → 未生效可清空重签 → 审核通过后锁定不可改。

一切注入遵守 eform-craft 技能 §6 共享契约（锚点/键名/桩函数——那是唯一权威源，本技能不重述定义，只引用）。

## 0. 统一规则

| 规则 | 值 |
|------|-----|
| **写域** | 只改派工任务书指定的 `docs/eform/<slug>/form.html`，且只在 ESIGN-ANCHOR 界内写签名组件块 + 按 §6.2 激活 signature 占位 div；不改页面其他内容、不改 schema.json、不碰其他文件 |
| **幂等注入** | 重复注入先移除旧组件块（以锚点注释与组件块标记注释为界）再写新块；锚点行本身永不删改 |
| **样式隔离** | 组件类名一律 `eform-esign-` 前缀；CSS 全部带此前缀，不污染页面既有样式 |
| **数据写入** | 只写 `records[].signatures[F#]`（经 EFORM.saveRecord），不碰 values/status 等其他字段 |
| **演示明示** | 验证弹窗标题与页脚必须带「演示验证」字样；不伪装真实鉴权 |

## 1. 签名数据模型（写入 records[].signatures）

```jsonc
{
  "F9": {                          // 键 = signature 字段的 F#
    "state": "signed",             // pending | signed | locked
    "dataUrl": "data:image/png;base64,…",   // 手写笔迹（缩放后的签名栏尺寸图）
    "signer": "admin",             // 通过验证的用户名
    "signedAt": "2026-10-10T10:30:00",
    "width": 300, "height": 120    // 原始画布尺寸（重签时按此重建）
  }
}
```

状态机：`（空）→ pending（验证通过/手写完成未确认）→ signed（确认回填）→ locked（记录 approved 时自动）`。locked 后清空/重签按钮禁用，点击签名栏提示「表单已审核，签名已锁定」。

## 2. 交互流程（组件必须实现的完整链路）

1. **点击签名栏**（state=empty 或 pending）→ 打开验证弹窗；state=signed 允许「清空重签」入口；记录状态 approved → 一律提示锁定并拒绝。
2. **验证弹窗**：标题「电子签名 - 身份验证（演示）」；字段：用户名、密码；说明行「演示环境：内置演示账号，正式环境由 MES 统一鉴权」；按钮 取消/验证。
   - 演示账号本地比对：`admin / admin123`（失败 3 次锁定 30 秒，倒计时显示；账号信息写在弹窗说明行内明示「演示账号 admin」）。
   - 验证失败 → 行内错误提示，不关闭弹窗。
3. **手写录入**（验证通过后弹窗切换到手写页）：canvas 画板（约 600×240，笔迹颜色 #1a2b4a、线宽 3、圆头）；支持鼠标与触控（pointerdown/move/up）；「清除笔迹」清画布；「确认签名」在画布为空时禁用。
4. **回填**：确认后把画布等比缩放导出为签名栏尺寸 dataURL，写入 signatures[F#]（state=signed），签名栏内 `<img>` 显示笔迹 + 灰字小注「签署人 admin · 2026-10-10 10:30」。
5. **清空重签**（state=signed 且记录未 approved）：签名栏悬停出现「清空重签」小按钮 → 点击直接清空该 F# 的 signatures 条目回到 empty（无需再验证），可重新走签名流程。
6. **锁定联动**：组件监听页面 `eform:audit:approve` 事件（或每次打开记录时读 EFORM.recordStatus）——记录 approved 时全部签名置 locked：签名栏加锁定角标，点击/清空均拒绝。

## 3. 注入物清单（ESIGN-ANCHOR 界内的组件块）

1. `eform-esign-styles`：弹窗/画板/签名栏/锁定角标的 CSS（全前缀）。
2. `eform-esign-dialog`：验证+手写两页弹窗的 HTML 模板（默认 display:none）。
3. `eform-esign-script`：初始化逻辑——扫描 `document.querySelectorAll('.eform-sig-slot[data-fid]')`，为每个 signature 占位绑定点击与状态渲染；读写经 window.EFORM 桩函数；不重定义桩函数。

## 4. 验收要点（注入后自查，向队长报告）

- [ ] 每个 signature 字段：空位可点击 → 验证（错密码被拒、admin/admin123 通过）→ 手写 → 确认回填显示笔迹与签署人小注。
- [ ] 清空重签：signed 态可清空重走流程；连续 3 次密码错误出现 30 秒锁定倒计时。
- [ ] 锁定：记录提交审核通过后签名全部锁定，清空/点击均被拒并提示。
- [ ] 幂等：重复注入后页面无重复组件、无重复绑定（点击签名栏只开一个弹窗）。
- [ ] 锚点行原样在场；页面其他内容零改动（注入前后 diff 仅组件块）。
- [ ] 弹窗与页脚「演示验证」明示在场。

## 5. 边界

- 真实 CA 证书/数字摘要/时间戳 → 终期能力，弹窗说明行与验收报告注明「演示签名，无数字证书」。
- 多个 signature 字段各自独立签名（每个 F# 一份 signatures 条目，互不联动）。
- 手写画布为空点确认 → 按钮禁用（不产生空签名）。
- 记录 draft/saved 态签名可清空重签；approved 一律锁定（与 eform-craft §3.2 状态机一致）。
