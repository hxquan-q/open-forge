---
id: TASK-0147
type: task
status: verifying
priority: P1
owner: desktop + theme-ui
source: user-request
related_requirement: [REQ-0001]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [apps/desktop, packages/theme-ui, packages/ui]
write_paths: [apps/desktop/src/renderer/domains/project/components/sidebar/add-project, apps/desktop/src/renderer/domains/project/components/sidebar/projects, apps/desktop/src/renderer/domains/project/hooks, apps/desktop/src/renderer/domains/settings/components/SshHostForm.tsx, apps/desktop/src/renderer/domains/settings/components/SshHostsSettings.test.tsx, apps/desktop/src/renderer/domains/settings/components/useSshHostsSettingsModel.ts, apps/desktop/src/renderer/shared/hooks/useSshHostFormLabels.tsx, apps/desktop/src/renderer/shared/lib/ssh-host-form.ts, apps/desktop/src/shared/i18n/locales, packages/theme-ui/src/settings/SshHostFormFieldsView.tsx, packages/theme-ui/src/settings/index.ts, project/tasks/TASK-0147-remote-project-add-host.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/desktop/src/renderer/domains/project/components/sidebar/add-project, packages/theme-ui/src/settings/SshHostFormFieldsView.tsx]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-02
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 在远程项目选择器内直接添加主机

## 目标与边界

Upstreamable。设置页已有新增主机，但「从远程主机添加项目」的主机步骤只能选已有主机；空列表只有去设置页的文字提示。本任务让用户不离开当前流程即可新增主机并继续选目录。

- 做：空/非空主机列表都有「添加主机」；保存后浏览该主机的目录；保存失败保留草稿；列表失败可重试；连接失败只重试目录，不重复保存主机。
- 做：目录步骤可给项目起别名（默认目录 basename，用户改过不再被导航覆盖，清空回落 basename）；经 `project.open({path,name})` 持久化为显示名，不改远程目录名。
- 做：选择器目录步骤标注「哪台主机上的哪条路径」；侧栏远程项目行在没有其他徽章时显示所属主机标签，缺失主机不显示原始 UUID。
- 不做：不改变 SSH 传输、凭据存储、主机去重规则、IPC、helper 协议或远端权限；不执行 RESEARCH-0018 的连接层优化；不自动测试真实主机。
- 保持：设置页新增/编辑入口、字段默认值、主进程校验、真实认证提示及主机持久化路径。
- 并发：串行。模型、共用字段和两个入口共享合同，不派 Worker，不涉及并行 Worktree。

## UX 与组件合同

Operate 模式，扩展既有工作台视觉，不重设设计系统、不引入图像或依赖。选择主机 → 就地新增 → 保存并选择目录；不再要求往返设置页，也不叠加第二层弹窗。

- `SshHostFormFieldsView` 是 theme-ui 的受控字段叶子：`value`、`labels`、`onChange` 表达输入合同，`disabled` 表达保存中的真实状态；不拥有 IPC、草稿生命周期、标题或操作区。
- Desktop shared 提供字段翻译和统一输入转换；设置页与项目选择器各自拥有提交/取消流程。不跨领域 import 设置页内部模型，也不把整个设置模型塞进项目选择器。
- 使用既有 Input/Button/Dialog 与主题 token，保持四个字段；label/htmlFor 与提示关联，目标自动聚焦，返回主机列表恢复添加按钮焦点，保存期间锁住重复提交和关闭入口。
- 浏览请求使用代次防止返回/切换主机后的迟到响应污染当前路径；失败时不可提交旧目录。
- 公共 UI 导出只新增字段 view/type，不删除旧包导出；既有设置领域 form state 类型保留别名。没有协议迁移，局部提取不新增 ADR。

## Given / When / Then

