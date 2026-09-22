# Open Forge 二次开发同步版

> 这是面向 `C:\Users\xquan\Desktop\open-forge` 的二开入口。详细源码事实以当前仓库源码、`package.json`、Schema、测试和质量守卫为准。

## 技术栈

- Bun `1.3.14` + Bun Workspaces + Turborepo `2.10.11`。
- Node `>=20.0.0`、TypeScript 5.9、Biome 2.3.5、Vitest 3.2。
- Desktop：Electron 34、Vite 7、React 19、Jotai、TanStack Router、Tailwind 4、Shiki、Zod、i18next。
- Mobile：Expo 57 + React Native 0.86。
- Docs：Next.js 16 + Fumadocs。
- Go 的 IM Gateway 和 SSH Helper 不属于 Bun workspace。

## 关键分层

```text
apps
  ↓
coding-agent
  ↓
runtime-* / capability-*
  ↓
agent-core
  ↓
ai
```

不要让 packages 反向依赖 apps，不要让 `runtime-core` 依赖 `coding-agent`，不要把 Node/Desktop 实现放进产品无关 Runtime。

## Desktop IPC

新增 IPC 的固定顺序：

1. `preload/api-types/<domain>.ts`；
2. `preload/apis/<domain>.ts`；
3. `preload/index.ts`；
4. `main/ipc/<domain>.ts`；
5. `main/ipc/index.ts` 的 register/teardown；
6. main domain service；
7. renderer atoms/view model/i18n。

命名为 `vetta:<domain>:<action>`。IPC 文件只做注册、最小校验、调用领域服务和返回值；业务状态机和持久化放领域服务。

## Provider

Provider 入口主要在：

- `packages/ai/src/types.ts`；
- `packages/ai/src/providers/`；
- `packages/ai/src/providers/register-builtins.ts`；
- `packages/ai/src/api-registry.ts`；
- model catalog/generated data；
- coding-agent 的 model selection/defaults。

新增 Provider 必须覆盖请求映射、流式 chunk、Tool Call、reasoning、usage、stop、错误和取消；生成文件不能手工编辑。

## Tool / Feature

```text
runtime-tools   平台无关 Schema、Registry、Activation、结果策略
runtime-node    Node/fs/process/shell 实现
coding-agent    产品 Tool、Feature、Scenario、Profile、Policy
Composition Root 选择具体环境、Sandbox 和凭据
```

Tool 的 `content` 给模型，`details` 给 UI/Host/Card/Artifact。新增 Feature 放在 `coding-agent/src/features/`，状态、Tool、Extension 和产品策略放在同一能力域。

## Plugin / Skill / MCP

- Agent Profile：Prompt、Tool Catalog、Permission Set、Mode 和模型默认值。
- Skill：`SKILL.md` 工作流、知识和辅助脚本；按需加载。
- Plugin：可信/授权的宿主扩展，使用 Plugin SDK、Module Federation、Capability Session 和 contribution lifecycle。
- MCP：外部 Tool/Resource/Prompt 协议；通用状态机在 `runtime-mcp`，Node transport/配置/OAuth 在 `runtime-node`。

不要把四类扩展合并成一个模糊 Extension，也不要让 Skill/MCP 获得隐式宿主权限。

## 持久化 / RPC

- Conversation JSONL/Event Log 是恢复事实；消息、Context、Tool/Execution observation 和 Turn 终态必须按合同持久化。
- 旧格式兼容只能在显式 legacy/migration 边界。
- `--agent-rpc` 使用 NDJSON stdout，日志走 stderr；不要为 Task 再造一条进程/RPC路径。

## 二开入口表

| 需求 | 位置 |
|---|---|
| Provider | `packages/ai` |
| 平台无关 Tool | `packages/runtime-tools` |
| Node Tool | `packages/runtime-node` |
| 产品 Feature | `packages/coding-agent/src/features` |
| Profile/Mode | `coding-agent` composition/profile contracts |
| Plugin | `packages/plugins/plugin-sdk` + host loader |
| Skill | `packages/skill-presets` 或项目 `.vetta/skills` |
| MCP | 用户/项目配置或 runtime-node MCP Source |
| Desktop IPC | preload types/API + main IPC + renderer atoms |
| Task/Artifact | 先评审 runtime/coding-agent 合同，禁止 UI 私有实现 |
| Pi | 未来只在 Composition Root/独立 Adapter 评估 |

## 验证命令

```bash
bun run check:quick
bun scripts/quality/run-vitest.mjs --run <相关测试文件>
bun run check
```

不运行裸 `bun test`；不使用真实 Provider 替代确定性合同测试；公共合同、持久化、权限、生命周期和 UI 交互变化必须有对应测试。
