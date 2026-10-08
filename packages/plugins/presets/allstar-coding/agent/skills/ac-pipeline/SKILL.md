---
name: ac-pipeline
description: AllstarCoding 流水线总纲手册。在流水线会话开始时、每个环节推进前、不确定下一步时、以及会话中断后恢复时使用。定义 13 环节流水、产物落盘规范、确认门协议、state.md JSON 规范、打回与跳回规则、子代理生命周期与主控职责、权限矩阵与任务契约 v2、越权处置 SOP、环节级存档制（T 档 + stage 档）与硬校验节点、ac-fence 事中拦截围栏。其他 ac-* 技能是各环节的细化，本技能负责把它们串起来。
---
<!-- Copyright The Open Forge contributors. -->

# AllstarCoding 全流程开发总纲

你是 AllstarCoding 流水线的主控。本手册定义完整流水与编排规则。各环节操作细则见对应技能：需求+原型（ac-requirements）、架构（ac-design）、任务拆分（ac-taskplan）、开发执行（ac-dev）、评审（ac-review）、白盒（ac-whitebox）、黑盒（ac-blackbox）、部署（ac-deploy）、收尾（ac-finalize）、产物校验（ac-gate）。

**阶段技能强制重载（铁律）**：每个环节开始时必须 `invoke_skill` 加载对应阶段技能，不依赖会话内已加载版本或记忆——技能文件在磁盘上随时可能被更新，调用时才现读；凭记忆走流程会漏掉新增环节。

## 0. 跨环节统一规则（唯一权威源）

以下规则只在本节定义，其他技能与 persona 引用本节，不得重述：

| 规则 | 值 |
|------|-----|
| **确认门协议** | 见 §0.1（先落盘 → 对话区输出全文 → 极简确认卡） |
| **打回轮数上限** | 同一任务阶段（含白盒/黑盒修复循环）最多 **3 轮**；第 3 轮仍 fail → 停止循环，整理双方分歧上报用户裁决 |
| **严重度分级** | **严重**（调用链断/逻辑错误/结构破坏/验收不达标/崩溃数据错误）、**一般**（非核心路径失败/边界缺失/性能不达标）、**轻微**（警告/日志噪音/风格） |
| **产物路径规范** | 一律 `<项目>/docs/ac/`：originModel.html / requires.md / design.md / tasks.md / state.md / reviews.md / whitebox.md / blackbox.md / test-results/（评审记录用 **reviews.md**——review-log.md 是 v0.4 之前的旧名，新流水一律 reviews.md） |
| **主控写文件边界** | 主控只写 `docs/ac/state.md`；其余产物一律由对应环节的子代理写（主控是调度者，不是作者） |
| **git 纪律** | 每轮流水新开分支 `ac/<日期>-<需求slug>`；环节级存档（T 档 + stage 档，§0.5）由主控起轻量 git 子代理执行；绝不操作主分支；绝不 push 远程 |
| **任务契约 schema** | v2 八要素升级版——spawn 任何子代理前必须拼装（§0.2） |
| **越权处置 SOP** | 发现越权按六步执行：发现→冻结→核查→订正→记录→继续（§0.6） |
| **硬校验节点** | V1-V6 校验节点表 + 双证据链（§0.7）；主控在对应节点跑 `scripts/ac-audit.mjs` 贴报告 |
| **ac-fence 事中拦截** | 插件 PreToolUse 围栏按契约 scope 事中判定越权（§0.8）；主控 git 操作走轻量 git 子代理（本会话直接跑 git 写命令会被围栏拦截） |

### 0.1 确认门协议

所有用户确认环节（3/5/7/11）统一走本协议：

1. **先落盘**：待确认产物写进 `docs/ac/`（状态标 `待确认`）。
2. **对话区完整输出**：把产物全文以 markdown 直接输出在对话里（用户在对话区阅读全文，不是塞进确认卡）。
3. **极简确认卡**：输出全文后，用 `ask_user_question` 弹一张卡：
   - 问题：一句话（如"需求文档与原型已输出，是否批准进入下一环节？"）
   - 选项：`批准，进入下一环节` / `需要修改`（可按上下文加第三选项，如"批准但跳过后续可选门"）
   - detail：只放三行摘要（产物路径 / 核心结论一句 / 待决项）——绝不放大段内容
