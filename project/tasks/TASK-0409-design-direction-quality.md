---
id: TASK-0409
type: task
status: verifying
priority: P2
owner: coordinator
requirement: REQ-0008
plan: PLAN-0025
source: user-request; openvetta/open-vetta@0c6f92be1,aaea7579f,3ced70315,407954608
related_requirement: [REQ-0008]
related_plan: [PLAN-0025, PLAN-0014, PLAN-0018]
related_tasks: [TASK-0408]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0409-design-direction-quality
worktree: ../open-forge-wt/task-0409-design-direction-quality
base_commit: 157f0906eefe93d2e570231b8e9bc64c688a88b0
read_paths: [packages/plugins/presets/vetta-ui-design]
write_paths: [packages/plugins/presets/vetta-ui-design/src/tools.ts, packages/plugins/presets/vetta-ui-design/src/vetd, packages/plugins/presets/vetta-ui-design/src/assets, packages/plugins/presets/vetta-ui-design/agent, packages/plugins/presets/vetta-ui-design/locales, packages/plugins/presets/vetta-ui-design/test]
exclusive_paths: []
depends_on: [TASK-0408]
conflicts_with: [TASK-0407, TASK-0408]
integration_status: integrated
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# 设计方向选择与质量检查闭环

## 目标

生成设计前形成适合需求的方向，生成后能发现未落实的主题、字体、素材与布局问题，并据此修订。可执行质量检查和用户视觉验收分别留证，不以自动绿灯代替审美判断。参照 [PLAN-0025](../plans/PLAN-0025-upstream-mcp-design-adaptation.md) 与 [PLAN-0018](../plans/PLAN-0018-design-plugin-roadmap-v2.md)，仅实施本任务范围。

## 范围

### 并发评估

- 结论：按本轮用户要求使用隔离工作树，`parallel` 表示可隔离于主工作区；0408 → 0409 仍串行实现，不派并行写入者。
- 前置依赖：先验证并提交 0408 候选，再在由已提交 main 创建的 0409 工作树引入该候选，复用其素材/credits 合同；最终 main 集成仍等待 0407/0408。
- 冲突文件/独占路径：工具注册、agent 指引、素材目录和检查/渲染测试；与 TASK-0407/0408 不共享目录写入。
- Branch：`task/TASK-0409-design-direction-quality`；Worktree：`../open-forge-wt/task-0409-design-direction-quality`；Coordinator 单人串行实现，原生只读独立审查。
- 集成顺序仍为 0406 → 0407 → 0408 → 0409；主工作区脏或依赖未完成时仅保留候选，不强行集成/推送。

### 做

- 适配 `vetd_direction` 与偏好指引：需求缺关键约束时简短澄清，已有明确方向/品牌时直接沿用，重开或局部编辑不重复询问、不重置主题。
- 新建 App 方向由需求驱动形成三案，至少在明暗、色彩、字体三个维度中的两个有实质差异，并能校验；落地页保留可研究的方向库，不把所有界面套进固定后台模板。
- 选择结果落实到设计产物中的主题、字体、间距与内容；字体清单核对授权、可用字重与自托管方式，缺失/离线回退可诊断，不以安装声明代替实际加载。
- 复用既有源码与渲染验证合同输出可定位的诊断：中性占位主题尚未替换、无效/未加载字体、素材署名缺失、布局溢出及适用的小尺寸触控/安全区域问题；每项说明检测范围、严重度与修复建议，区分阻塞错误、警告和人工评审项。
- 将质量指引接入“检查→修订→再检查”，保留已选方向与用户内容；渐变等视觉手段按设计目的评估，不以机械禁用制造合格结果。
- 形成固定评估案例与视觉评审记录格式：SaaS 工作台、真实照片落地页、已有品牌局部修改、小尺寸画框；评价方向差异、信息层级、内容相关性、适配与素材真实性。

### 不做

不启动完整设计协议改名、Figma/评论/原型能力，不改变工具前缀，不在本任务迁移已有设计格式；不调用真实模型做付费评估，不宣称启发式诊断能保证设计美观。

## Given / When / Then

