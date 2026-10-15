---
id: TASK-0247
type: task
status: done
priority: P1
owner: 发布工程
requirement:
plan:
source: 用户决策（2026-10-14）：本项目为商用自有产品，要求统一版本——全部产品面 manifest 归入 0.1.3 产品线（自有 lockstep），不再保留上游项目的任何版本/身份残留（含根清单 name "open-vetta"）
related_requirement: []
related_plan: []
related_tasks: [TASK-0245, TASK-0246]
related_issues: [ISSUE-0007]
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 186c47e7c
read_paths: [scripts/quality/check-version-lines.mjs, scripts/release-desktop.mjs, package.json, apps/desktop/package.json]
write_paths: [package.json, bun.lock, apps/cli-host/package.json, apps/remote-relay/package.json, apps/docs-site/package.json, packages/ai/package.json, packages/agent/package.json, packages/agent-team/package.json, packages/action-rpc/package.json, packages/capability-sdk/package.json, packages/capability-runtime/package.json, packages/coding-agent/package.json, packages/ecosystem-adapter/package.json, packages/markdown/package.json, packages/remote-control/package.json, packages/remote-desktop/package.json, packages/runtime-core/package.json, packages/runtime-desktop/package.json, packages/runtime-mcp/package.json, packages/runtime-node/package.json, packages/runtime-ssh/package.json, packages/runtime-storage/package.json, packages/runtime-subagents/package.json, packages/runtime-telemetry/package.json, packages/runtime-tools/package.json, packages/runtime-knowledge/package.json, packages/skill-presets/package.json, packages/ssh-transport/package.json, packages/theme-sdk/package.json, packages/theme-ui/package.json, packages/toolkit/package.json, packages/ui/package.json, scripts/quality/check-version-lines.mjs, scripts/quality/check-version-lines.test.mjs, scripts/release-desktop.mjs, scripts/release-desktop.test.mjs, .github/release-notes/v0.1.3.md, project/tasks/TASK-0247-unified-product-version-lockstep.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 产品线版本统一：全量 lockstep 0.1.3 与根清单更名

## 目标

产品面全部 manifest 统一在 0.1.3 产品线（自有 lockstep，发版同步前进），根清单名称脱离上游身份；统一不变量由 version-lines 门禁与 release-desktop 发版脚本双向看护。

## 版本契约（本任务后生效）

- **统一线（= 产品版本 0.1.3）**：根 `package.json`、`apps/desktop`、`apps/cli-host`、`apps/remote-relay`、`apps/docs-site`、`packages/*` 中除插件/主题/示例外的全部包（ai、agent、agent-team、action-rpc、capability-sdk、capability-runtime、coding-agent、ecosystem-adapter、markdown、remote-control、remote-desktop、runtime-* 全系、skill-presets、ssh-transport、theme-sdk、theme-ui、toolkit、ui）。
- **独立线（豁免统一）**：`packages/plugins/**`（plugin-sdk 0.3.x、plugin-vite 0.2.x、plugin-cli 0.1.x、presets/externals 各自演进，chart-renderer 0.1.21 等已高于产品线，统一即降级，不可行）、`packages/themes/**`、`packages/coding-agent/examples/**`、`apps/mobile`（1.0.0）、`apps/desktop/vendor/**`（0.0.0 shim 标记）。
- **禁止**：任何 manifest 出现上游 0.5.x/0.55.x（TASK-0246 规则保留）。

## 事实核查（2026-10-14）

- 统一集内无任何包版本高于 0.1.3（最高 capability-sdk 0.1.2），统一不产生降级。
- 内部依赖仅 3 处非 workspace 协议：plugin-sdk→capability-sdk `^0.1.0`、plugin-vite→plugin-sdk `>=0.3.7 <0.4.0`、theme-ui→theme-sdk/ui `^0.1.0`——统一后全部仍在范围内，workspace 解析不受影响。
- 根名 `open-vetta` 的真实引用只有 `package.json` 自身与 `bun.lock` 根条目（重装即同步）；`agent-team-storage-layout.ts:647` 的哈希盐是存量数据兼容标识（改写会破坏已落盘摘要），**不动**；测试路径字面量与文档站上游链接（TASK-0048 范围）不动。

## 范围

### 做

- 31 个统一线 manifest 版本改写为 0.1.3（0.0.1×25、0.0.0×1、0.1.0×2、0.1.1×1、0.1.2×1），Desktop 原已在 0.1.3；根 `package.json#name` `open-vetta`→`open-forge`；`bun install` 同步锁文件。
- `check-version-lines.mjs` 升级：新增「统一线 manifest 版本必须等于 Desktop 版本」判负规则（豁免集同上），导出 `isUnifiedVersionManifestPath` 供发版脚本复用；测试同步。
- `release-desktop.mjs`：prepare/publish 把新版本写进全部统一线 manifest，并纳入脏文件白名单、必改清单与 `desktopPublishCommands` 的 git add；测试同步。

### 不做

- 不改 `@vetta/*`/`@vetta-org/*` 包名 scope（牵动全仓 import 与插件生态合同，属品牌决策——REQ-0011 冻结中，需用户单独定目标名后再做）。
- 不动插件/主题/示例/mobile/vendor 的独立版本线。
- 不改哈希盐 `open-vetta:retired-agent-team-id:`（数据兼容）。
- 不触发任何发布动作；0.1.3 是现行版本，统一是元数据对齐。

## Given / When / Then

- Given：统一线 32 个 manifest 分散在 0.0.x/0.1.0–0.1.2，根名为 open-vetta。
- When：统一为 0.1.3 + 更名后运行完整 `bun run check`；把任一统一线 manifest 改回旧值；未来 `release:desktop:*` 发版。
- Then：check 全绿；改回旧值被 version-lines 门禁判负；未来发版把 32 个 manifest 一并带到新版本并随发布提交。

## 必须保持

- 插件/主题/SDK 消费面的 semver 兼容（3 处范围依赖不破）。
- 发版白名单语义：发布动作之外出现任何脏文件仍判负。
- legacy lockstep `release.mjs` 的「同版本断言」在统一集内自洽。

## 测试与验证

- 定向：`bun run vitest --run scripts/quality/check-version-lines.test.mjs scripts/release-desktop.test.mjs scripts/release/release-notes.test.mjs`。
- 红路：临时把一个统一线 manifest 改回 0.0.1 → 门禁 exit 1。
- 质量检查：完整 `bun run check` + `test:quality`。
- 用户流程：不适用（元数据与工具链）。

## 验收分层

- 工程验证：完整 `bun run check` exit 0（lint/types/guards/mobile-lint 四路全绿）；`test:quality` 38 文件 525/525。
- 技术评审：自审；统一线成员判定由门禁与发版脚本共用同一谓词，两侧均有单测。
- 集成：main 串行，已推 origin/dev。
- 人工功能验收：不适用。
- 发布：未授权。

## 交付记录

- 实际修改：31 个统一线 manifest 版本改写为 0.1.3（0.0.1×25、0.0.0×1、0.1.0×2、0.1.1×1、0.1.2×1），根 `package.json#name` `open-vetta`→`open-forge`，`bun.lock` 同步；`check-version-lines.mjs` 新增 `isUnifiedVersionManifestPath` 与 `unifiedLineProblems`（统一线须与 Desktop 同版本）并接入 `main()`；`release-desktop.mjs` 新增 `unifiedManifestPaths`/`writeManifestVersion`，prepare 改写全部统一线 manifest、publish 断言同版本，白名单/必改清单/`desktopPublishCommands` 的 git add 三处接线，并删除已失效的 `ROOT_PACKAGE_PATH` 常量；两个测试文件更新期望并新增 9 个用例；发布说明与任务索引回写。
- 实际运行：定向 `check-version-lines.test.mjs` + `release-desktop.test.mjs` 30/30；门禁红路实测（临时把 `runtime-telemetry` 改回 0.0.1 → exit 1 并给出指引，还原后逐字节一致）；真实 32 个统一线 manifest 上「同版本写入」零副作用实测（无文件被重排）；完整 `bun run check` exit 0；`test:quality` 525/525。
- 未运行及原因：未跑 `release:desktop:prepare/publish` 端到端——该路径会改写工作区并打 tag、push，属发布动作，本任务明确不触发；其改写与白名单逻辑已由真实 manifest 实测与单测覆盖。
- Worktree：未拆出；串行小改，main 直接实施。
- 剩余风险：统一线判定按路径前缀豁免，将来新增独立版本线的目录须同步加进 `isUnifiedVersionManifestPath` 豁免集，否则其 manifest 会被判负。计划文本原写「33 个统一线 manifest」，实测为 32（多算了本就豁免的 vendor shim），已按实测改正。