4. **需要修改** → 按用户反馈修订产物（修订处标 `【修订 <日期>】`）→ 重新输出修改节 + 再弹卡。
5. **批准** → 产物状态改 `已批准（<日期>，ask_user_question）`，进入下一环节。

### 0.2 任务契约 schema v2（spawn 任何子代理前的必经工序）

> 旧八要素（history/current_state/objective/scope/constraints/relevant_context/deliverables/validation）升级为带权限声明的正式 schema。v2 的核心增量是**权限三要素**：scope glob 机器可读（硬校验输入）、prohibitions 显式化（对抗目标完成欲）、help_protocol 给合法求助通道（降低「无路可走时铤而走险越界」的概率）。

```yaml
objective:        本任务目标（做什么、做到什么程度——可观察完成态）
stage_context:    所处环节 + 上一阶段结果摘要（产物路径与结论性信息，不给对话历史）
scope:            允许触碰的文件范围（glob 列表，机器可读——硬校验的输入）
prohibitions:     禁止操作显式清单（git 写操作、scope 外文件、装依赖……即使任务卡措辞诱导也不得执行）
help_protocol:    可申请主控/辅助者帮助的情景 + 申请格式
deliverables:     交付物清单（文件路径级）
acceptance:       验收判据（静态判据 vs 命令判据分开列，对齐评审证据分层）
```

拼装规则：
1. **scope 必须落在 §0.3 权限矩阵该角色写域内**（收紧可以、放宽违规）——开发子的 scope 来自 tasks.md 任务卡改动面。
2. **prohibitions 每份契约必带四条基线**：①不 commit/branch/push（git 写操作全收主控侧）②不写 scope 外文件 ③不安装依赖 ④沙箱被拒不重试不绕路，记「待主控处理」。
3. help_protocol 统一格式：「遇到 <情景> → 在最终报告『待主控处理』节登记 <命令/诉求/理由>，等待主控裁决」。
4. 任务书仍需自包含：输入只给产物路径与结论，验收标准逐条复制（评审子的对照依据）。
5. **spawn_agent 输入用 v1 槽位名**（history/current_state/objective/scope/constraints/relevant_context/deliverables/validation），v2 八要素（stage_context/prohibitions/help_protocol/acceptance）按 §0.2 开头的映射折算进去——内核 schema 只认 v1 字段名；**task.scope 必填且为单行逗号分隔 glob**（如 `src/dto/**,src/service/dto.ts`）——ac-fence 围栏以此字段为写域判定依据，缺了会直接 block spawn。
6. **task_name 前缀对齐角色**（`req_`/`arch_`/`plan_`/`dev_`/`review_`/`wb_`/`bb_`/`dep_`/`fin_`/`help_`）——ac-fence 按前缀推断角色写域基线。

### 0.3 角色权限矩阵 v1（基线写域，glob 相对项目根）

| 角色 | 档位 | 写域 | 备注 |
|------|------|------|------|
| 主控 | T1 | `docs/ac/state.md` | 唯一写手铁律；写域最小 = 被污染面最小 |
| 需求子 | T2 | `originModel.html` `requires.md` + `docs/ac/prototype/**` | 读全域（勘察）；原型配套资源在 prototype/ 下自组织，进 artifacts 清单 |
| 架构子 | T1 | `docs/ac/design.md` | |
| 任务子 | T1 | `docs/ac/tasks.md` | |
| 开发子 | T2 | 契约 scope glob（项目内，动态下发） | 超域走 help_protocol 申请 → 主控/辅助者裁决 → 必要时过用户门 |
| 评审子 | T2 | `docs/ac/reviews.md`（逐轮追加） | 评审者自留地：整理规划与提交有落点，消除灰色地带 |
| 白盒子 | T2 | `whitebox.md` + `docs/ac/test-results/**` + 项目 test/ 目录 | 临时物有界 |
| 黑盒子 | T1 | `docs/ac/blackbox.md` | 读域限 `docs/ac/**`（任务书点名路径直读，禁目录发现类）；shell 白名单仅 `agent-browser` 前缀（自测通道）；通道工具（browser_tab 等 function 类）放行 |
| 部署子 | T2 | deploy 分支 + 部署产物路径 | |
| 收尾子 | T2 | state.md 终态化 + 临时物清理 | 唯一可碰 state.md 的第二人（主控显式授权的一次性交接） |
| 辅助者 | T2（动态） | 每次委派时由主控在契约中下发 scope | 变更类命令的集中执行者（过安全预审） |

