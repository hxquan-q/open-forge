# Open Forge 更名施工图（品牌资产清查与实施计划）

> 目标仓库：`C:\Users\xquan\Desktop\open-forge`（openvetta/open-vetta 的商用 fork）
> 新品牌名：**Open Forge**（logo、域名、更新基建待定）
> 方法：5 维度并行清查 → 对照核查（对抗性） → 完整性批评 → 盲区补扫，共 105 条 findings
> 范围：全仓（排除 `node_modules`/`dist`/`release`/`.git`/`exprot`）
> 本文只做规划，未修改任何生产代码，未提交 Git。

---

## 0. 结论摘要

### 足迹规模

| 标识类型 | 命中行数 | 文件数 | 性质 |
|---|---|---|---|
| `@vetta/` 内部包 scope | 4064 | 1725 | 内部标识符（保留） |
| `@vetta-org/` 已发布 npm scope | 2335 | 1591 | **用户可见**（7 个已发包） |
| `VETTA_*` 环境变量 | 1540 | 327 | 内部标识符（保留） |
| `vetta:` IPC 频道前缀 | 1464 | 195 | 内部标识符（保留） |
| `~/.vetta` 数据目录 | 337 | 195 | 用户可见（路径出现在文档与终端） |
| `openvetta.com` 域名 | 103 | 29 | **用户可见** |
| `electron-updater` 更新链路 | 55 | 24 | **运行时行为（阻断项所在）** |
| i18n 品牌串（en/zh） | ~190 | 17 | **用户可见** |

### 分级统计

| 等级 | 数量 | 含义 |
|---|---|---|
| **blocker** | 16 | 商用阻断：用户可见商标，或安全风险（更新通道指向上游） |
| **high** | 48 | 商用前必须处理 |
| **medium** | 29 | 应处理 |
| **low** | 12 | 可延后 |
| **合计** | **105** | |

### 三条最重要的结论

1. **更新通道是本项目唯一的"会自动改写用户产物"的路径。** `desktop-build-environment.mjs:9-12` 与 `resolve-update-publish-config.mjs:3` 的默认值都指向上游（`openvetta/open-vetta` + `releases.openvetta.com`）。漏配一次，商用用户就会被静默升级成上游构建——品牌回退 + 供应链越权。核查阶段已将此项从"待决策"升级为 **ship-blocker，必须显式配置 + 加硬校验**。
2. **更名代价的大头不是字符串替换，而是"身份标识符"的迁移。** `appId: com.vetta.desktop`（TCC 权限主体）、Windows AppId GUID（升级身份）、`vetta://` 协议（OAuth 回调 + 深链）、`~/.vetta`（用户数据）、`@vetta-org/*`（npm 包）这五类一旦变更，都会产生**需要迁移或重新授权**的后果，而不是简单的文本替换。
3. **当前 fork 尚未分发过客户端，这是最有利的时间点。** 因为没有任何在网客户端，所有"身份标识符"都可以一次性干净改掉，与上游彻底隔离；一旦发布过，每一项都要付迁移成本。**建议在首次商用发布前完成全部 P0/P1。**

---

## 1. P0 — 商用阻断（发布前必须清零）

