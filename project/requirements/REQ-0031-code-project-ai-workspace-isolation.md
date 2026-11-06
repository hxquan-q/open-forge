---
id: REQ-0031
type: requirement
status: ready
priority: P1
owner: desktop
source: user-confirmed workspace requirement D:/Coding/WorkSpace/Vetta/vetta-code-mode-ai-workspace-isolation.md
created: 2026-11-05
updated: 2026-11-05
related_requirement: [REQ-0030]
related_plan: [PLAN-0029]
related_tasks: [TASK-0449]
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Code 项目 AI 辅助工作区与项目源码分离

## 用户问题

Code 模式的项目配置、Memory / Journal 和 Agent 辅助材料部分写入项目目录，造成源码仓库噪声、意外提交和项目数据混杂。Code 项目还没有独立、持久且按项目隔离的 AI 工作区。

## 用户结果

每个 Code 项目在 Vetta 用户数据目录拥有稳定的 AI 工作区。同一项目的单 Agent、Agent-Team、Team 成员及多会话共享工作区；不同路径、同名目录及不同 SSH 主机/远端路径相互隔离。源码与正式交付物仍留在项目根，AI 辅助材料默认写入 AI 工作区。

## 范围

- Code 项目持久化信息、需求/研究记录、Agent 生成 Skills/Prompt 辅助资料、Memory / Journal 与运行辅助记录使用项目 AI 工作区。
- Code Prompt 传递明确的项目根、AI 工作区根及落点规则；文件工具只授权当前项目根与当前 AI 工作区根。
- 配置 UI 覆盖 Allstar 登记项目和所有可见的 Code 项目（含未登记但有历史 Code 会话的项目）。保存任意用户文本原样往返；不解释或验证文本。
- 首次启用时逐文件迁移旧 Memory.md / Journal.md，遵守复制成功后删除、失败保留、目标冲突不覆盖的合同。
- 归档/取消登记及仅移除项目时保留工作区；硬删除项目时清理对应工作区。路径变化不自动发现、移动或关联旧工作区。
- 本机与 SSH 项目均使用本机 Vetta 数据目录中的项目 AI 工作区，同时保留 SSH 项目根的现有远程权限边界。

## 不做什么

- 不迁移旧 `.vetta/allstar/project-config.md` 或其他 `.vetta/**` 项目资源。
- 不迁移源码、会话 transcript 或 Desktop 运行日志。
- 不解析项目配置文本、不验证服务连接，不增加 Nacos/数据库专用逻辑。
- 不改变 Team 并发写语义或把项目 AI 工作区作为正式交付物自动迁入源码目录。

## Given / When / Then

- Given 一个本地或 SSH Code 项目，When 首次使用、创建会话或 Vetta 重启后恢复，Then 解析到同一稳定项目 AI 工作区；同名不同位置不共享。
- Given 同一项目的多个 Code 会话、Team 主控与成员，When 读取或写入辅助资料，Then 共用同一 AI 工作区；源码/测试仍写项目根。
- Given Agent 获得文件工具，When 尝试当前项目根或当前 AI 工作区内路径，Then 按既有行为读写；When 尝试另一个项目 AI 工作区或 Vetta 任意数据，Then 被拒绝。
- Given 旧 cwd 中存在 Memory / Journal，When 新工作区首次初始化，Then 每个文件独立复制；仅目标复制成功才删除旧副本，失败或冲突保留源文件且不阻断新工作区使用。
- Given 任意 Code 项目，When 用户保存项目持久化文本并重开入口，Then 原文不变且 Code 模式可按需读取；不要求 Allstar 册登记。
- Given 项目归档/移除登记或硬删除，When 生命周期操作完成，Then 前两者保留 AI 工作区，硬删除则清理它。

## 必须保持的不变量

- AI 工作区身份不使用显示名或 basename；本地与 SSH 路径采用各自规范化和大小写语义。
- 项目路径变化按新项目处理，不自动复用旧数据；同一路径的普通册与 Allstar 册仍是独立登记关系。
- Prompt 中项目资料为不可信上下文，不能覆盖系统规则或扩大宿主权限。
- Memory / Journal 的共享及既有并发语义不变。
- 旧配置文件不会自动迁移或被静默覆盖。

## 验收标准

- [ ] 所有 Code 项目首次使用、新建会话和 Vetta 重启后解析同一项目 AI 工作区。
- [ ] 单 Agent、Team 主控、Team 成员及同项目多会话遵循同一映射与落点规则。
- [ ] 同路径同项目共享；basename 相同但路径不同、SSH host/path 不同则隔离。
- [ ] 项目配置入口覆盖所有 Code 项目，任意用户文本原样持久化，Prompt 可按需读取且不做外部服务验证。
- [ ] Memory / Journal 默认进入 AI 工作区；旧文件逐文件遵循 copy-then-delete、失败保留和冲突不覆盖。
- [ ] 归档/移除保留工作区；硬删除清理对应工作区；路径变更不自动迁移/复用。
- [ ] 文件工具只允许当前项目根与当前 AI 工作区根；本地、SSH、路径越界及符号链接边界均有测试。
- [ ] 源码/测试/构建配置仍落项目根；AI 工作区不会因默认路径进入项目 Git。

## 风险与失效条件

文件工具的路径权限可能由本机 Node 与 SSH 远程适配器分别执行，必须验证两条路径使用同一项目身份和授权边界。初始化迁移可能部分成功，因此两个文件须独立、可重试且不覆盖目标。真实 Electron、LLM 与 SSH 主机验收不属于自动化工程测试，按授权另行执行。