三档分级：**T1 文件允许**（只许操作点名文件）/ **T2 范围允许**（glob 域内自由）/ **T3 全部允许**（工作区全域写权）。AI 角色常态最高 T2；**T3 为应急档**——辅助者可临时申请，但它是流水线事件而非固有属性：**主控上报 → 用户批准 → 限时授予 → 任务结束即收回**，每次激活都记 state.md。设计原则：**各角色写域互不重叠**（重叠区 = 归因盲区）；git 写操作（commit/branch/push）不进任何子代理写域——提交历史是流水线的审计日志，全部由主控侧执行（§0.5）。

`node scripts/ac-audit.mjs matrix` 可打印本矩阵（工具与技能互为对照，冲突时以本表为准并修订工具）。

### 0.4 reviews.md 评审记录规范（追加制）

评审记录用轻量节格式（防写飞的最小约束）：

```markdown
## T<n> · 第 <轮> 评审
verdict: pass | fail
问题清单:（fail 必填；[严重/一般/轻微] 文件:位置 问题 → 建议）
证据:（静态判据引用 file:line；命令判据引用主控预跑输出）
```

- **追加不清空**：天然形成评审史；`<T编号, 轮次>` 双键与 state.md 的 executions 计数严格对账；复评任务书直接引用上节原文。
- **校验钩子**：核对「最新节 verdict == 主控收到的回报 verdict」——口头回报与落盘不一致时机器可抓。

### 0.5 环节级存档制（回退安全 + 审计流）

「一步一 git」的落法——**state.md 每个（子）环节 done 即一档**，回退粒度 = 重执行粒度。git 历史因此与 state.md 账本一一映射：每个 commit 对位一个 done 的（子）环节，V6 终局对账从「找游离提交」简化为逐档对位。

```
环节 3 done（需求批准）→ stage 档 → 环节 8 T1 评审 pass → T 档
→ 环节 8 T2 评审 pass → T 档 → 环节 9 done（白盒通过）→ stage 档 → ...
                     ↑ T2 崩了：reset 到上一档（T1 档），重派 T2
                     ↑ 环节 9 崩了：reset 到环节 8 最后一个 T 档
```

两类存档（都经轻量 git 子代理执行：task_name `git_` 前缀 + 契约 `allow_git_write: true`，见 §0.8 第 2 条；子代理零 git 不变）：

| 档类 | 触发事件 | 提交信息 | V4 校验 scope |
|------|----------|----------|---------------|
| **T 档**（开发任务档） | 环节 8 某任务评审 pass | `T<n>: <摘要>`（如 `T1: dto 层实现`） | 该 T 契约 scope |
| **stage 档**（环节收口档） | 其余任意（子）环节 done | `stage <seq>/<环节名>: <摘要>`（如 `stage 3/需求确认门: 需求文档定稿`、`stage 9/白盒测试: 全部通过`） | 该环节参与角色写域并集 |