| # | 项目 | 位置 | 现值 | 处置 |
|---|---|---|---|---|
| P0-1 | **更新通道默认指向上游** | `apps/desktop/scripts/desktop-build-environment.mjs:9-12` | `VETTA_UPDATE_PROVIDER=github`, `VETTA_UPDATE_GITHUB_OWNER=openvetta`, `VETTA_UPDATE_GITHUB_REPO=open-vetta` | 改默认值 + **加硬校验**：远程 provider 未显式配置时构建失败（堵住静默指上游） |
| P0-2 | **更新 feed 默认 URL 指向上游** | `apps/desktop/scripts/resolve-update-publish-config.mjs:3` | `DEFAULT_UPDATE_URL = "https://releases.openvetta.com/desktop/stable"` | 改为自有 CDN，或 generic 模式下强制要求显式配置 |
| P0-3 | **CI 打包流水线写死上游坐标** | `.github/workflows/desktop-packaged.yml:101,103,104,105` | `VETTA_OPEN_MARKETPLACE_REPOSITORY=openvetta/vetta-official-marketplace`、`VETTA_UPDATE_GITHUB_OWNER=openvetta`、`VETTA_UPDATE_GITHUB_REPO=open-vetta` | 换为新组织坐标；**新组织与新更新源就绪前，禁止用此 workflow 发布任何产物** |
| P0-4 | **内置市场来源指向上游且不可移除** | `apps/desktop/src/main/abilities/open-marketplace/official-marketplace-source.ts:9-12` | `DEFAULT_MARKETPLACE_SOURCE_ID="vetta-official"`、`OFFICIAL_MARKETPLACE_REPOSITORY="https://github.com/openvetta/vetta-official-marketplace"` | 改常量 + 新 marketplace 仓库；该来源在 UI 中锁定不可停用（见 `CHANGELOG.md:57`） |
| P0-5 | 打包身份（macOS/全平台真源） | `apps/desktop/scripts/prepare-pack.js:743-756` | `appId:"com.vetta.desktop"`, `productName:"Vetta"`, `executableName:"Vetta"`, `protocols.name:"Vetta"` | 改为 Open Forge 身份（见 §3 破坏面警告） |
| P0-6 | Windows 安装器身份 | `apps/desktop/build/installer.iss:15-25` | `AppName=Vetta`、`AppPublisher=Vetta`、`DefaultDirName={localappdata}\Programs\Vetta`、`OutputBaseFilename=Vetta-{ver}-win-{arch}`、`AppId={{A2B92798-...}}`、`[Registry] HKCU\Software\Classes\vetta` | 显示身份全改；更新契约标识符（AppId GUID/目录/参数名）见 §3 |
| P0-7 | 仓库首屏品牌 | `README.md` / `README.zh-CN.md`（各 42/40 处） | `<h1>Open Vetta</h1>`、`alt="Open Vetta"`、5 枚 shields badge 指向 openvetta.com/docs/Discord、CodeRabbit badge 的 owner/repo | 待新域名/新组织/新 Discord 就绪后整体重写 |
| P0-8 | 文档站品牌与链接真源 | `apps/docs-site/lib/site.ts` | `DEFAULT_DOCS_SITE_URL="https://docs.openvetta.com"`、`site.name:"Vetta"`、`title:"Vetta 文档"`、`marketingUrl`/`downloadUrl`/`githubUrl`/`discordUrl` | 改此一处切换站点身份，但四个外链与 `logoPath`（旧图标）均待新基建 |
| P0-9 | 文档站正文 | `apps/docs-site/content/**` | 269 处命中 / 69 个文件（中英双语镜像） | 分三类处理：品牌名→改；外链→待基建；`vetta_*.deb`/`~/.vetta` 等产物路径→与打包口径统一（不改会导致文档里的命令失效） |
| P0-10 | Android 应用标识 | `apps/kotlin/androidApp/build.gradle.kts:23,27` | `namespace="org.vetta.android"`、`applicationId="org.vetta.android"` | 改（Android 用 applicationId 识别应用，商店上架前可改；上架后不可） |
| P0-11 | CLI 命令名（用户直接输入） | `apps/cli-host/package.json:7-12` 等 | 6 个 bin：`vetta`、`vetta-agent`、`vetta-cli-app`、`vetta-agent-rpc`、`vetta-plugin`、`vetta-plugin-cli` | 改（用户可见）；注意 `~/.vetta/agent/bin/vetta` shim 与 mac 二进制路径联动 |
| P0-12 | 第三方平台注册身份（飞书） | `apps/im-gateway/cmd/im-gateway/host_feishu.go:21-22` | `feishuBotName="Vetta"`、`feishuBotDesc="Vetta 编程助手，在飞书私聊里直接和你的项目对话。"`、`feishuRegisterSource="vetta-im-gateway"` | 改（用户扫码建应用时预填，直接可见） |
| P0-13 | Windows 更新兼容标识 | `apps/desktop/scripts/resolve-update-publish-config.mjs` + `installer.iss` 参数 | `VETTAUPDATE`/`VETTASTOREROOT`/`VETTAPROGRESS` 参数名、`%LOCALAPPDATA%\vetta-updater` 差量缓存 | 见 §3：无在网客户端 → 一并改；有 → 保留并做迁移 |
| P0-14 | macOS 独立授权主体 | `apps/desktop/scripts/build-appshot-helper.js:1,6,24` | `APP_NAME="Vetta Computer Use"`（独立 bundle，独立 TCC 主体） | 改（见 §3：用户需重新授权屏幕录制） |
| P0-15 | 与上游安装共存冲突 | `prepare-pack.js:743`(appId) + `installer.iss`(AppId/DefaultDirName) | 与上游完全相同的 AppId GUID、安装目录、协议注册名 | 改（否则新安装器会把同机上用户已装的上游 Vetta 当同一产品**就地升级并接管**） |
| P0-16 | 默认中继端点（硬编码） | `apps/desktop/src/renderer/domains/settings/components/RemotePairingSettings.tsx:8` | `DEFAULT_RELAY = "https://relay.flowerwine.dpdns.org"` | 改为自有中继部署（见 §2 决策 7） |

