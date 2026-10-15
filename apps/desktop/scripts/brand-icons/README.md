<!-- Copyright The Open Forge contributors. -->
# 分发档品牌图标源

外部分发档（`VETTA_BRAND_PROFILE=distribution`，英文 Allstr ai）的打包图标来自这张原始素材，
不要在 `build/brand/distribution/` 手改产物——改素材或改算法后重跑生成器，把脚本与产物一并提交。

- 源素材：`Allstar2.png`（11068x10917，唯一事实源）
- 生成脚本：`../gen-brand-icons.mjs`
- 产物落地：`../../build/brand/distribution/{icon.ico,icon.png,icon.icns,icon-dock.png}`，
  打包时由 `../prepare-pack.js` 覆盖暂存 `build/icon.*`（exe 图标、安装器图标与运行时窗口/托盘图标同源）。
- 复现命令：`bun scripts/gen-brand-icons.mjs`（在 `apps/desktop` 下执行）

**必须用 Bun 运行。** Node 自带的 zlib 会产出像素完全相同、容器字节不同的 PNG/ICO/ICNS，
`../gen-brand-icons.node-test.mjs` 按字节比对复现结果，用 Node 跑会直接判负。