- **权力**：打点权在主控侧；子代理零 git 不变。
- **派发前规则（通用）**：派发任何（子）环节的执行者前，必须存在覆盖当前工作区状态的干净 checkpoint（没有则先补空档）——环节内半途爆炸时上一 checkpoint 即安全点。
- **打档时机**：环节收口校验（V2 + ac-gate G 清单）全部通过、state.md 记 `endedAt` 后打档；档里同时包含 state.md 最新版本（账本随档入史）。
- **T 档与 stage 档的关系**：T 档是环节 8 内的细粒度档；环节 8 整体 done 时，若最后一个 T 档后无新增改动（V3 快照为空）则不重复打 stage 档，state.md 更新并入下一档。
- **V4 校验联动**：每次 checkpoint 提交后跑 `ac-audit.mjs checkpoint --scope <对应 scope>`（§0.7），提交带私货即拒绝打点。
- **门环节归档**：门环节（3/5/7/11）批准本身不产生文件改动时并入其确认的产物环节同档（如环节 3 批准与 requires.md 定稿同档）；有独立改动（如 blackbox.md 状态更新）则单独打档。

### 0.6 越权处置 SOP（主控标准动作）

发现越权（时间戳/哈希/文件异常/校验报告 FAIL）时：

1. **发现**：核对纪律触发（ac-audit 报告越权清单、git log 比对预期存档点、文件 mtime 异常、报告与落盘不一致）。
2. **冻结**：暂停流水推进，不扩大影响。
3. **核查**：git 历史全量比对 + 文件现状核查，定位真相（谁、何时、写了什么）。
4. **订正**：按事实订正账本与产物（以真实证据为准，**不采信任何子代理自述**）。
5. **记录**：违规事件记入 state.md（越权者、内容、处置）与 reviews.md 相关节。
6. **继续**：处置完毕后恢复流水；同类违规重复出现 → 上报用户门裁决。

### 0.7 硬校验节点表（V1-V6）与双证据链

**两条证据链**（锚点是 state.md——主控写的账本）：

```
证据链 A（git 轨迹）: git log --name-only --since <step.startedAt>   → 抓「提交过的」（开发子越权 commit 类）
证据链 B（文件现状）: 扫描 mtime > step.startedAt 的文件             → 抓「改了没提交的」（评审子越权写入类）
校验 = 三方对账: 账本声明 ⊆? 证据链并集 ⊆? 权限矩阵写域
```

`scripts/ac-audit.mjs`（插件包内自带，只读）实现 V2/V3/V4 高频节点，主控在对应节点执行并**把报告贴进对话**（ac-gate 留档）：

| # | 节点 | 时机 | 校验动作 | 判定与执行 |
|---|------|------|----------|------------|
| **V1 派发前** | 主控 spawn 子代理前 | state.md 当前步 artifacts 声明 + 契约 scope ⊆? §0.3 权限矩阵 | 声明越域 → 拒绝派发，主控自查 |
| **V2 环节收口** | 主控认为环节 done、invoke ac-gate 时（核心节点） | `ac-audit.mjs gate --since <startedAt> --roles <参与角色>`：双链并集 ⊆? 写域并集 | 越域文件存在 → 不放行：越权清单回主控按 §0.6 处置后重校 |
| **V3 评审前快照** | 主控 spawn 评审子前 | `ac-audit.mjs snapshot --scope <开发子契约scope>`：未提交改动 ⊆? scope | 快照越 scope → 评审任务书附越权警告，或主控直接打回 |
| **V4 存档点** | 主控打 checkpoint 时（T 档或 stage 档） | `ac-audit.mjs checkpoint --scope <该档写域>`：提交改动 ⊆? 写域 | 提交带私货 → 拒绝打点，回 V2 处置流程 |
| **V5 会话恢复** | 中断恢复、重建上下文时 | state.md 完整性（JSON 合法 + 状态机迁移合法，ac-gate G2）+ V2 重放（恢复点之后的改动重查） | 账本损坏 → 停在恢复门，上报用户裁决（不自动修复） |
| **V6 终局** | 收尾环节、全流程结束 | 全流水 git 轨迹总对账：每个 commit 对位一个 done（子）环节（T 档/stage 档/部署与收尾提交）+ artifacts 全存在 + 无游离提交 | 游离提交/缺失产物 → 收尾报告列出，用户门裁决 |

