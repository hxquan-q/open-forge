<!-- Copyright The Open Forge contributors. -->
## 修复

- 修复 `browser_tab` 截图对模型不可见的问题：此前 screenshot 成功只返回 `screenshot captured attachment=…` 纯文本，图片仅落盘到内部缓存，attachmentId 对模型是无效引用，视觉模型也拿不到画面，只能自行摸索缓存目录。现在整页截图与元素裁剪截图都会把 PNG 直接内联进工具结果（与 computer_observe 截屏一致），视觉模型当场可见；纯文本模型自动降级为提示文案（原始图片仍保留在历史中，切回视觉模型可重放）。截图缓存与界面元素选择胶囊的 attachmentId 合同不变。
