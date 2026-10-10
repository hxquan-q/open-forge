---
id: TASK-0224
type: task
status: verifying
priority: P1
owner: release/desktop
requirement: REQ-0011
plan:
source: REQ-0011（用户要求 dev 启动与打包统一换成小爱ai / Allstr ai；承接品牌档案开关既有实现 367a34540 / 8157246cd / 559b5f32e）
related_requirement: [REQ-0011]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: main-workspace
base_commit: d202d3c61
read_paths: [apps/desktop/src/shared/desktop-brand.ts, apps/desktop/src/shared/desktop-brand.test.ts, apps/desktop/vite.config.ts, apps/desktop/vite.main.config.ts, apps/desktop/scripts, apps/desktop/src/renderer/renderApp.tsx]
write_paths: [apps/desktop/src/shared/desktop-brand.ts, apps/desktop/src/shared/desktop-brand.test.ts, apps/desktop/vite.config.ts, apps/desktop/vite.main.config.ts, apps/desktop/scripts/prepare-pack.js, apps/desktop/scripts/build-appshot-helper.js, apps/desktop/scripts/desktop-packaging-layout.mjs, apps/desktop/scripts/desktop-packaging-layout.test.mjs, apps/desktop/scripts/linux-packaging-contract.mjs, apps/desktop/scripts/ui-verification.mjs, apps/desktop/src/renderer/index.html, apps/desktop/src/renderer/onboarding.html, apps/desktop/src/renderer/pet.html, apps/desktop/src/renderer/quickpanel.html, apps/desktop/src/renderer/remote-desktop-host.html, apps/desktop/src/renderer-ocr/index.html, apps/desktop/.env.example, .github/release-notes/v0.1.3.md, project/requirements/REQ-0011-brand-profile-default-distribution.md, project/requirements/REQ-0003-open-forge-rebrand.md, project/requirements/README.md, project/tasks/TASK-0224-brand-profile-default-distribution.md, project/tasks/README.md]
exclusive_paths: [apps/desktop/src/shared/desktop-brand.ts, apps/desktop/scripts/prepare-pack.js]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# dev 与打包默认品牌口径切换为外部分发（Allstr ai / 小爱ai）

## 目标

1. 未设置 `VETTA_BRAND_PROFILE` 时，dev 启动、构建与打包一律按 `distribution` 档案：应用名、界面文案、窗口标题、页面图标、打包产品名/图标/安装器身份 = Allstr ai（英文）/ 小爱ai（中文界面）。
2. `VETTA_BRAND_PROFILE=self` 显式选档保留 Open Forge 口径，能力不删除、只翻转默认。
3. 兼容标识（executableName `OpenForge` / appId / bundleId / 数据目录 / 协议）跨档冻结不变。
4. 全链一致：4 个决策点（共享品牌层、renderer define、main define、prepare-pack）与 4 个此前固定读 self JSON 的辅助脚本站位对齐到同一开关。

## 范围

### 并发评估