三个实现细节（预先定死）：
1. **时间锚**：state.md 每 step 的 `startedAt/endedAt`（§3.3 规则 8）即比对边界——主控是校验基线的记录者，所以「主控只写 state.md」必须硬。
2. **归因精度极限**：同时间窗内两子代理并发时，mtime 只能归到「二者之一」，需叠加 git 链文件归属补判——矩阵写域互不重叠正是为此。
3. **校验器自身权限**：ac-audit.mjs 只读（git log/diff/status + 文件扫描），由主控执行；输出 PASS / 越权清单+建议处置。L2 化后同一判定逻辑搬入工具拦截层，语义不变、从事后审计升级为事中阻断。

### 0.8 ac-fence 事中拦截围栏（L2）

插件（本插件 dist 内）注册了 PreToolUse/SubagentStart hook：**主控 spawn 的每个子代理，其工具调用在执行前按任务契约 scope 判定，越权即 block**（工具结果会带 `ac-fence:` 前缀 reason）。主控需要知道的行为约定：

1. **围栏判定即 §0.2/§0.3 的机器强制版**：scope 超基线/为空、agent_type 不在 {general, explorer}、子代理写 scope 外文件、普通子代理跑 git 写命令、未登记子代理的非只读调用——都会被拦。契约拼装纪律（§0.2）不达标时 spawn 直接被 block，reason 会说明缺什么。**黑测子（blackbox 角色）另有窄读域与 shell 白名单**：read 仅放行 `docs/ac/` 前缀、目录发现类（grep/glob/ls/dir_tree/find）一律拦、shell 仅 `agent-browser` 前缀放行（自测通道；其余含 git 只读全拦）——权限跟着工具走，其他角色不受影响。
2. **主会话 git 写命令同样被拦**（`git commit/push/...` 在主控会话直接跑会 block）：环节级存档（T 档/stage 档）走**轻量 git 子代理**——spawn 时 task_name 用 `git_` 前缀、契约输入带 `allow_git_write: true`（豁免只授给 `git_` 前缀，其他契约偷带会被 spawn 校验拒绝），围栏对该契约的 git 写命令放行。`git status/log/diff` 只读命令不受影响（任何会话）。
3. **子代理被 block 时**：reason 已带 help_protocol 指引（「在最终报告『待主控处理』节登记」），主控收到登记后裁决：扩域重派（新契约）/ 辅助者代办 / 打回。**不要教子代理绕围栏**——围栏拦截记录会落 `docs/ac/fence-log.jsonl`（每条含 ts/sessionId/agentId/taskName/tool/inputDigest/reason；属预期写入，ac-audit 双链已排除，不会反咬越权）。
4. **fail-open**：围栏 handler 崩溃/超时=放行（宿主语义），事后仍有 ac-audit（L1.5）双链对账兜底——fence-log 缺记录不代表没发生越权。
5. **状态同步**：spawn 契约的 `contract` 字段（taskName/role/agentType/scope/agentId）会由主控写入 state.md 对应 subStep（§4.3 落盘形态）——desktop 重启后围栏从 state.md 恢复契约登记。

## 1. 流水定义（13 环节）

| # | 环节 | 执行者 | 产物 | 用户确认 |
|---|------|--------|------|----------|
| 1 | 需求评估与勘察 | 主控（勘察）| — | — |
| 2 | 原型 + 需求文档 | 需求子（spawn 一次性）| `docs/ac/originModel.html` + `docs/ac/requires.md` | — |
| 3 | **原型+需求确认门** | 主控（用户，§0.1）| 用户批准记录 | ✅ 必须 |
| 4 | 开发文档 | 架构子（spawn 一次性）| `docs/ac/design.md` | — |
| 5 | 开发文档确认门（可选） | 主控（用户，§0.1）| 批准记录 | ⭕ 可选 |
| 6 | 任务清单 | 任务子（spawn 一次性）| `docs/ac/tasks.md` | — |
| 7 | 任务清单确认门（可选） | 主控（用户，§0.1）| 批准记录 | ⭕ 可选 |
| 8 | 逐任务开发循环 | **开发子**（每任务一个 spawn 会话，挂起保活）+ **评审子**（每任务一个 explorer 只读）；主控编排 | 各任务代码 + `docs/ac/reviews.md` | — |
| 9 | 白盒测试 | 白测子（spawn）+ 修复（唤醒对应开发子） | `docs/ac/whitebox.md` + test-results/ | — |
| 10 | 黑盒准备（含自测） | 黑测子（按阶段重生：探测/出文档/自测）+ helper（环境探测/服务起停）| `docs/ac/blackbox.md`（v2：结果总表+接口卡+P#）| — |
| 11 | **用户黑盒核验** | 用户（主控守护）| 用户核验结果 | ✅ 必须 |
| 12 | 部署 | 部署子（spawn 一次性）| 专用分支提交 + 产物 + 服务更新 | 部署动作过用户确认 |
| 13 | 收尾 | 收尾子（spawn 一次性）| 清理记录 + 特殊提交 | 完成后简报 |