---

## 2. 需要你决策的事项（15 项，含建议）

| # | 决策项 | 现状 | 建议 | 波及 |
|---|---|---|---|---|
| 1 | **新域名体系** | `openvetta.com` / `www.` / `docs.` / `releases.` 四类 | 建议 `openforge.app` 或 `.com`，四类一次规划；docs 可用子域或独立域 | P0-2/7/8/9、P1 全部文档 |
| 2 | **更新基建** | GitHub releases（上游 org）+ `releases.openvetta.com`（R2+Cloudflare） | 新 GitHub 组织 + 自有 R2/CDN；`VETTA_UPDATE_PROVIDER` 二选一（github / generic） | P0-1/2/3 |
| 3 | **Marketplace 仓库** | `openvetta/vetta-official-marketplace`（gh-pages 分支） | 新 org 下建同名能力市场仓库 | P0-4 |
| 4 | **协议 scheme 是否改** `vetta://` | 用于 OAuth 回调（`vetta://oauth/callback`）与远程配对深链 | **建议改**（如 `openforge://`）。代价：已分发链接失效（当前无）、**OAuth 回调需服务端同步放行**、Windows 需新安装包重写注册表 | P0-5/6、cloud/auth、remote-control |
| 5 | **appId/bundle id 是否改** `com.vetta.desktop` | macOS 用 bundle id 识别应用 | **建议改**（如 `com.<你的公司>.openforge`）。代价：TCC 已授权项（辅助功能/屏幕录制/麦克风/本地网络）全部失效需重新授权；签名/公证链按新身份重建 | P0-5/15 |
| 6 | **数据目录是否改** `~/.vetta` | `DEFAULT_CONFIG_DIR_NAME=".vetta"`（`packages/action-rpc/src/endpoint-file.ts:15`），dev 用 `.vetta-dev` | **建议改**（如 `~/.openforge`）。理由：与上游正式版共存时数据完全隔离，避免互相覆盖；代价：需迁移器与文档同步 | P1 数据面、`~/.vetta/runtimes`、凭据库 |
| 7 | **中继如何部署** | `apps/remote-relay/wrangler.jsonc`：`name="vetta-remote-relay"`、硬编码 `account_id="0357cf29270289865e31d10d38ffecec"`、域名 `relay.flowerwine.dpdns.org` | 部署到自有 Cloudflare 账号 + 自有域；改 `name`/`account_id`/`routes`/`DEFAULT_RELAY` 三处 | P0-16、P1（线协议见 #8） |
| 8 | **线协议标识是否改** | `REMOTE_WEBSOCKET_PROTOCOL="vetta.remote.v1"`、`X-Vetta-*` 头、`$id:"https://openvetta.com/schemas/..."` | **建议保留线协议内部名**（`vetta.remote.v1`、`X-Vetta-*`）：客户端/中继同步发布即可，改则需两端锁版本升级。但 schema `$id` 的域名部分建议改 | P2 |
| 9 | **npm scope** | `@vetta-org/`（7 个**已发布**包：ui/capability-sdk/theme-sdk/theme-ui/plugin-sdk/plugin-vite/plugin-cli）；`@vetta/`（内部，4064 处） | **建议：内部 `@vetta/*` 保留**（保上游合并能力）；**对外 `@vetta-org/*` 改**（第三方插件作者会看到，属品牌面）。两者可分离 | P0-11、P1 |
| 10 | **Android applicationId** | `org.vetta.android` | 改（未上架是唯一窗口） | P0-10 |
| 11 | **Android 服务端端点** | `apps/kotlin/.../AppPreferences.kt:104` `DEFAULT_SERVER_URL="https://api.openvetta.com/api/v1"` | 待后端就绪后改 | P1 |
| 12 | **`vetta-serv` 私有服务端代号** | 出现在 `SECURITY.md`、`.coderabbit.yaml:47,149`、ADR 引用 | 随品牌一并改名 | P2 |
| 13 | **`.vettapkg` 插件包扩展名** | 打包布局、测试、i18n 文案均引用 | **建议保留**：生态合同，改则破坏与上游插件的兼容；或双扩展名过渡 | P2 |
| 14 | **遥测是否保留** | `product-analytics.ts:6` / `main/telemetry/index.ts:12` → PostHog（`us.i.posthog.com`，第三方，非上游） | 决定是否保留遥测；保留则换自有 PostHog/Sentry 项目 | P1 |
| 15 | **远端 helper 足迹是否改** | `~/.cache/vetta/helper/<ver>/vetta-ssh-helper`（装在**别人的机器**上） | 改（`vetta-ssh-helper`→新名）；注意 `HELPER_PROTOCOL_VERSION="1.1.0"` 是远端安装目录名 + 握手兼容依据，TS/Go 两份字面量必须同步 | P2 |