1. 无主机 → 点击添加、填写目标、保存 → 使用既有 createHost 保存，直接浏览远端目录并返回 `(hostId, path)`；重新打开可读取已保存主机。
2. 已有主机 → 添加后返回列表 → 不产生保存，已有主机仍可选择，焦点回到添加入口。
3. 保存失败 → 修改草稿后再提交 → 输入保留、旧错误清除、正确提交可选端口/身份路径。
4. 保存未结束 → 重复提交或点击关闭 → 只产生一次创建，不误关闭表单。
5. 创建成功但连接失败 → 重试 → 只重试目录读取，不再次创建主机，成功后可选择目录。
6. 主机列表读取失败 → 重试 → 显示可恢复错误，不伪装成「没有主机」。
7. 从 A 切到 B，A 的目录响应晚到 → 不能将 A 的路径登记为 B 的项目。
8. 设置页新增后编辑端口 → 共用字段正确接线，刷新列表显示保存结果。
9. 选中目录 → 项目名默认为目录 basename，用户可改为别名 → 确认后 `project.open` 收到别名，侧栏显示该名，远程路径不变。
10. 别名编辑后切换目录/主机 → 自定义名不被覆盖；清空别名 → 回落当前目录 basename；换主机 → 别名状态重置为新主机目录名。
11. 侧栏远程项目行 → 显示所属主机标签徽章与远程路径上下文；本地项目不触发主机查询、不显示远程徽章；主机缺失时不暴露 UUID。

## 验证记录

- Red：新真实组件流程测试在旧选择器上因缺少 `remotePicker.addHost` 按钮失败。首次从根配置混跑设置测试另遇 `@shared` alias 不匹配；切换到 Desktop cwd/配置后，既有设置模型基线 9/9 通过，未修改测试配置。
- 定向：在 `apps/desktop` 下运行 `bun ../../scripts/quality/run-vitest.mjs run src/renderer/domains/project/components/sidebar/add-project/RemoteProjectPickerDialog.test.tsx src/renderer/domains/settings/components/SshHostsSettings.test.tsx src/renderer/domains/settings/components/useSshHostsSettingsModel.test.tsx src/main/ssh/ssh-host-service.test.ts`，4 文件、31 测试通过。
- 测试边界：使用真实 React 组件、Radix Dialog、字段和 model，IPC 为内存替身；额外运行既有主机服务测试。不把模拟目录返回写成真实 SSH 验收。
- 额外 TSX 检查：根 Biome includes 只覆盖 `.ts`；用临时配置继承同一规则并仅扩展 includes，对明确列出的本次 TS/TSX/JSON 做检查。修正 label/htmlFor 关联；未修改仓库质量配置或放宽规则。
- `bun run check` 首轮类型/lint 通过，声明头门禁报告 9 个本次文件缺少版权头；已按新建/修改分别补头，不改 ratchet 基线。
- `test:impact` 因 theme-ui 无直接测试脚本按既有规则回退 `test:changed`，覆盖 kanban、xianxia、Desktop。首轮前两包 103 测试通过；Desktop 875 文件通过、3 文件失败、6 文件既有跳过，4626 测试通过、3 失败、32 跳过（其中 3 个因 beforeAll 超时未执行）。失败为 conversation-workspace-visibility 初始化超时、model-call-frame-contract 两例超时、knowledge-round-controller 等待快照超时。未修改相关代码或阈值。
- 将首轮 3 个失败文件使用同一 Desktop Node runner 单独复跑，3 文件 17 测试全部通过（12.11s）。此证据说明失败具有运行条件相关性，不证明具体根因；第二次完整影响面回归不与静态检查并行，仍出现 model-call-frame-contract 与 knowledge-round-controller 等未修改区域的失败。因此不能把根因直接断言为静态检查争用，也不能声称整体回归通过；没有继续修改无关模块、增加超时或反复重跑。第二轮 Desktop 最终为 875 文件通过、3 文件失败、6 文件既有跳过；4625 测试通过、7 失败、29 既有跳过。失败分布为 model-call-frame-contract（4 例超时，另有清理 hook 超时）、knowledge-round-controller（2 例超时/等待未完成）、provider-observation（1 例临时目录 EBUSY）；kanban 102、xianxia 1 测试通过。没有做原始 HEAD 的完整基线对照，不能将这些失败直接判定为既有问题。
- `bun run check` 最终通过（lint、types、guards、mobile-lint 均退出 0）。未运行 `verify:ui:*`，未启动或操作用户 Desktop，未访问真实主机/凭据，也未做实际窗口截图。