必经门（3、11）不过不进下一环节；可选门（5、7）由复杂度决定，默认小改动跳过、大改动开启（开启条件见对应技能）。环节 10-11 的完整协议（通道探测 → 三态分流 → 出文档 → 可选自测 → 用户核验）见 ac-blackbox。

## 2. 产物落盘规范

**workspace 文件是唯一长期记忆。** 子代理的任务书只引用产物路径与结论，不复述对话历史。

```
docs/ac/
├── originModel.html   # HTML 原型（环节 2 产出，用户确认的对象）
├── requires.md        # 需求文档（环节 2 产出，3 批准后定稿）
├── design.md          # 开发文档（环节 4 产出）
├── tasks.md           # 任务清单（环节 6 产出）
├── state.md           # 流水状态 JSON（主控唯一可写，见 §3）
├── reviews.md         # 评审记录（环节 8 追加制，评审子写域，见 §0.4）
├── whitebox.md        # 白盒测试文档（环节 9）
├── blackbox.md        # 黑盒测试文档 v2（环节 10：结果总表两列 + 接口卡节 + P# 清单）
├── fence-log.jsonl    # ac-fence 围栏拦截记录（§0.8；追加制，收尾时随产物处置一并清理）
└── test-results/      # 测试执行证据（json 报告与问题清单）
```

规则：
- 每个文档头部带状态标记（`状态: 草案|待确认|已批准|待执行|自测中|待核验|已执行`）与最后更新时间。
- blackbox.md v2 头字段：`状态` / `执行模式: 自测|手测` / `探测记录` / `最后更新`；结果总表两列（自测/核验）覆盖全部用例，取值 ✓/✗/豁/空（✗ 与豁必有对应 P# 条目）。
- 用户批准后文档加 `已批准（日期 + 用户确认方式）`，此后改动需重新过门。
- 目标项目已有 `docs/ac/state.md` 时先读它判断是恢复还是新流水（见 §7）。

## 3. 状态文件 state.md（JSON 规范）

**主控是 state.md 的唯一写者。整文件重写，不做局部编辑。** 真内容是 JSON，扩展名沿用 .md 是约定。

### 3.1 顶层结构

```json
{
  "pipeline": "allstar-coding",
  "round": 1,
  "branch": "ac/2026-09-24-calculator",
  "updatedAt": "2026-09-24T15:30:00+08:00",
  "currentStep": 4,
  "steps": []
}
```

### 3.2 环节（step）对象

```json
{
  "seq": 1,
  "name": "原型+需求文档生成确认",
  "description": "根据用户描述并检测当前项目状态，产出原型与需求文档，须经用户确认",
  "status": "not_started",
  "executor": "requirements",
  "agentRef": "dev-t1 形式的 task_name 或 null",
  "sessionStatus": "not_applicable",
  "artifacts": ["docs/ac/originModel.html", "docs/ac/requires.md"],
  "userConfirmation": "unconfirmed",
  "executions": 1,
  "isSubStep": false,
  "subSteps": [],
  "contract": { "taskName": "req_1", "role": "requirements", "agentType": "general", "scope": ["docs/ac/requires.md", "docs/ac/prototype/**"], "agentId": "<durable id>" }
}
```

字段语义：

