# Open Forge 二开推进范式

> 目标仓库：`C:\Users\xquan\Desktop\open-forge`（openvetta/open-vetta 的商用 fork）
> 本文回答一个问题：**这个 fork 该怎么推进二开、采取什么范式。**
> 所有结论基于实测数据，不是凭感觉。

---

## 0. 先看事实：本仓库的真实处境

实测（`git` 与源码扫描，**2026-09-22 历史快照**——下列数字是当时的决策输入，fork 已切换至 `forge/dev` 基座并持续演进，不得再当作当前分叉度；当前值以 `git rev-list --count` 实测为准）：

| 指标 | 实测值 | 含义 |
|---|---|---|
| fork 自有提交数 | **1 个**（`b6bb1e517 perf(desktop): 下线高负载星轨装饰球`） | 偏离度≈0，这是**最便宜的起点** |
| 与 `upstream/dev` 的差距 | 领先 11 / **落后 54** 提交 | 已在落后（其中 10 个是 merge commit） |
| fork `main` 与 `upstream/main` | 领先 1 / 落后 0 | fork 实际基于 `main`，非 `dev` |
| 上游近 30 天活跃度 | **1078 提交 / 5474 个文件**（≈36 提交/天） | 上游高速迭代，不可能切断 |
| 上游改动最频繁的文件 | `CHANGELOG.md`(173)、`release-notes/v0.5.59.md`(118)、`bun.lock`(60)、**`i18n/locales/{en,zh}/{settings,chat}.json`(各 39)**、`desktop/package.json`(33) | 这些就是未来的冲突热点 |

### 决定性的重叠

**更名要改的 ~190 处品牌串，恰好落在上游最热的文件里。**

进一步核实（推翻了一个乐观假设）：`common.json` 里确实有 `appName` 键，但**只被消费 8 处**；其余品牌串是**内联在译文句子中的硬编码**，例如：

```json
"step2Desc": "System Settings → Privacy & Security → Full Disk Access, tick Vetta, then restart Vetta."
```

一句话里出现两次品牌名。这类字符串分布在 `settings.json`(42)、`chat.json`(14)、`main.json`(11)、`abilities.json`(11)、`common.json`(6)、`skills.json`(5)……而这些文件上游每月改 39 次。

**结论：就地改名 = 在热度最高的文件里长期反复冲突（190 处 × 2 语言 × 每次上游合并）。这是本 fork 未来最大的持续性工程成本，范式必须围绕它设计。**

---

### 同步记录（2026-09-22）

fork 已按本文范式完成一次基座切换：从 `main`（基于 `upstream/main`）改为以最新 `upstream/dev` 为基座的产品分支 **`forge/dev`**。

- **未采用 merge**：fork 唯一的自有提交（下线星轨装饰球）已被上游 `e29e6d020 feat(new-session)!: 默认不挂装饰件，移除五枚常驻动画的装饰件` 超越——上游删掉的五枚（燃烧/能源井/玩手/**星轨**/像素火把）正是同一批，且把默认改成不挂装饰件。merge 会为一件上游已完成的事产生 7 个冲突文件。
- **做法**：丢弃冗余提交，只把 fork 本地内容（`exprot/` 全部规划文档、`CLAUDE.md`、发布说明的一行「其他」条目）重新落到新基座上。
- **结果**：与 `upstream/dev` 的差异**只剩文档，零代码偏离**；`forge/dev` 领先上游 2 个纯文档提交。品牌层与产品层将从这一纯净基座开始。
- **教训**：动手自研前先确认上游是否已做同一件事。上游约 36 提交/天，重复劳动的概率不低——本次即为实例。

---

## 1. 范式裁决：薄壳 fork + 品牌外置 + 增量产品层

| 范式 | 做法 | 收益 | 代价 | 裁决 |
|---|---|---|---|---|
| **A 硬分叉** | 切断上游，独立演进 | 完全自由 | 放弃 36 提交/天的上游能力与安全修复；全部自担 | ✗ |
| **B 就地改造** | 直接改上游文件（改 i18n、改核心） | 短期最快 | 190 处品牌串 + 核心改动，每次上游合并都冲突，成本随时间累积 | ✗ |
| **C 薄壳 fork** | 品牌集中外置 + 新功能走新增包/扩展点，上游文件尽量不碰 | 合并成本**恒定低** | 需要前期的分层纪律 | **✓ 推荐** |

C 的核心思想：**把"品牌"和"功能"都做成薄层，让上游文件保持接近原样**，从而让 `merge upstream/dev` 长期保持低成本。

---

## 2. 三个支柱

### 支柱一：品牌外置（Brand as a layer）

**原则：不改 locale 文件，把品牌变成运行时/构建期的注入。**

- **UI 文案**：在 `apps/desktop/src/shared/i18n/config.ts` 挂 i18next `postProcessor`，对解析后的字符串做品牌替换。上游改 i18n 100 次也不产生冲突。
- **必须配显式规则表**，区分"该替换"与"该保留"：
  - 替换：`Vetta`、`Open Vetta`（作为产品名的用法）
  - **保留**：`~/.vetta`、`vetta://`、`.vettapkg`、`VETTA_*`、`@vetta/*`、`vetta:`（技术 token，按 rebrand-plan §6 保留）
  - 盲替换会把 `vetta://` 变成 `open-forge://` 之类的错误，**必须有测试锁死**
