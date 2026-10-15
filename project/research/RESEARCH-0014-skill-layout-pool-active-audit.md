---
id: RESEARCH-0014
type: research
status: done
priority: P2
owner: packages/plugins
source: TASK-0113 派生审计；RESEARCH-0012 Avernet skills-pool/active 低置信度项
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: [PLAN-0011]
related_tasks: [TASK-0113]
related_issues: []
related_bugs: []
depends_on: [RESEARCH-0012]
---
<!-- Copyright The Open Forge contributors. -->

# Skill 落盘布局审计：pool/active 分离必要性裁决（TASK-0113）

## 问题与范围

`RESEARCH-0012` 标注的低置信度项：Avernet 用 `skills-pool`（只读全量库）+ `skills/`（仅激活软链）做**文件系统层**发现边界；本仓已确认有配置层过滤（`resource-selection.ts`），但「宿主 skill 落盘目录是否会被 agent 递归扫描到未激活内容」未核查。本报告只回答三件事：各来源 skill 落在哪、agent 通过什么发现、未激活正文是否可读。不审计 MCP 等其它能力，不改代码。

## 事实来源（文件与关键行）

- `packages/coding-agent/src/resources/skills/discovery.ts`：`loadSkills`（259-370）、`loadSkillsFromDirInternal`（154-228）
- `packages/coding-agent/src/resources/runtime/skill-resource-state.ts`：`loadSkillResources`（70-136）、`readDisabledMarketSkillNames`（138-157）
- `packages/coding-agent/src/resources/runtime/session-resource-runtime.ts`：`updateSkills`（296-324）、`skillPaths` 组装（226-231）
- `packages/coding-agent/src/agent-configuration/resource-selection.ts`：`selectAgentSkillSource`（44-65）、`selectAgentPlugins`（15-32）
- `apps/desktop/src/main/skills/skill-service.ts`：落盘目录与 manifest（32-34,244-291）、`shouldListSkill` 用法（168-170）
- `apps/desktop/src/main/skills/skill-list-policy.ts`、`_market-install.ts`（125-175）
- `apps/desktop/src/main/builtin-skills.ts`：`getBuiltinSkillPaths`（75-82）
- `apps/desktop/src/main/agent-runtime/resource-runtime.ts`：`skillLocations`（93-97）
- `packages/coding-agent/src/host/tool-environment/node/node-path-policy.ts`（14-43）
- `packages/runtime-node/src/coding/shared/path-resolution.ts`：`resolveToCwd`（74-86）

## 逐来源落盘位置与启停机制

| 来源 | 物理位置 | 启停方式 |
|---|---|---|
| 内置（builtin） | 打包：`resources/system-skills/`；dev：`packages/skill-presets/<name>/` | `skills-manifest.json` 中 `enabled:false` → `getBuiltinSkillPaths()` 不注入该目录路径（路径级过滤）；文件不动 |
| 插件贡献 | `<plugin>/agent/skills/` 或 `<plugin>/skills/`（preset 在 `packages/plugins/presets/*/`、externals、安装插件经 `resolveResource` 解析到安装目录） | 无按 skill 启停；经 `skillPathContributions` 注入，按插件启停或 Agent 配置的 plugin 选择（`selectAgentPlugins`）过滤 |
| 用户自定义 | `~/.vetta/agent/skills/`（user）、`<cwd>/.vetta/skills/`（project）、`~/.agents/skills/`、`<cwd>/.agents/skills/` | 均无启停语义——始终全量扫描（`.agents/skills` 可由 `experimental.agentSkills` 总开关关闭，默认开） |
| 市场安装 | `~/.vetta/skills/<name>/`（tar.gz 解压）；scene 装到 `~/.vetta/scene/<name>/` | `~/.vetta/skills-manifest.json` 记 `enabled:false` → `loadSkillResources` 按名过滤托管区；文件保留在盘上 |
| scene | `~/.vetta/scene/` | 同市场安装的 manifest 过滤（`shouldListSkill` 默认列出，`enabled:false` 除外） |

