<!-- Copyright The Open Forge contributors. -->
# 项目共享约定：`.vetta/` 与 `.vetta-local/`

适用版本：清单 schema v1（`packages/coding-agent/src/projects/shared-project-conventions.ts` 为事实源）。

## 哪些目录随 Git 共享

项目根下的 `.vetta/` 目录是**团队共享**的项目级约定，签入仓库后随克隆生效：

| 子目录 | 内容 | 缺省 |
| --- | --- | --- |
| `.vetta/agents/` | 项目级 Agent 人格绑定说明 | 启用 |
| `.vetta/skills/` | 项目技能（`SKILL.md` frontmatter 约定不变） | 启用 |
| `.vetta/task-templates/` | 任务模板（TASK-0008 合同的引用格式） | 启用 |
| `.vetta/policies/` | 项目策略（只能收紧，不能放宽宿主与用户策略） | 启用 |

`.vetta/project.json` 是清单：`schemaVersion`（必填，当前 `1`）+ 各子目录启用开关（缺省 `true`）。
没有清单时按 v0 旧行为装载（目录存在即启用），完全向后兼容。

## 哪些内容只留在本机

- `.vetta-local/` 只存本机状态（Project Trust `trust.json` 等），**绝不入库**。首次打开项目时
  应用会把 `.vetta-local/` 追加进项目 `.gitignore`（带标记段）；已经手写过忽略规则的文件不会被改动。
- 会话与运行数据仍在用户主目录（`~/.openforge`），与项目目录互不混用（ISSUE-0001）。

## 版本与迁移合同

- 读取限定在当前 project root，任何越出项目根的路径直接拒绝；
- 未知 `schemaVersion` fail closed：报错并给出恢复路径（升级应用或移除清单），不猜格式、不读内容；
- v0 → v1 迁移即「无清单 → 补清单」，无数据改写；未来版本必须提供旧版本 fixture 与显式迁移器；
- `.vettapkg` 插件包生态路径不受本约定影响。

## 使用

```text
my-project/
├── .gitignore              # 含 .vetta-local/ 忽略（应用自动引导）
├── .vetta/
│   ├── project.json        # {"schemaVersion": 1}
│   ├── skills/
│   └── policies/
└── .vetta-local/           # 本机状态，不签入
```