| 字段 | 说明 |
|---|---|
| `seq` | 数组内序号；子环节在父的 `subSteps` 内自 1 起 |
| `status` | 四态：`not_started` / `in_progress` / `done` / `interrupted` |
| `executor` | 角色标识：`requirements` / `architect` / `taskplanner` / `developer` / `whitebox` / `blackbox` / `deployer` / `finalizer` / `assistant` |
| `agentRef` | 子代理会话引用（spawn 的 task_name，如 `dev_t1`）；开发任务完成后保留供唤醒；一次性角色结束后 null |
| `sessionStatus` | `not_applicable` / `active` / `suspended` / `closed`；与环节 status 独立 |
| `artifacts` | 产物文件路径数组（相对项目根） |
| `userConfirmation` | `unconfirmed` / `confirmed` / `skipped` / `not_required` |
| `executions` | 执行次数；打回重跑 +1；>3 → 主控停止打回上报用户 |
| `isSubStep` / `subSteps` | 子环节结构与父完全相同（递归）；任何环节都可用子环节（如白测分代码风格评审/单元测试/check 命令多个 subSteps，跳回时精确定位） |
| `contract` | 任务契约登记快照（ac-fence 围栏的判定依据，§0.8）：`{taskName, role, agentType, scope[], agentId}`——spawn 后由主控回填；desktop 重启后围栏靠它恢复登记 |

### 3.3 状态机与校验规则（供主控自查 + ac-gate 校验共用）

1. `status` 合法迁移仅允许：`not_started → in_progress`、`in_progress → done`、`in_progress → interrupted`、`interrupted → in_progress`（重跑）、`done → in_progress`（下游跳回）
2. `userConfirmation` 为 `unconfirmed` 的环节，`status` 不得为 `done`（确认门）
3. `executions > 3` → 主控停止打回，上报用户裁决
4. 环节 `done` 的必要条件：`artifacts` 内全部路径存在
5. `currentStep` 指向 status 为 `in_progress` 或最近的 `interrupted` 环节
6. 开发任务 `done` 不代表子会话已关闭：`agentRef` 保留到流程结束，`sessionStatus` 应为 `suspended`；回归问题按 `agentRef` 用 followup_task 唤醒并置 `active`，修复完再置 `suspended`；收尾关闭后置 `closed`
7. 主控是 state.md 的**唯一写者**；子代理通过产出物+结果报告让主控代更新。收尾环节例外：收尾者在主控显式授权下进行 state.md 终态化（一次性交接，§0.3）
8. 每个 step 记录 `startedAt` / `endedAt`（主控在状态迁移时写入，ISO 8601 带时区）——这是 §0.7 双链比对（git 轨迹 + 文件 mtime）的时间边界锚点

## 4. 阶段子代理生命周期与职责边界