---

## 3. 改名的功能性破坏面（施工前必读）

这六项不是文案替换，改动会产生**运行时行为变化或用户需要重新操作**：

| # | 破坏面 | 机制 | 处理 |
|---|---|---|---|
| 1 | **macOS TCC 权限全部失效** | 系统按 bundle id 识别应用；`com.vetta.desktop` 变更后，已授予的辅助功能、屏幕录制、麦克风、本地网络权限视为新应用 | 改名是必然的；需在发布说明与首启引导中明确告知用户重新授权；`Vetta Computer Use` helper 同理（独立 TCC 主体） |
| 2 | **macOS「修复已损坏」静默失败** | `build/repair.applescript` 硬编码 `/Applications/Vetta.app`；`docs/adr/0003` 已明示此风险 | 必须同步改 AppleScript；否则 DMG 三图标版式里的修复入口会误报"请先拖入 Applications" |
| 3 | **Windows 升级链与共存冲突** | AppId GUID 是升级身份：改了→旧构建无法被覆盖、程序列表出现两条；不改→新安装器把同机上已装的上游 Vetta 当同一产品**就地覆盖接管** | **当前 fork 无在网客户端 → 建议一并改掉**（AppId GUID、`DefaultDirName`、`%LOCALAPPDATA%\Vetta`、更新参数名），与上游彻底隔离。若未来已有客户端，则须保留参数名并写迁移 |
| 4 | **更新 feed 兼容** | 产物名进入 electron-updater 清单（`latest.yml`）；改名后若远端 feed 未同步，老客户端检查不到更新 | 改名与 feed 切换须**同一次发布**完成；加 `verify-update-feed` 类断言 |
| 5 | **打包守卫硬耦合 scope** | `prepare-pack.js:254` 正则 `/^\s*import(?:...)?\s+["']@vetta\//` 与报错文案校验打包产物无外部 workspace import | 改 scope 必须同步改此守卫 + `check-turbo-config.mjs`、`check-source-path-maps.mjs` 等测试，否则 CI/打包直接失败 |
| 6 | **远端主机残留** | helper 安装在别人机器的 `~/.cache/vetta/...`，代码中**没有远端卸载/清理流程**（`helper-deployment.ts:62-78` 只做上传复验） | 改名后旧版本残留为孤儿目录；需补一个清理路径或文档说明 |

