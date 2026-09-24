---
id: ISSUE-0001
type: issue
status: done
priority: P0
owner: release/product
related_requirement: [REQ-0003]
related_plan: [PLAN-0003]
source: exprot/rebrand-plan.md
created: 2026-09-22
updated: 2026-09-22
---

# 品牌化发布基建决策（已冻结）

## 决策结果（15 项最终值）

品牌名 **Open Forge**；尚无自有域名，域名类字段一律用 GitHub 仓库 URL 过渡，取得域名后一次性切换。

| # | 决策项 | 最终值 |
|---|---|---|
| 1 | 域名体系 | **暂无自有域名**。官网/docs/releases 链接统一过渡为 `https://github.com/hxquan-q/open-forge`；releases 走 GitHub Releases 无需域名；`docs.*`/`releases.*`/`api.*` 子域规划推迟到购域后 |
| 2 | 更新基建 | **GitHub Releases：`hxquan-q/open-forge`**。`VETTA_UPDATE_PROVIDER=github` 为开源默认；generic provider 必须显式 `VETTA_UPDATE_URL`（fail-closed，已删上游默认 feed） |
| 3 | Marketplace 仓库 | **`hxquan-q/open-forge-marketplace`**（gh-pages 分支，待建仓）。source id 保留 `vetta-official`（持久化内部标识，用户不可见）；显示名改 `Open Forge Official`；repo 常量已改 |
| 4 | 协议 scheme | **改：`openforge://`**。OAuth 回调需服务端放行——当前开源构建 `VETTA_CLOUD_ENABLED=false`，无在网客户端，直接改无迁移 |
| 5 | appId / bundle id | **改：`io.github.hxquanq.openforge`**（无域名期用 GitHub 反域保证全局唯一；Android applicationId 禁连字符，两端统一此值）。代价：macOS TCC 权限需重新授权，发布说明需告知 |
| 6 | 数据目录 | **改：`~/.openforge`**（dev：`.openforge-dev`）。无在网客户端，迁移只需「写新读旧」一次性说明，不做双向迁移器 |
| 7 | 中继部署 | **保持现有自有部署**（`relay.flowerwine.dpdns.org` 已是自有 Cloudflare 账号 + dpdns 域）；worker 名改 `openforge-remote-relay`，`wrangler.jsonc` 的 `name`/`routes` 同步，`DEFAULT_RELAY` 常量不变 |
| 8 | 线协议标识 | **保留** `vetta.remote.v1` / `X-Vetta-*` 头（两端同步代价 > 收益）；schema `$id` 域名部分待有域名后改 |
| 9 | npm scope | 内部 `@vetta/*` **保留**（保上游合并）；对外 7 个已发布包改 **`@openforge/*`**（需先注册 npm org） |
| 10 | Android applicationId | **改：`io.github.hxquanq.openforge`**（未上架是唯一窗口） |
| 11 | Android 服务端端点 | **待自有后端**；开源构建 `VETTA_CLOUD_ENABLED=false` 已隔离，端点留占位待补 |
| 12 | `vetta-serv` 代号 | 随品牌改 **`openforge-serv`**；SECURITY.md、`.coderabbit.yaml`、ADR 引用同步 |
| 13 | `.vettapkg` 扩展名 | **保留**（生态合同，改则破坏上游插件兼容） |
| 14 | 遥测 | **默认关闭产品遥测**（无自有 PostHog 项目）；代码路径保留，待自有项目后复接 |
| 15 | 远端 helper 足迹 | **改：`openforge-ssh-helper` + `~/.cache/openforge/helper/`**；`HELPER_PROTOCOL_VERSION` 命名空间保留，TS/Go 两份字面量必须同步 |

## 更新源与安装身份的硬校验要求（已落实）

- `resolve-update-publish-config.mjs`：generic provider 缺 `VETTA_UPDATE_URL` 时构建直接失败，不再回退任何默认 feed；github provider 缺 owner/repo 同样失败。
- `OPEN_SOURCE_BUILD_DEFAULTS` 更新坐标锁定 `hxquan-q/open-forge`，新增回归测试钉死防漂移。
- `desktop-packaged.yml` 发布矩阵注入新坐标；`verify-update-feed` 继续对产物做公开可读性检查。
- Linux 打包元数据（author/maintainer/homepage）改 Open Forge 身份。

## 迁移与重新授权影响

- macOS TCC（辅助功能/屏幕录制/麦克风/本地网络）按新 bundle id 视为新应用，首次发布说明必须告知重新授权；`Vetta Computer Use` helper 同。
- Windows AppId GUID、`DefaultDirName`、`VETTAUPDATE`/`VETTASTOREROOT` 参数名、`%LOCALAPPDATA%\vetta-updater` 全部改新值——当前 fork 无在网客户端，直接改零迁移成本；一旦发布过再改需迁移路径。
- `vetta://` → `openforge://`：Windows 注册表由新安装包写入；旧链接失效（当前无分发）。
- `~/.vetta` → `~/.openforge`：首次启动读旧目录迁移说明即可。
- `@openforge/*` npm org 需先注册占位再改发布链。

## 上游同步与冲突预算

- 品牌改动集中在少数文件（构建脚本常量、`site.ts`、i18n、installer），不做全仓字符串替换；`@vetta/*`、IPC `vetta:`、`VETTA_*` 环境变量、线协议名全部保留。
- 以 `upstream/dev` 定期 merge 同步；品牌常量逐步收拢到单一事实源。

## 后续

PLAN-0003 阶段 A（决策冻结）完成；阶段 B 已顺手落实更新链硬校验与打包坐标（P0-1/2/3/4 的核心部分），剩余打包身份（prepare-pack/installer.iss/scheme/helper）及 C–F 阶段继续按 PLAN-0003 顺序推进。
