---
id: TASK-0409
type: task
status: ready
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
execution: serial
branch: main
worktree:
base_commit: 9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d
read_paths: [packages/plugins/presets/vetta-ui-design]
write_paths: [packages/plugins/presets/vetta-ui-design/src/tools.ts, packages/plugins/presets/vetta-ui-design/src/vetd, packages/plugins/presets/vetta-ui-design/src/assets, packages/plugins/presets/vetta-ui-design/agent, packages/plugins/presets/vetta-ui-design/test]
exclusive_paths: []
depends_on: [TASK-0408]
conflicts_with: [TASK-0407, TASK-0408]
integration_status: pending
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# 设计方向选择与质量检查闭环

## 目标

生成设计前形成适合需求的方向，生成后能发现未落实的主题、字体、素材与布局问题，并据此修订。可执行质量检查和用户视觉验收分别留证，不以自动绿灯代替审美判断。参照 [PLAN-0025](../plans/PLAN-0025-upstream-mcp-design-adaptation.md) 与 [PLAN-0018](../plans/PLAN-0018-design-plugin-roadmap-v2.md)，仅实施本任务范围。

## 范围

### 并发评估

- 结论：本批必须串行；执行方式 `serial`，无并行 Task。
- 前置依赖：TASK-0408 工程交付与集成，复用其真实素材及 credits 合同。
- 冲突文件/独占路径：工具注册、agent 指引、素材目录和检查/渲染测试；与 TASK-0407/0408 共享设计状态，不并行写入。
- Branch：`main`；Worktree：当前主工作区，不另拆；集成负责人：Coordinator。
- 集成顺序：0406 → 0407 → 0408 → 0409。

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

## 测试与验证

- 新增方向/诊断 fixture，覆盖三案差异约束、已有方向复用、占位主题、字重/加载失败、credits 和错误严重度；通过 `bun scripts/quality/run-vitest.mjs --run <新增测试路径>` 运行。
- 复用 `test/render-verification.test.ts` 及相关源码检查/脚手架测试，覆盖正常工具入口的“选方向→落实设计→诊断→修订→再检查”，包括旧设计兼容和过期结果拒绝。
- `bun run test:impact -- packages/plugins/presets/vetta-ui-design/src/tools.ts packages/plugins/presets/vetta-ui-design/src/vetd`；公开工具/agent 合同变化按政策补 `test:changed`。
- 插件目录 `bun run build` 与根目录 `bun run check`；评审实际提示词、工具 Schema、许可清单及结果语义。真实模型效果不由 Mock 测试结论替代。
- 实施后提供固定案例的候选产物与视觉验收步骤。真实模型调用、UI 实机验证依当轮明确授权执行；未运行的部分列为待验收。

## 验收分层

- 工程验证：待执行；方向工具和质量诊断尚未实施。
- 技术评审：未执行；重点为诊断有效性/误报、旧设计兼容、字体许可及提示词合同。
- 集成：pending；无功能实现提交。
- 人工功能验收：待验收；固定案例产物须单独评审，不因测试通过自动接受。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：未来候选版本的设计工具，继承 TASK-0408 的素材能力；准备新需求和已有品牌设计各一份。
- 输入：为工作台给出三种有差异的方向并落实选择；再给照片落地页导入真实素材，运行检查、修复并重开；已有品牌仅修改局部。
- 预期：方向能辨认且持续保留，照片与内容相关，诊断可操作，修订后产物可用；交付方案、产物、检查结果与视觉评审记录。
- 不通过：同质方案、每轮重置方向、假字体/占位图、警告无定位、误报迫使删功能或检查绿灯但产物不可用。反馈写回本 Task 的评估案例，缺陷另关联 Bug。

## 交付记录

- 实际修改：仅立项文档；本轮文档验证见 PLAN-0025。
- 未运行：功能/模型评估、渲染验证、构建、完整检查及视觉验收，原因是本轮未实施。
- Worktree：本批串行，沿用主工作区，未创建独立 Worktree。
- 剩余风险：设计审美与真实模型遵循度需人工评估，自动检查只覆盖声明的确定性合同。
- 发布说明：本轮依据见 PLAN-0025；后续分别说明可用方向能力、检查范围及限制。