---

## 4. Apache-2.0 合规清单

| 项 | 现状 | 处置 |
|---|---|---|
| `LICENSE` | 完整未改的 Apache-2.0 原文（附录仍为占位符 `Copyright [yyyy] [name of copyright owner]`） | **保持不动**。§4.1 要求随分发附带副本；实际署名落在 NOTICE / 源文件头，不改 LICENSE |
| `NOTICE` | 头部 `Open Vetta` / `Copyright 2026 Vetta` / `This product includes software developed at Vetta (https://www.openvetta.com)`；正文纯 Apache-2.0 声明；下方 THIRD-PARTY 逐条列出 pi(MIT)、bubblewrap(LGPL-2.0+) 等 | **保留全部第三方段落原样**（§4.4 不得删除原有署名），仅重写本地署名段并**追加 §4.2 修改声明**（注明"本作品为 Open Vetta 的修改版，由 Open Forge 维护"）。当前缺口：文件内没有修改声明的位置 |
| 第三方署名 | pi（`packages/ai|agent|coding-agent|ecosystem-adapter` 派生自 pi）、bubblewrap（Linux 安装器未修改二进制，LGPL-2.0+） | 一律保留，**不得列为改名对象**；bubblewrap 保持未修改分发即可合规 |
| 贡献者许可 | 无 CLA，贡献按 Apache-2.0 | 无需处理 |
| 商标 | Apache-2.0 不授予商标权 | 用户可见品牌必须全部替换（本施工图 P0/P1 即为此） |

---

## 5. 建议施工顺序

> 顺序原则：先冻结决策 → 再改"发布出去就难改"的身份 → 再改文案 → 最后文档。每阶段可独立验证。

**阶段 A — 决策冻结**（对应 §2 的 15 项）
不写代码。产出：域名/组织/更新基建/marketplace/协议 scheme/appId/数据目录的最终取值。理由：这些决定下面每一步的替换目标，先改后定会全量返工。

**阶段 B — 构建与更新身份**（P0-1~6, 13~15）
更新通道默认值 + 硬校验、`prepare-pack.js` 身份、`installer.iss`、协议 scheme、`build-inno-installer.mjs` 产物名、更新参数名。
验证：`bun run test:desktop:packaging`、`bun run verify:desktop:contracts`、`bun run test:pkg desktop`、并加断言锁死"executableName / 产物名 / feed 名"三者一致。

**阶段 C — 用户可见文案**（P0-7~9、P1 i18n）
i18n en/zh 各 ~97/93 处、8 处硬编码 UI 品牌（`AssistantMessage.tsx:167` 作者名、导出文件名、`"Vetta Claw"`、`"Vetta Go"`、`"Vetta Vivi"`、quickpanel 占位符、MCP `hostInfo.name`）、5 个 HTML `<title>`、`banner.txt` ASCII 字形（注意新名 10 字符，需重新设计版式）。
验证：`bun run check:quick` + i18n 相关定向测试；视觉检查需你明确授权才运行 `verify:ui:*`。

**阶段 D — 第三方与生态身份**（P0-11/12、P1）
CLI bin 名、飞书应用预填名、Signal 设备名、MCP OAuth `client_name`（`mcp-oauth-service.ts:14`、`supervisor.ts:27-28,75`）、`User-Agent: Vetta-Desktop`（4 处）、插件 `author`（~17 个 `plugin.json`）、内置 MCP 名与 `X-Vetta-Client-Version` 头。
验证：Go 侧 `apps/im-gateway/Makefile` 定向测试（根 `bun run check` 不覆盖 Go）。

**阶段 E — 数据与远端足迹**（P1/P2）
数据目录（+迁移器）、凭据库 service 名、`~/.vetta/runtimes`、helper 名与远端目录、Android 标识。
验证：迁移测试（新写/旧读/缺字段/中断恢复/重复投影）——对照 `exprot/data-layout-and-migration.md` §6。