- **打包身份**：`prepare-pack.js`（`productName`/`appId`/`executableName`）、`installer.iss`、产物名从**单一 brand 模块**取值，而不是散落硬编码。
- 收益：品牌改一处生效，上游 i18n 变更零冲突。

### 支柱二：增量产品层（Additive，不造第二内核）

**原则：新能力 = 新增包 + 扩展点；核心合同变更必须走 ADR。**

这条其实已在既有规划里成型，本范式只是把它固化为纪律：

| 新能力 | 落点 | 不改上游什么 |
|---|---|---|
| Task/Artifact 通用生命周期 | 新包，或 `runtime-core` 的**窄合同**（产品无关词汇） | 不改 TurnPipeline 执行语义 |
| work/coding 产品语义 | `coding-agent` 新增 feature 域 | 不改 Profile/Prompt 既有所有权 |
| Permission/Approval | 复用 Runtime Tool Policy + 事件 | 不用 Prompt 约定代替授权 |
| Desktop UI（Task/Approval/Artifact 面板） | 新增 renderer domain + IPC 域 | 不改既有 domain |

**判据（每次改动前问）**：*这次能不能做成"新增"而不是"修改上游高频文件"？* 若不能，先确认是否真的必须——必须则记 ADR。

### 支柱三：上游同步纪律（Sync discipline）

- **跟踪 `upstream/dev`**，不是 `main`：上游开发在 `dev`，`main` 是慢快照（README/CONTRIBUTING 明确 PR 目标为 `dev`）。当前 fork 基于 `main`，建议切到 `dev` 轨道。
- **节奏**：按上游 release 节奏或每周一次 merge；**不允许落后无上限**（当前已落后 54 个）。
- **冲突预算**：给每次 merge 的冲突文件数设阈值（如 ≤5 个文件）。**超过阈值说明品牌层没做干净，应当回炉重构薄层，而不是逐次手工解冲突。**
- **行为漂移哨兵**：`exprot/differential-testing-observability.md` 已设计行为合同测试矩阵——把它当成"上游行为变了没"的探测器，每次 merge 后跑。

---

## 3. 推进顺序：为什么"先更名、后产品"

| 顺序 | 论证 |
|---|---|
| **先更名** | 现在只有 1 个自有提交，更名层是**纯增量**，未来只需在这薄层上解冲突。若先做产品，品牌改动会与产品改动交织，**冲突面相乘**。 |
| **更名要做成薄层** | 不是"把 190 处字符串改掉"，而是"建立品牌外置机制 + 改少数构建身份文件"。这才是可长期 rebase 的形态。 |
| **再上产品** | 产品的 Task/Artifact/Permission 是**新增**，不与上游热文件重叠，天然低冲突。 |

**推荐顺序**：

```
阶段 A  决策冻结（rebrand-plan §2 的 15 项，尤其前 3 项）
          ↓
阶段 B  品牌外置骨架 + 构建/更新身份（rebrand-plan 阶段 B/C 的"薄层化"实现）
          ↓
阶段 C  产品阶段 0：合同冻结（exprot/implementation-plan.md）
          ↓
阶段 D  产品阶段 1：Task/Artifact 最小纵向切片
          ↓
        此后进入"定期同步上游 + 增量产品"的稳态
```

---

## 4. 落地硬规则（给后续 Agent 的约束）

1. **热文件清单（除品牌层外禁止修改）**：`i18n/locales/**`、`**/CHANGELOG.md`、`.github/release-notes/**`、`bun.lock`、`package.json` 的 `version` 字段。
2. **品牌改动的唯一入口**：brand 模块 + 替换规则表。禁止在业务代码里新写品牌字面量。
3. **核心合同变更必须 ADR**（`docs/adr/`），不得只改实现。
4. **每次 merge 上游后**跑行为合同测试；冲突文件数超阈值时先重构薄层。
5. **本仓库既有质量门禁照旧**：`bun run check:quick` / `check` / `test:impact`（见 CLAUDE.md）。

---

## 5. 两个"现在改免费、以后改要迁移"的项（时间窗口）

| 项 | 约束来源 | 说明 |
|---|---|---|
| `APP_RUNTIME_NAME`（`apps/desktop/src/shared/app-identity.ts`） | 该文件注释明确：safeStorage 主密钥按 app 名定位，**名字不同即两把不通用密钥，同一份密文只能被写入它的那一侧解开** | 改此常量会让**所有存量用户已保存的凭据无法解密**，必须同时提供迁移方案。当前无在网客户端 → **现在改零成本** |
| `appId: com.vetta.desktop`（`prepare-pack.js:743`） | macOS 按 bundle id 识别应用 | 改则 TCC 已授权项全部失效需重新授权。当前无客户端 → 现在改零成本 |

同理适用于：Windows AppId GUID、`vetta://` 协议、`~/.vetta` 数据目录、Android `applicationId`。

**这是本 fork 唯一的一次免费窗口。建议在首次商用发布前全部落地。**

---

## 6. 需要你先定的三件事

范式可以定，但**阶段 A 的三项基建决策不定，阶段 B 无法开工**（会全量返工）：

1. **新域名体系**（官网/下载/文档/更新源四类）
2. **更新基建**（新 GitHub 组织 + 自有 CDN；`VETTA_UPDATE_PROVIDER` 选 github 还是 generic）
3. **Marketplace 仓库**（新组织下的能力市场仓库）

详见 `exprot/rebrand-plan.md` §2（15 项决策，含建议与代价）。