## 评审与交付

单 Agent 源码和组件行为自审，不宣称独立视觉评审。没有目标页面的已提交截图，因此本轮没有真实像素/对比度验证；沿用既有 tokens，需人工确认实际窗口外观。Impeccable context 报告已有 design sidecar 过期；本次保留 DESIGN.md/sidecar，不擅自刷新设计系统。

入口：侧栏添加项目 → 从远程主机添加 → 添加主机 → 填写连接目标（其余按需）→ 保存并选择目录 → 添加此目录为项目。正常认证由原有提示处理；失败应留在当前步骤并可重试。

当前交付为工作区中的功能实现：定向行为与完整静态检查通过，但整体验证未通过，不能标记工程完成。保持 verifying 与 integration_status: pending；不暂存、不提交或推送未完成验收的批次。人工接受待用户验收，未发布。

## TASK-0171 主树收口（2026-10-02）

实现已原子提交到 main：1269945cb。本轮完整 check 通过；组合测试 Desktop 4642、theme-ui 169、质量脚本 483 项通过，SSH 认证定向 32 项通过。CLI 首轮两例 RPC 超时保留于 TASK-0171；同一失败文件 13 项以及随后单独完整 CLI 226 项复验均通过，未改代码或阈值。各功能人工验收仍未执行，保留 verifying；待最终分支集成与推送闸门，不宣称已推送或发布。

### 人工验收实测（2026-10-08，VERIFY-0017 组三；保持 verifying 待裁定）

方法：测试级复跑声明的 4 个套件；用户面在隔离 Debug profile `04987e4e` 真实驱动，用一个**故意不存在的主机名**探针走通失败态，并在验收后**清理了探针**。

| 合同条款 | 本次读数 |
|---|---|
| 入口只在侧边栏「新建项目」菜单内 | **真实成立**：`新建项目` → 菜单四项 `新建项目/打开项目/从远程主机添加/导入项目` → `从远程主机添加` 打开「从远程主机添加项目」对话框。对照实测：**新会话页的项目选择器不挂载该菜单**（走本地 `NewProjectDialog`）——与源码一致（`AddProjectMenu` 仅由 `SidebarProjectsSection` 使用） |
| 可在选择器内直接添加主机 | **真实成立**：对话框内 `添加主机` 表单（连接目标）→ 填 `openforge-nonexistent-host-probe` → `保存并选择目录` |
| 失败可恢复、不伪装成「没有主机」 | **真实成立**：出现 `role="alert"` 的「读不到这个目录。可能是连接断开，或当前账号没有权限。」+ `重试` + `技术详情`，**不是**空的「无主机」态 |
| 重试只重读目录、不重复创建主机 | **真实成立**：主机经 `createHost` 落盘到 `ssh-hosts.json`（`source: manual`，id `db2601af-b090-47d8-ba5b-1a9a024cf22d`）；点 `重试` 后主机数**仍为 1、id 不变** |
| 测试级：`RemoteProjectPickerDialog.test.tsx`、`SshHostsSettings.test.tsx`、`useSshHostsSettingsModel.test.tsx`、`ssh-host-service.test.ts` | **4 文件 / 34 例通过，0 失败** |
| 清理 | 探针主机已从 `ssh-hosts.json` 移除（`hosts` 回到 `[]`） |

- **未覆盖**：**成功路径**——「添加真实主机 → 列出远端目录 → 选中一个远端项目并加入侧边栏」。本轮用不存在的主机名只能走到失败态；成功态需要一台真实 SSH 主机，属各 SSH 任务的共同边界（不连真实主机）。
- **关闭建议**：入口唯一性、失败态可恢复性、主机持久化与重试语义在用户面全部成立，测试级全绿；缺的只有成功路径（需真实主机）。倾向 `done`，是否要求补真实主机成功路径，请用户裁定。
