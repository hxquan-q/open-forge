# 数据目录与迁移约定

## 1. 目标

在不破坏当前 Open Vetta Session 存储的前提下，引入项目级共享配置、本机 Trust 和 Task/Artifact 投影。

原则：

- 复用 ConversationRepository 和现有 JSONL 事件；
- 不把凭据和本机授权放入 Git；
- 不为 MVP 引入第二套数据库；
- 新格式可增量读取，旧会话可继续恢复；
- 文件路径、Session identity 和 Project root 必须明确区分。

## 2. 目录分层

```text
~/.vetta/
├── agent/
│   ├── sessions/             # 全局 Session JSONL / 历史会话
│   ├── skills/               # 用户手写 Skill
│   └── mcp.json              # 用户级 MCP 配置
├── plugins/                  # 用户插件版本
├── themes/                   # 远程主题
├── skills-manifest.json      # 市场 Skill 台账
└── ...                       # 全局设置和缓存

<project>/
├── .vetta/
│   ├── agents/               # 可共享 Agent Profile
│   ├── skills/               # 项目 Skill
│   ├── task-templates/       # Task 模板
│   ├── policies/             # 非敏感项目策略
│   ├── artifacts/            # 可选 Artifact 索引/引用
│   └── project.json          # 项目级非敏感配置
├── .vetta-local/
│   ├── approvals/            # 本机审批记录/投影
│   ├── trust.json            # Session/Project Trust
│   ├── runtime/              # 本机运行状态
│   └── caches/               # 缓存
└── .gitignore
```

`.vetta/` 是共享配置候选目录；`.vetta-local/` 默认加入 `.gitignore`。凭据继续进入 Electron safeStorage/OS credential store 或现有模型 credential store。

## 3. Task 和 Artifact 的存储策略

MVP 不新增独立 Artifact DB：

- Task/Artifact 生命周期以结构化 Event 进入现有 ConversationRepository；
- Task snapshot/Artifact descriptor 是可重建 projection；
- 文件内容保留在用户文件系统；
- descriptor 通过 URI、checksum、source task/session/turn 引用文件；
- UI 卡片只保存 descriptor/reference，不复制大内容；
- `details` 可承载 renderer 所需结构化数据，但不进入 LLM `content`。

如果后续需要跨 Session 搜索 Artifact，可以增加 `ArtifactRepository` Adapter；不得先在 UI 或 Plugin 内部建立私有事实源。

## 4. 迁移原则

### 4.1 旧 Session

- 旧 JSONL 事件保持可读；
- 新 projection 遇到旧消息时按缺省字段解释；
- 不在活动 Agent 执行路径恢复 `src/core`/旧兼容入口；
- 历史格式转换保持在 `sessions/legacy/` 或明确迁移边界。

### 4.2 新事件

建议新增事件前先确定：

- schema version；
- sessionId/taskId/turnId 是否必填；
- 是否模型可见；
- 是否可重放；
- 是否需要终态；
- 失败和取消如何表达；
- 旧版本读取时的缺省值。

### 4.3 Trust

`trust.json` 是本机策略，不进入 Conversation canonical log，也不进入共享 `.vetta/`：

```json
{
  "version": 1,
  "grants": [
    {
      "scope": "project",
      "projectRoot": "...",
      "capabilities": ["project.read", "project.write"],
      "source": "user",
      "issuedAt": 0,
      "expiresAt": 0
    }
  ]
}
```

实际实现必须运行时校验、规范化路径、支持撤销和过期，不应直接信任 JSON。

## 5. Git 边界

默认可提交：

- Profile；
- Skill；
- Task Template；
- 非敏感 Tool Policy；
- Artifact 引用和必要元数据。

默认忽略：

- API Key/OAuth；
- Session；
- 个人 Memory；
- Trust/Approval；
- 本机绝对路径；
- 运行时 pid、锁和缓存；
- Shell 输出中可能包含的秘密。

## 6. 迁移验证

每个持久化变更至少验证：

- 新数据写入和读取；
- 旧数据读取；
- 缺少新字段；
- 未知字段；
- 中断追加后的恢复；
- 重复事件/重复投影；
- 文件缺失或 checksum 不匹配；
- Trust 撤销和过期；
- 跨 Windows 路径规范化。