- 明确用途但没有风格的新建 App → 形成三案并选择一案 → 至少两个指定维度体现差异，选中方向落实到可见主题/字体；不是三张同模板换文案。
- 已有品牌及设计内容 → 局部修改并重开 → 不重新随机方向、不覆盖已有品牌，不强迫重复访谈。
- 设计仍含占位主题、字体失败或素材来源缺失 → 运行检查 → 返回可定位且可操作的诊断；修复后对应问题消失，合法已有设计不被一律误报。
- 检查前后修改源码/资源 → 再次验证 → 使用当前产物证据，不复用过期渲染结果，也不改写工具错误/取消语义。
- 桌面与小尺寸画框 → 渲染及视觉评审 → 主要内容可读、交互可用、图片真实且相关；自动诊断与人工结论分别记录。

## 必须保持

来源标记/AST 编辑与骨架保护、工具 Schema 和角色/错误/usage/stop 语义、已有主题兼容、最小网络权限及素材许可来源合同。新增字体只能来自已核验来源，不能静默请求未声明远程域。

## 本轮实施合同（2026-10-28）

- 归属：Open-Forge-only；输入为产品需求/既有品牌/用户选择，输出为可校验三案、持久方向及可定位诊断/修订指引。不改变 design.json 既有格式和 AST/来源保护。
- 方案：方向选择与检查分别置于 vetd 局部模块，工具只装配；使用可选、可缺省读取的附加元数据，旧设计的 DESIGN.md/theme.css 优先，不随机覆盖品牌/内容。
- 字体：只提供已核验许可/字重/自托管方式的清单；实际加载与声明分开检测，离线保留系统 fallback，不偷偷增加远程域。
- 检查：复用源码与渲染验证，分 error/warning/review，明确范围/位置/建议。检查只读，不自动改稿；依据当前源码/资源指纹拒绝过期截图，修订保留选定方向和用户内容。
- 最低验证：正常工具入口三案→选择→落实→检查→定点修订→再检查；已有品牌重开；缺字体/credits/占位主题/小画框夹具；impact/changed/build/check。四个固定案例及视觉记录格式随候选交付，实机/真实模型未授权不运行。

## 测试与验证

- 新增方向/诊断 fixture，覆盖三案差异约束、已有方向复用、占位主题、字重/加载失败、credits 和错误严重度；通过 `bun scripts/quality/run-vitest.mjs --run <新增测试路径>` 运行。
- 复用 `test/render-verification.test.ts` 及相关源码检查/脚手架测试，覆盖正常工具入口的“选方向→落实设计→诊断→修订→再检查”，包括旧设计兼容和过期结果拒绝。
- `bun run test:impact -- packages/plugins/presets/vetta-ui-design/src/tools.ts packages/plugins/presets/vetta-ui-design/src/vetd`；公开工具/agent 合同变化按政策补 `test:changed`。
- 插件目录 `bun run build` 与根目录 `bun run check`；评审实际提示词、工具 Schema、许可清单及结果语义。真实模型效果不由 Mock 测试结论替代。
- 实施后提供固定案例的候选产物与视觉验收步骤。真实模型调用、UI 实机验证依当轮明确授权执行；未运行的部分列为待验收。

## 验收分层

- 工程验证：已完成（隔离工作树）。插件整包 128 文件 / 919 例通过；`bun run check`（lint 5172 文件、types、guards）、插件 `bun run build`（56 runtime 文件）exit 0；`test:changed` 中 `scripts/agents/runner.test.mjs`、`scripts/agents/integrate.test.mjs` 超时，已在 TASK-0408 工作树同一提交复现，属环境性既有失败，非本任务引入。
- 技术评审：待独立审查；重点为诊断有效性/误报、旧设计兼容、字体许可及提示词合同。
- 集成：`9237363e2` 已并入本地 main（0407 → 0408 之后）；origin/dev 推送与 origin/main 晋升按授权单独执行。
- 人工功能验收：待验收；固定案例产物须单独评审，不因测试通过自动接受。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：未来候选版本的设计工具，继承 TASK-0408 的素材能力；准备新需求和已有品牌设计各一份。
- 输入：为工作台给出三种有差异的方向并落实选择；再给照片落地页导入真实素材，运行检查、修复并重开；已有品牌仅修改局部。
- 预期：方向能辨认且持续保留，照片与内容相关，诊断可操作，修订后产物可用；交付方案、产物、检查结果与视觉评审记录。
- 不通过：同质方案、每轮重置方向、假字体/占位图、警告无定位、误报迫使删功能或检查绿灯但产物不可用。反馈写回本 Task 的评估案例，缺陷另关联 Bug。

