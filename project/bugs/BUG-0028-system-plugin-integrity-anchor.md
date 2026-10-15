---
id: BUG-0028
type: bug
status: done
priority: P0
owner: apps/desktop
source: agent-browser 现场测试（dev 启动日志全部系统插件被完整性校验拒绝）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
created: 2026-09-25
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 内置插件完整性清单锚定源码 plugin.json，全部系统插件运行时校验被拒

## 用户操作流程

1. 正常启动 Desktop（开发模式 `bun run dev` 或安装打包产物）；
2. 打开「设计」「能力」等依赖系统插件的页面；
3. 使用依赖 `vetta-actions` 公共 Action（`skills.query`、`webhook.query` 等）的功能。

## 实际行为与期望行为

- 实际：`SystemPluginCatalog` 发现阶段对**全部 14 个**已 staging 的系统插件报
  `内置完整性校验失败（plugin.json 指纹不匹配）` 并拒绝加载。开发模式下插件还能靠
  dev-link 兜底，但 dev-link  ephemeral 实例的 `trustLevel` 是 `local`，于是
  `vetta-actions` 注册 `publicId`（`webhook.query`、`skills.query` 等约 30 个）被
  `PLUGIN_ACTION_RESERVED_ID_DENIED` 全部拒绝，插件整体加载失败；`vetta-ui-design`
  侧出现「读取设计列表失败」错误通知。打包环境没有 dev-link 兜底，所有系统插件
  将无法加载，属于发布阻断级问题。
- 期望：staging 里是什么字节，清单就锚定什么字节；系统插件正常通过完整性校验，
  dev-link 从 base plugin 继承 `trustLevel: "official"`，`vetta-actions` 的公共
  Action 正常注册。

## 最小复现

```powershell
# 任一 preset：归档内 plugin.json 与源码 plugin.json 字节不同（打包归一化）
cd packages/plugins/presets
python -c "import zipfile,hashlib; z=zipfile.ZipFile('vetta-ui-design/release/vetta-ui-design-0.7.2.vettapkg'); print(hashlib.sha256(z.read('plugin.json')).hexdigest(), hashlib.sha256(open('vetta-ui-design/plugin.json','rb').read()).hexdigest())"
# 两个值不同 -> manifestSha256（源码哈希）永远匹配不上解包产物
```

## 影响

- 打包产物中所有系统插件（含 vetta-actions、vetta-ui-design、preset-agent 等 14 个）
  在发现阶段全部被拒，等同于「没有任何内置能力」的发布包；
- dev 模式下 dev-link 走 ephemeral 路径（`persisted: false`），信任级别降级为
  `local`，公共 Action id 注册被信任门拒，插件功能连锁失效。

## 根因

`build-presets.mjs` 生成完整性清单时 `manifestSha256` 取自
`presets/<id>/plugin.json` **源码文件**；而 `.vettapkg` 内的 `plugin.json` 经
plugin-vite 归一化（压缩空白），与源文件字节不同。staging 解出的是归档字节，
运行时按字节比对必然失败。此前未发现是因为运行时校验与清单生成分属两条链路，
且 dev 环境有 dev-link 遮盖了「staged 插件全灭」。

## 回归测试

- `apps/desktop/scripts/plugins-integrity-manifest.node-test.mjs` 新增
  「manifestData 锚定归档内字节，源码 plugin.json 排版差异不影响校验」：
  旧实现（只能传 `manifestPath` 源码文件）在该场景下校验必失败。

## 修复与验证

- 修复：`createPluginIntegrityEntry` 新增 `manifestData`（归档内 plugin.json
  原始字节）入参；`build-presets.mjs` 改为用 AdmZip 读取归档内 `plugin.json`
  计算指纹，归档缺该文件时直接报错。
- 测试：`node --test scripts/plugins-integrity-manifest.node-test.mjs`（6/6 通过）。
- 实机验证：`bun run dev` 重启后启动日志中 `内置完整性校验失败` 0 条（修复前 14 条）、
  `app-action-register` 错误 0 条（修复前约 30 条）、`Failed to load plugin` 0 条；
  设计画廊正常渲染且无错误通知。
- 未运行及原因：完整打包链路 `prepare:pack` 未实跑（耗时长），由同一
  `stageSystemPluginsFromArchives` 路径推定一致；`bun run check` 全量未跑。