- 结论：不支持（单一 concern、跨 20 余个文件的行为切换，串行最稳）。
- 执行方式：serial
- 可并行 Task：无（`project/` 台账存在他人未提交条目 `BUG-0082`，本次只追加自己的文件，不改动它）
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`
- Branch：main
- Worktree：main-workspace（未声明独立 worktree）
- 集成负责人：本次实施者（串行）
- 集成顺序：不适用

### 做

- 默认档翻转（4 处同一语义，`=== "distribution"` 归一改为 `=== "self" ? "self" : "distribution"`）：
  - `src/shared/desktop-brand.ts`（运行时共享品牌层，含 i18n post-processor 档位）；
  - `vite.config.ts`（renderer define 归一）；
  - `vite.main.config.ts`（main define 归一）；
  - `scripts/prepare-pack.js`（品牌 JSON 选源 + 打包图标覆盖条件改为非 self）。
- 辅助脚本随档（此前固定读 `desktop-brand.json`，翻转后与主链矛盾）：
  - `scripts/build-appshot-helper.js`（dev 与打包共用；不改会让 macOS 主进程按 Allstr ai 名字找不到 helper）；
  - `scripts/ui-verification.mjs`（dev 验证流程按窗口标题找主窗口，改为接受当前档的名称集合）；
  - `scripts/desktop-packaging-layout.mjs`（`.vettapkg` 文件关联显示名随档）；
  - `scripts/linux-packaging-contract.mjs`（Linux 包 author/vendor/maintainer 随档）。
- 静态 HTML 标题 6 处改为默认档（Allstr ai 口径），运行时标题机制不变。
- `.env.example` 品牌段注释改为新默认并说明显式 `self`。
- 测试：
  - `src/shared/desktop-brand.test.ts`：未设置 = distribution、显式 self = Open Forge、显式 distribution 三态；静态标题合同改为默认档；第一块 self 归一合同在导入前钉住 self 档；
  - `scripts/desktop-packaging-layout.test.mjs`：文件关联随档（默认 distribution / 显式 self）与冻结字段。
- 发布说明：`.github/release-notes/v0.1.3.md`「改进」追加一条（用户可见：dev 与打包默认品牌切换）。

### 不做

- 不改两档品牌 JSON、`brand-assets/` 图标、`build/brand/distribution/` 产物与 `gen-brand-icons` 生成链。
- 不改兼容标识、更新通道、数据目录与凭据定位。
- 不改 i18n 归一字面与 post-processor 语义；不新增环境变量。
- 不做真实打包与发布；不跑 `verify:ui:*`（未获本次授权）。
- 不动 docs-site / mobile 品牌资产与 REQ-0003 的其余品牌清查批次。

## Given / When / Then

- Given：工作区未设置 `VETTA_BRAND_PROFILE`；When：dev 启动或打包；Then：主窗口标题为「小爱ai」（中文界面）/「Allstr ai」（英文界面），侧栏品牌区图标为 distribution 资产，打包 productName / 安装器身份 / 暂存 `build/icon.*` 为 Allstr ai。
- Given：显式 `VETTA_BRAND_PROFILE=self`；When：dev 启动或打包；Then：Open Forge 品牌与图标回归（与切换前默认一致）。
- Given：`build-appshot-helper.js` / `ui-verification.mjs` / 打包元数据脚本被 dev 或打包链调用；When：未设置开关（= distribution）或显式 self；Then：产出名称与主链 `DESKTOP_BRAND` 解析一致（helper 名、窗口标题、`.vettapkg` 关联名、Linux 元数据）。

## 必须保持

- 兼容标识冻结与「切换档案零迁移」合同。
- i18n 归一规则（Open Vetta / Vetta / Open Forge → 当前档名）与 post-processor 语义。
- `prepare-pack.js` 图标覆盖只作用于暂存 `build/`，四个文件名不变。
- `gen-brand-icons` 字节级复现合同与 `test:packaging` 既有其余断言。

## 测试与验证

- 定向测试：`bun --cwd apps/desktop run test -- src/shared/desktop-brand.test.ts src/renderer/domains/project/components/sidebar/SidebarTopBar.brand.test.tsx`
- 打包合同 node 测试：`bun --cwd apps/desktop run test:packaging`（含 `desktop-packaging-layout.test.mjs`、`gen-brand-icons.node-test.mjs`、`run-electron-builder.node-test.mjs` 等）。
- 端到端（构建面）：默认环境跑 `bun --cwd apps/desktop run build:main`，在 `dist/main/index.js` 中检索 `Allstr ai` 出现、`Open Forge` 不再作为解析结果（仅限本次改动引入的常量，注释/兼容字面量不计）。
- 影响面：`bun run test:impact`；质量门禁：`bun run check`（收尾完整）。
- 用户流程：dev 主窗口标题与侧栏品牌区、打包 productName/图标属于用户可见输出；真实 dev 界面与打包产物留待人工验收。

## 验收分层

- 工程验证：通过；绑定下方「交付记录」的命令与结果（定向 18 例、打包 node 13/13、main 构建端到端、完整 check exit=0；impact 升级/related 爬取按最低充分终止并如实记录）。
- 技术评审：自审；跨脚本一致性风险见剩余风险。
- 集成：本地 main 工作区串行提交与推 dev 事实随回写补齐。
- 人工功能验收：待验收（dev 界面/打包产物品牌呈现）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：干净工作区，未设置 `VETTA_BRAND_PROFILE`（或删除 `apps/desktop/.env` 相关行）。
- 操作步骤或 AI 任务输入：`bun --cwd apps/desktop run dev`（或按需打包 `bun --cwd apps/desktop run pack`）；对照 `VETTA_BRAND_PROFILE=self` 再跑一次。
- 预期行为与最终产物：默认档窗口标题/侧栏图标/文案为小爱ai（中文）或 Allstr ai（英文）、打包产品名与图标为 Allstr ai；显式 self 时回到 Open Forge。
- 不通过表现与已知限制：默认档仍显示 Open Forge 图标或文案、或显式 self 时出现 Allstr ai，均为回归；打包产物的更新元数据文件名会随产品名变化（风险见 REQ-0011）。
- 验收反馈及回归案例：（待用户反馈）

## 交付记录

- 实际修改：
  - `apps/desktop/src/shared/desktop-brand.ts`：默认档归一翻转为 `=== "self" ? "self" : "distribution"`（运行时共享品牌层 + i18n post-processor 档位）。
  - `apps/desktop/vite.config.ts`、`apps/desktop/vite.main.config.ts`：renderer / main 构建期 define 同一归一翻转。
  - `apps/desktop/scripts/prepare-pack.js`：品牌 JSON 选源翻转为默认 distribution；打包图标覆盖条件改为 `!== "self"`（注释同步）。
  - `apps/desktop/scripts/build-appshot-helper.js`：helper 名改为随档选源（否则 macOS dev/打包按 Allstr ai 名找不到 helper）；头注释同步。
  - `apps/desktop/scripts/desktop-packaging-layout.mjs`、`apps/desktop/scripts/linux-packaging-contract.mjs`：`.vettapkg` 文件关联显示名与 Linux 包元数据随档选源。
  - `apps/desktop/scripts/ui-verification.mjs`：主窗口匹配改为当前档名称集合（displayName + 本地化名），支持中文界面「小爱ai」标题。
  - 六个静态 HTML 标题（`index/onboarding/pet/quickpanel/remote-desktop-host/renderer-ocr`）改为默认档 Allstr ai 口径；运行时标题机制不变。
  - `apps/desktop/.env.example`：品牌段注释改为新默认 + 显式 `self` 示例。
  - 测试：`src/shared/desktop-brand.test.ts`（导入前钉住 self 档 + 三态用例 + 四决策点/辅助脚本同归一的源码合同）、`SidebarTopBar.brand.test.tsx`（改用 `resolveDesktopBrandName`，兼容默认档中文名）、`scripts/desktop-packaging-layout.test.mjs`（文件关联随档 + 两个子进程实测 unset/self）。
  - `.github/release-notes/v0.1.3.md`：「改进」追加一条（用户可见的默认品牌切换）。
  - 台账：新建 REQ-0011、TASK-0224，更新 requirements / tasks 索引与 REQ-0003 关联行。
- 实际运行：
  - 定向 vitest：`bun run --cwd apps/desktop test -- src/shared/desktop-brand.test.ts src/renderer/domains/project/components/sidebar/SidebarTopBar.brand.test.tsx` → 2 files / 18 tests 全绿（含新增源码合同与三态用例；格式修复后复跑同结果）。
  - 打包合同 node 测试：`node --test scripts/desktop-packaging-layout.test.mjs scripts/gen-brand-icons.node-test.mjs scripts/run-electron-builder.node-test.mjs scripts/build-inno-installer.node-test.mjs`（apps/desktop 下）→ 13/13 通过（含新增子进程断言：unset → `Allstr ai Plugin Package`，self → `Open Forge Plugin Package`）。
  - 构建面端到端：默认环境（无 `VETTA_BRAND_PROFILE`、无 .env）`bun run --cwd apps/desktop build:main` → `✓ built in 24.68s`；产物 `dist/main/*.js` 内联 `Allstr ai Computer Use`、不再出现 `Open Forge Computer Use`（self 档 helper 名）。
  - 发布说明校验：`node scripts/release/release-notes.mjs --check` → exit=0（v0.1.3 正文与版本/碎片一致）。
  - `bun run check`（完整）：首轮仅 lint 报 1 处 biome 换行格式（本任务新增用例的长行），按提示修复后重跑 exit=0——lint、types（root / cli / desktop / docs / mobile）、guards、mobile-lint 全绿。
  - `bun run test:impact`：直连阶段 `desktop: direct=2, related=1`、2 文件 18 例全绿；related 阶段需爬取品牌模块的整张引用图（`desktop-brand` 经 i18n 被大量测试引用），超过 5 分钟未进入运行即按「最低充分」终止。此前未限定的 impact 因 `vite.config.ts` 与 HTML 命中保守回退升级为 desktop 全包，跑完 212 个文件（约 2000+ 例）零失败后同样因成本终止。两次均如实记录，不宣称全量通过；全包非本任务的最低充分范围（4 决策点为常量选择，行为面由定向用例与构建端到端覆盖）。
- 未运行及原因：renderer 完整构建未单跑（define 机制与 main 相同，已由源码合同用例与 main 构建端到端覆盖；全量渲染器构建成本高）。真实 dev 界面与打包产物的用户可见验收未做——按交付合同留待人工验收。`verify:ui:*` 未运行（本次未获授权）。
- Worktree：未拆出（serial，理由见并发评估）。
- 集成：main 工作区串行提交 `f1cb54df2`（台账立案：REQ-0011 / TASK-0224 与索引）与 `f7eca251e`（实现 + 测试 + 发布说明，19 文件 +153/−46，pre-commit 通过）；审计 `git log origin/dev..main` 仅本任务两提交后，按长期授权 fast-forward `git push origin main:dev`，`origin/dev` 现指向 `f7eca251e`；本回写记录提交随后同批推送。未夹带未验收提交。
- 剩余风险：默认档翻转会改变打包产物文件名与更新元数据中的文件名（见 REQ-0011 风险）；docs-site / mobile 品牌面保持三花猫不动，与 Desktop 默认档出现有意不一致；`linux-packaging-contract` 的 author/vendor 随档指向 Allstr ai，若后续要维持 Open Forge 发布口径需显式 `VETTA_BRAND_PROFILE=self`。