**结论：本仓激活 = 配置项 + 路径注入，不是目录软链。** 没有任何「激活时移动/链接文件」的机制；禁用只是让路径不进 `skillPaths`、或让名称被过滤掉。

## Agent 发现路径（两层事实）

### 配置层 —— 已封闭

`getSkills()` 结果 = 递归扫描所有根目录后，依次应用：

1. `loadSkillResources`：托管区（`~/.vetta/skills`、`~/.vetta/scene`）下 manifest `enabled:false` 的按名滤除；
2. `enabledPaths`/package metadata：资源包贡献项按启用状态取路径；
3. `getBuiltinSkillPaths`：disabled 内置项根本不注入路径；
4. `selectAgentSkillSource`/`selectAgentPlugins`：Agent/Team 配置的 skills/plugins 白名单交集。

Prompt 与 skill 工具只见过滤后的集合——**「未激活 skill」不会出现在技能枚举与调用面**。

### 文件系统层 —— 未封闭

- `loadSkills` 与 `computeSkillsFingerprint` **递归扫描全部根目录**，禁用项的 SKILL.md 仍被读取解析（diagnostics 与碰撞判定发生在禁用过滤之前）。
- Agent 文件工具按 `resolveToCwd` 处理路径：绝对路径原样放行、无读白名单；`isProtectedSkillOrScenePath`/`protectedCommandDirectories` 只保护**写侧**（edit/write/bash 改不了已装 skill 目录，但新建条目允许）。
- 因此模型完全可以 `Glob("~/.vetta/skills/*/SKILL.md")` 或 grep 插件目录，读到**未激活 skill 的全部正文**；`.agents/skills`、`.vetta/skills`、插件 skills 目录下文件没有任何读侧保护。

## 直接回答

**未激活 skill 正文可否被 agent 读到？——可以。** 但区分路径：

- 经 skill 枚举/`getSkills()`/skill 工具：**不可**（配置层过滤生效）。
- 经 read/glob/grep/bash 等文件工具：**可**（无读边界，未激活文件与普通磁盘文件同级暴露）。

## 裁决：暂不立项 pool/active 物理分离

理由：

1. Avernet `skills-pool` 解决的是「技能枚举面」边界；本仓配置层过滤已达到同等效果（未激活项不进 `getSkills()`）。
2. pool/active 只改变「文件躺在哪个目录」，不改变「agent 文件工具能否读」——本仓没有读侧沙箱，pool 目录照样可读；要真正封闭需先做读边界（那是另一个项目，且会影响 agent 读写任意用户文件的基本能力假设）。
3. 未激活 skill 正文不是秘密数据——其暴露面与磁盘上任意普通文件相同，不构成 skill 特有的漏洞。

## 次级观察（记录备查，不立项）

- **碰撞遮蔽边界 case**：禁用过滤发生在碰撞解析**之后**。`~/.vetta/skills` 中一个被禁用的市场 skill 若与启用中的 project/user skill 同名且赢得碰撞（用户级先于项目级），启用项会随禁用项一起消失——同名遮蔽会让「禁用」产生意外副作用。
- **`.agents/skills` / 项目 `.vetta/skills` / 插件 skills 无启停语义**：这些来源没有 manifest 通道，发现面即全量；`.agents/skills` 仅受 `experimental.agentSkills` 总开关控制。
- **fingerprint/discovery 仍遍历禁用项**：禁用 SKILL.md 参与指纹与 diagnostics，禁用时解析告警仍可能浮出。

## 复审触发条件

出现以下任一情况时重评 pool/active 或读边界：按 Agent 隔离的资源读白名单落地；`.agents/skills` 或插件 skills 引入启停语义；出现「未激活 skill 内容注入上下文」的真实事故。
