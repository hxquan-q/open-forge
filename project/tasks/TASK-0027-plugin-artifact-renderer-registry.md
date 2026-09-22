---
id: TASK-0027
type: task
status: blocked
priority: P2
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: unassigned
worktree: unassigned
base_commit: forge/dev
read_paths: [packages/plugins, apps/desktop]
write_paths: [packages/plugins, apps/desktop]
exclusive_paths: [apps/desktop/src/main/ipc]
depends_on: [TASK-0015, TASK-0016, TASK-0020, TASK-0021]
conflicts_with: []
integration_status: pending
created: 2026-09-22
updated: 2026-09-22
---

# Plugin Artifact Renderer Registry 集成

## 目标

复用现有 Plugin contribution 边界，为 Artifact descriptor 增加可验证的 Renderer 注册/解析路径，使 UI 只能通过宿主授权读取 descriptor 指向的资源。

## 范围

### 并发评估

- 结论：条件支持；需与 TASK-0021 Catalog 改动协调 Desktop/Plugin 装配文件。
- 执行方式：serial（默认）；确认独占 IPC/Registry 路径后再决定是否可用 Worktree。
- 前置依赖：TASK-0015 Artifact descriptor、TASK-0016 grant/approval、TASK-0020 project root/URI 规范化。
- 冲突文件/独占路径：`apps/desktop/src/main/ipc` 与 renderer registry adapter。
- 集成负责人：coordinator。

### 做

- 通过既有 Plugin contribution API 注册 Renderer 类型与 schema；
- descriptor 结构验证、URI/project-root 授权检查后再调用 Renderer；
- 未注册、未知 kind、权限不足、插件停用或资源缺失时回退到安全的通用文件卡/错误态；
- Plugin 停用或 Session 释放后撤销注册并清理订阅。

### 不做

- Plugin SDK 私有字段或绕过 grant 的绝对路径读取；
- 新建第二套 Renderer/Capability Registry；
- 未经单独兼容评估修改仓库外插件公开 API。若确需公开合同变化，先拆出 Plugin SDK Task 并同步手册、CHANGELOG 与合同测试。

## Given / When / Then

- Given：一个已验证的 Artifact descriptor 和声明 Renderer 的已授权插件；
- When：用户打开 Artifact，随后停用插件或撤销相关读取 grant；
- Then：授权期间使用对应 Renderer；授权撤销/插件停用后不再访问资源并安全降级，未知 Renderer 不阻断其他 Artifact 展示。

## 必须保持

- Renderer 只读 descriptor 投影，不成为 Artifact 内容事实源；
- UI payload 不注入模型可见 `content`；
- Plugin 不能通过自述的只读标签扩大权限。

## 阻塞

- Artifact descriptor、Approval/Grant 与项目 URI 规范化合同完成前，不开放 Plugin Renderer 对文件资源的读取。

## 测试与验证

- 定向：合法/拒绝 descriptor、URI 越界、未知 Renderer、停用/撤销后访问被阻止、缺失资源降级测试；
- 用户流程：授权插件注册 → 打开 Artifact → 撤销/停用 → 再次打开时通用安全降级；
- 质量检查：`bun run check:quick`、Desktop/Plugin 相关影响测试；若公开 API 有变化，另运行 SDK 合同和目标插件 build。

## 交付记录

- 实际修改：
- 实际运行：
- 未运行及原因：
- 剩余风险：