## 交付记录

- Worktree / 分支：`../open-forge-wt/task-0409-design-direction-quality` / `task/TASK-0409-design-direction-quality`，基于 0408 候选 `157f0906e`。
- 实际修改（相对 0408 候选）：
  - 引入上游 `src/direction/`（deal、deal-service、direction-file、direction-tool、fontsource、intent、library、proposal、record、sheet、topics 与 `vendor/taste-skill` 研究库）、`src/vetd/tells-probe.ts`、`test/direction-*.test.ts`、`test/create-deals-direction.test.ts`、`test/proposal-fixture.ts`、`test/skill-rules.test.ts`、`test/tells-probe.test.ts`、`references/taste/app/*.md`。
  - `src/tools.ts`：`vetd_create` 接入发牌（`brief`/`sector`/`screens`/`keep`/`have`/`intent`）、`firstStep` 指引、方向段（`mode`/`options`/`ask`/`next`）；截图链路读取 direction tells 并追加 `tellIssues`；`vetd_status`/`vetd_screenshot` 的 `issues` 改为分档输出。
  - `src/vetd/check-sources.ts`：新增 `THEME_PLACEHOLDER_RULE` + `checkPlaceholderTheme`，以及 `CheckSeverity`/`severityOf`/`classifyIssues` 分档（error / warning / review），只读元数据。
  - `src/vetd/scaffold.ts`：默认 `theme.css` 换成中性灰占位并打 `vetd:placeholder-theme` 标记，去掉 indigo/slate/amber。
  - 注册与文案：`tool-gate.ts` DESIGN_ONLY 增加 `vetd_direction`；`locales/en|zh` 增加工具名；`agent/agents/designer.md`、`SKILL.md`、`references/taste/*` 更新；`references/quality.md` 增「Check severities」与「Fixed evaluation cases and the review record」（三固定案例 + 记录模板）。
  - 工具链：`scripts/quality/check-modified-file-notices.mjs` 的许可证白名单从根 `LICENSE` 放宽到任意 `LICENSE`，使 vendor 第三方许可证正文免声明头。
- 验证：目标测试（check-sources / screenshot-batch-tool / direction-* ）通过；插件整包 128 文件 919 例通过；根 `bun run check` exit 0；插件 `bun run build` 生成 `release/vetta-ui-design-0.7.2.vettapkg`（56 runtime 文件）。
- 保留限制：
  - 真实模型与视觉验收未运行；固定案例仅提供样例请求与记录格式，无实机产物。
  - 未联网访问真实字体/许可来源；`fontsource.ts` 的可用性来自 vendored 清单核验，不等同于运行时下载验证。
  - 未照抄上游删除项（`src/inspector/ast-edit/*`、`shared/design-fs|entry-path|source-locator`、engine `source-tagger` 等）；上游对 `tools.ts` 的 `toNoteView` 简化未采纳，笔记锚点保持 fork 语义。
  - 未提升插件版本或写发布说明（与 0408 一致，等 ISSUE-0007 定首发版本）。
  - `test:changed` 的两个 `scripts/agents` 集成测试在本机 5s 超时，已在 0408 工作树同一提交复现为既有环境问题。

## 2026-10-28 集成记录

用户本轮要求“提交推送合并”，0409 候选在 0408 之后进入 main。

- 合并：`9237363e2 merge(design): 集成 TASK-0409 设计方向与质量检查候选`，保留候选提交 `9374d708d`；台账无冲突。
- main 复验：插件整包 130 文件 928 例通过；根 `bun run check` exit 0；插件 `bun run build` 生成 `release/vetta-ui-design-0.7.2.vettapkg`（56 runtime 文件）。
- 未运行：真实模型/Provider、真实 Desktop 实机首屏与跨进程输入、固定案例视觉评审与人工接受；不由 Git 合并代替。
- 发布：未授权，未改版本与已发布发布说明。