**阶段 F — 文档与社区**（P0-7~9、P1/P2 文档面）
README/QUICKSTART/CONTRIBUTING/SECURITY、`docs/`（623 个 md 中 18 个含品牌 token）、docs-site 正文 269 处 + SEO/OG 图硬编码、`.github` 模板与 contact link、Discord 新服务器、release-notes 引用格式。
验证：核对链接/命令/路径真实存在。

---

## 6. 建议保留的内部标识符（keep-vetta）

| 项 | 位置 | 保留理由 |
|---|---|---|
| `@vetta/*` 内部包 scope（4064 处） | 各 `package.json` | 用户不可见；改名收益低于与上游合并的成本 |
| `vetta:` IPC 频道前缀（1464 处） | `plugin-capability-ipc.ts` 等 | 纯内部协议，用户不可见 |
| `VETTA_*` / `VETD_*` 环境变量（1597 处） | 构建与运行时配置 | 内部契约；改名会同时破坏 CI 与文档 |
| `HELPER_PROTOCOL_VERSION` 命名空间 | `helper-client.ts:10` / `protocol.go:21` | 远端安装目录名与握手校验依据，改则需远端清理 |
| 线协议 `vetta.remote.v1` / `X-Vetta-*` 头 | `remote-control`、`remote-relay` | 中继内部协议，改需两端同步升级 |
| `.vettapkg` 扩展名 | 打包布局、测试、i18n | 生态合同，改则破坏插件兼容 |

> 上述保留项的共同前提：**它们都不出现在用户面前**。若某一项实际会被用户看到（如 npm 包名、CLI 命令名），则必须改——已单列进 P0。

---

## 7. 上游同步策略建议

- **最小化 divergence**：把"品牌"与"功能"分开。品牌改动集中在少数文件（`prepare-pack.js` 身份段、`installer.iss`、`site.ts`、i18n 目录、常量文件），**不做全仓字符串替换**（尤其不要动 `@vetta/*`、`vetta:`、`VETTA_*`），这样后续 `git merge upstream/dev` 的冲突面最小。
- **建议建立品牌常量单一事实源**：把产品名、域名、组织、更新坐标集中到一个模块（如 `apps/desktop/src/shared/brand.ts` + 构建期注入），避免出现本施工图里"同一事实在 5 处各自硬编码"的情况。
- 上游分支为 `dev`（README/CONTRIBUTING 明确 PR 目标为 `dev`），建议 fork 侧以 `upstream/dev` 为同步源，定期 merge 而非 rebase。

---

## 8. 未覆盖 / 待确认

- **本文档基于静态扫描**：未运行应用、未触发真实更新流程、未验证签名/公证链。阶段 B 实施后需用打包产物做一次真实的更新链路验证。
- **`apps/mobile`（Expo）与 `apps/kotlin` 仅部分覆盖**：移动端 bundle id、`User-Agent: vetta-android/0.1.0` 已列，但移动端发布流程（EAS/商店）未清查。
- **`apps/docs-site` 的 Vercel 项目名**（`vetta-docs`）与 DNS 迁移步骤需在阶段 F 细化。
- **远端 helper 清理流程缺失**属代码缺口（非改名项），已记录在 §3-6，建议单独立项。
- **治理文件缺失**：无 `CODE_OF_CONDUCT.md`、无 `.github/CODEOWNERS`。不是改名对象，但商用化后在**新组织**下建议补建。

---

## 附：证据索引

完整 105 条 findings（含 `changeImpact`、`verified`、`breakageRisk`、`missedBlockers`）保存在工作流输出：

```
C:\Users\xquan\AppData\Local\Temp\claude\C--Users-xquan-Desktop-open-forge\
  372a0a31-d111-4db9-ac13-9ec3c0a5be0c\tasks\wplue6rz8.output
```

核查阶段对 blocker/high 逐条做了对抗性验证，其中两项建议被修正：
- 更新通道：由"待决策"**升级为 ship-blocker / 必须显式配置 + 硬校验**。
- Windows 安装器：原判断只讲了"改了就断链"，**漏了"不改就会静默接管同机上用户已装的上游 Vetta"**——裁决标准是 fork 是否已有在网客户端（当前无 → 建议一并改）。
