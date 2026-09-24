---
id: TASK-0023
type: task
status: done
priority: P1
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: coordination-only
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [exprot/ui-information-architecture.md, exprot/mvp-scope.md, apps/desktop/DESIGN.md, apps/desktop/src/renderer]
write_paths: [apps/desktop/.impeccable/surfaces, project]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-09-22
updated: 2026-09-22
---

# work/coding 双模式信息架构与面板交互设计定稿（shape）

## 目标

把 `exprot/ui-information-architecture.md` 的 IA 骨架落成可执行设计规格，
让 TASK-0015~0021 里的 UI 工作有据可依，不在实现阶段临时发明交互。

## 范围

### 并发评估

- 结论：支持并发（纯设计产出，只写设计文档/surface brief，不碰产品代码）
- 并发方式：coordination-only，不创建代码 worktree
- 可并行 Task：与 TASK-0015/0016 并行；理想时序是先于 TASK-0017 定稿
- 前置依赖：无（消费 exprot IA 文档与现有 DESIGN.md）
- 冲突文件或独占路径：仅新增 surface brief 与项目文档
- 集成负责人：coordinator

### 做

按 IA 文档逐节产出定稿，写为 `apps/desktop/` 下的 surface brief（沿用
impeccable surface-brief 约定）或 `project/` 设计文档：

1. **Shell 骨架**：Mode Switcher（work/coding）的位置、形态（segmented
   control 或等价物）、模式切换时的布局过渡与状态保留语义；
   Project/Workspace Selector 与会话列表的归位。
2. **work 入口布局**：左中右三栏职责、Plan/Progress、Source Files、
   Dataset Preview、Artifact Preview、Review/Export 的面板规格与空态。
3. **coding 入口布局**：Chat+Plan+Diff 中区、Activity/Approval/Terminal/
   Test Result/Artifact 面板归位；Profile、Permission Mode、Trust 状态的
   常驻展示位置；高风险操作摘要的呈现规范。
4. **Task Activity Panel**：Plan / Current Step / Tool Execution /
   Approval Request / Recovery-Review 的组件清单、状态机驱动的视觉状态
   （pending/running/succeeded/failed/cancelled 的 token 映射）。
5. **Approval 卡片规格**：IA §5 列出的全部字段（Task/Turn、Tool 名、风险
   等级、受影响资源、参数摘要、外部副作用、四级授权选项、Trust scope/
   来源/过期）的信息层级与密度；L0-L4 的视觉分级语言。
6. **Artifact 面板渲染矩阵**：Markdown/JSON/CSV/Diff/图片/Execution Result/
   Research Evidence/Bundle 各 descriptor 的呈现方式与降级态；Plugin
   Renderer 注册边界。
7. **空态、加载态、错误态、取消态**：每个新面的 empty/error/cancelled
   文案与恢复路径；i18n key 规划。
8. **token 与组件映射**：每个新组件落到 DESIGN.md 既有 token/组件纪律
   （1px 线条、无阴影卡片、`<Button>` variant、emerald/amber 语义色白名单），
   禁止发明新视觉语言。

### 不做

- 不写任何产品 `.tsx`/`.css` 实现代码；
- 不改写 DESIGN.md 既有规范（只在其约束内定稿新面）；
- 不引入新字体、新色板、新动画体系；
- 不覆盖 `impeccable` 未确认的存量 PRODUCT.md 结构。

## Given / When / Then

- Given：TASK-0017~0019/0024 的实施者拿到本定稿；
- When：实现任一 IA 面；
- Then：布局归属、组件选型、状态视觉、空/错/取消态、i18n key 均有唯一答案，
  不需要再发明交互或视觉语言。

## 必须保持

- IA §8 UI 不变量逐条映射为设计约束：Renderer 不持终态、关面板不取消
  Task、事件可重放补快照、崩溃后可从 projection 恢复、审批信息可审计；
- DESIGN.md 全部硬性规范（token、1px、无阴影、Button 纪律）；
- 所有用户文案 i18n；快捷键进 keybinding 对象。

## 测试与验证

- 设计评审：对照 IA §1-6 逐节核对覆盖率，对照 DESIGN.md 核对违规为零；
- 验收：定稿中每个组件能映射到现有 token/组件或明确标注「需新增」；
- 无代码产出，不跑测试套件。

## 交付记录

- 实际修改：新增 `apps/desktop/.impeccable/surfaces/workspace-modes.md`（IA §1–§8 全节定稿 + Direction contract）；write_paths 由 `apps/desktop/surfaces` 调整为 impeccable 约定的 `.impeccable/surfaces/`。
- 实际运行：`impeccable context --target apps/desktop`（确认 DESIGN.md 在位、Operate 模式）；IA §1–6 逐节覆盖核对。
- 未运行及原因：无代码产出，不跑测试套件（按任务约定）。
- 剩余风险：定稿基于骨架阶段假设；TASK-0015/0016 数据合同落地后 §4/§5 的字段密度可能需要微调。
