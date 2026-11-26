// Modified by The Open Forge contributors.
/**
 * - 2.2.0：团队成员的角色槽位与跨插件引用（`agents[].roles`、`members[].role/optional`）。
 * - 2.3.0：团队成员的任务书（`members[].instructions` / `instructionsPath`）。
 * - 2.4.0：Media Provider v5 的模型目录与受控输入读取。
 * - 2.5.0：构建期绑定插件身份的持久化 logger。
 * - 2.6.0：活动面板标签卡自报默认排位（`registerActivityTab` 的 `order`）。
 * - 2.7.0：会话底部面板贡献点（`registerBottomPanel`）与 `ui.slot.bottom-panel` 权限；文件装饰状态、变更事件和独立文件图标主题。
 * - 2.8.0：Task Artifact Renderer contribution (`registerArtifactRenderer`) 与 `ui.slot.artifact-renderer` 权限。
 * - 2.9.0：`fs.listFilesRecursive` 的文件名筛选与额外忽略目录。
 * - 2.10.0：底部面板实例的 `openTerminal` / `revealInstance` 与 `terminal.run` 权限。
 * - 2.11.0：智能体与团队的档位归属声明（`agent.agents[].mode` / `agent.teams[].mode`，
 *   `work` / `coding`；缺省两档可见）。
 * - 2.12.0：Skill 展示策略可声明工作区模式归属；只过滤 `/` 候选列表，不影响 Skill 加载或调用。
 * - 2.13.0：智能体委任生命周期标记（`agent.agents[].lifecycle`，`resident` / `oneshot`）：
 *   声明即 worker 型（默认会话保持驾驶+按域委派），缺省 = 主控/接管型（现状）。
 * - 2.14.0：会话页与新会话页顶栏动作贡献点（`registerHeaderAction`）与
 *   `ui.slot.header-action` 权限；宿主统一管理的按钮组（上限 7 格、收纳托盘、
 *   拖拽排序持久化于本机键 `forge.headerActions.order`），对应上游能力集
 *   `7e0a8b130`（顶栏重写）+ `b669f73ae`（label/tone/pin/surfaces 扩展字段）+
 *   `234885a88`/`8efa385a8`/`ffe0d5e90`（收纳托盘与调整模式）+ `25c43ece2`（过窄收进更多菜单）。
 * - 2.15.0：活动面板标签卡自报这一帧的 meta（`registerActivityTab` 的 `useMeta`），
 *   按面板工作空间解析 cwd，支持 `pinned: true` 固定上栏且不可移除。对应上游 `62b2749f8`。
 *
 * 清单校验对未知字段 fail-closed。作者把 `pluginApiVersion` 写成用到的那一档，
 * 旧宿主才能给出明确的版本错误。
 */
export const PLUGIN_API_VERSION = "2.15.0";