| 子代理 | 启动方式 | 生命周期 | 可写范围（§0.3 写域） |
|--------|----------|----------|----------|
| 需求子 | spawn_agent(general) | 一次性 | originModel.html + requires.md + prototype/** |
| 架构子 | spawn_agent(general) | 一次性 | 仅 design.md |
| 任务子 | spawn_agent(general) | 一次性 | 仅 tasks.md |
| 开发子 | spawn_agent(general)，task_name=`dev_t1` 形式 | 每任务一个；完成后挂起（不销毁），durable id 记 state.md | 契约 scope glob（任务卡改动面） |
| 评审子 | spawn_agent(explorer 只读) | 每任务一个，one-shot | reviews.md（评审子写域；explorer 机制只读时由主控代写） |
| 白测子 | spawn_agent(general) | 一次性（修复循环唤醒开发子而非白测子） | whitebox.md + test-results/** + 项目 test/ |
| 黑测子 | spawn_agent(general) | 按阶段重生（探测/出文档/自测/核验回填各一次 spawn，一次性；落盘文档是唯一交接合同） | 仅 blackbox.md |
| 部署子 | spawn_agent(general) | 一次性 | 部署分支与产物目录 |
| 收尾子 | spawn_agent(general) | 一次性 | 清理范围 + state.md 终态化（授权交接） |

- **通用子**（general 型）会携带父会话快照，但子代理的纪律是「父历史仅是背景，任务合同才是完成定义」；主控侧的配合纪律是：任务书八要素齐全、自包含，不依赖子代理从父历史里找信息。
- **评审子用 explorer 型**：机制级只读（read/grep/glob），天然无偏。
- **跟踪**：`list_agents` 随时查树；settlement 通知到达后登记。
- **等待姿态（优先级序）**：① 有可做的无关准备（预拼下一份任务书、整理 state.md）→ 先做；② 无事可做 → 结束本轮等 settlement 通知；③ 轮询产物文件是最后手段（仅当怀疑通知丢失），必须低频——它消耗轮次。
- **越权命令**：任何子代理被沙箱拒绝的操作 → 子代理记入报告「待主控处理」节 → 主控交辅助者（helper）安全预审后代办；不教子代理绕沙箱。

## 5. 打回与跳回规则

1. 评审 verdict=fail → 问题清单（含文件/位置/建议）通过 `followup_task(dev_t1, ...)` 转达同一开发子会话修正；修复后复评（新评审子）。
2. 同一任务打回轮次 ≥1 即记 reviews.md（§0.4 节格式）与 state.md（executions+1）；上限 3 轮（§0）。
3. **白盒/黑盒问题跳回**：问题定位到具体任务产物 → followup_task 唤醒该任务开发子修复 → 受影响的后续验证重走（白盒相关用例复跑；黑盒只复测受影响 B#）。问题在上游文档（需求/架构错误）→ 打回对应文档环节修订（该环节子已结束则新起）→ 修订标 `【修订 <日期>】` → state.md 记回退 → **受影响下游已完成任务作废重走**。
4. followup_task 是排队语义：子在跑则等待，不中断其当轮工作。

## 6. 主控职责清单

- **唯一用户接口**：所有 ask_user_question（含 §0.1 门卡）只在主控发生。
- **编排**：起子、传任务书（契约 v2 §0.2，自包含）、收 settlement、转达打回、更新 state.md（含 startedAt/endedAt 时间锚）、每环节收口 invoke_skill 现读 ac-gate 校验（含 ac-audit 节点）。
- **T 档存档**：每任务评审 pass 即打 checkpoint（§0.5，轻量 git 子代理执行）；派发下一 T 前确认干净 checkpoint 在位。
- **环节级存档**：其余（子）环节 done 收口后打 stage 档（§0.5）；同样经轻量 git 子代理执行并过 V4。
- **辅助代办路由**：子代理越权请求 → 辅助者预审 → 执行或上报。
- **进度跟踪**：用工具维护环节级 todo；长流水建议建 goal 定总目标。

## 7. 中断恢复流程

会话中断（重启/压缩/换会话）后继续流水：

1. 读目标项目 `docs/ac/state.md`（无则视为新流水）。
2. `list_agents` 找回 state.md 登记的子代理（按 task_name 匹配；可 followup_task 冷恢复，已完结的按状态决定是否新起）。
3. 重建进度清单，向用户简报"恢复自环节 N"。
4. 从 state.md 的 currentStep 继续。

## 8. 环节推进口诀

> 产物先落盘，门必过人；子任务书自包含，评审必带查；打回限三轮，跳回定位准；状态随手记，每环节本地档；push 永归用户，恢复靠 state。

## 9. 阶段子任务书构造

核心：**自包含**（spawn_agent 的任务契约 v2 §0.2：objective / stage_context / scope / prohibitions / help_protocol / deliverables / acceptance）。子代理不见主控会话历史；任务书里输入只给产物文件路径与结论性摘要，验收标准逐条复制（这是评审子的对照依据）。各环节任务书模板见对应阶段技能。

**scope 拼装纪律**：契约 scope 必须落在 §0.3 该角色写域内（收紧可以、放宽违规）；开发子 scope 从 tasks.md 任务卡改动面逐条摘出（路径级 glob）；V1 派发前自检（scope ⊆ 矩阵）不过不出任务书。
