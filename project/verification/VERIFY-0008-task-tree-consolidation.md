---
id: VERIFY-0008
type: verification
status: done
owner: coordinator
source: 用户指令「整理各个 task 的工作，没有提交的按照原子级进行提交，有在各个树的都合到主树」
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: [PLAN-0006]
related_task: [TASK-0028, TASK-0033, TASK-0053, TASK-0060, TASK-0062, TASK-0064, TASK-0076, TASK-0084, TASK-0102]
related_bug: [BUG-0008]
---
<!-- Copyright The Open Forge contributors. -->

# 任务树整合核验与陈旧分支淘汰

## 被验证的合同

各 Task 的实现是否已全部收口到 `forge/dev` 主工作区，以及散落在 Worktree / 本地分支中的改动是否存在未集成的残留。

核验目标：在删除任何分支与目录之前，用 blob 级证据证明「删除无损」。

## Given / When / Then

- Given：多个 Task 曾在独立 Worktree 分支上并行实施，主树此后继续演进 75 个提交
  When：逐分支比对分支尖端 blob 与 `forge/dev` 对应 blob
  Then：分支内容要么与主树字节一致，要么主树已有同源实现；不存在只存在于分支的未集成实现
- Given：`open-forge-wt/` 下存在无 `.git` 的目录
  When：检查其内容与 git 注册状态
  Then：确认为脱离版本控制的残留壳，不含可合并工作

## 环境与输入

- 仓库：`C:/Users/xquan/Desktop/open-forge`，分支 `forge/dev`，核验基线 HEAD `6f4a6a53a`
- 起点状态：主树干净（无已改未提交、无未跟踪文件、`git stash list` 为空）
- 注册 Worktree：仅主树 + `TASK-0028-work-document-processing`
- 本地分支：`main`、`forge/dev` 及 8 个 task/worktree 分支

## 实际命令

```text
git status --porcelain --untracked-files=all
git stash list
git worktree list
git rev-list --count forge/dev..<branch>
git cat-file -e forge/dev:<path>
git rev-parse <branch>:<path>   # 与 git rev-parse forge/dev:<path> 比对
git log --diff-filter=A -- <path>   # 定位落地提交
```

## 结果

### 分支内容比对（blob 级）

| 分支（已淘汰） | 尖端 SHA | 超前 | 结论 |
|---|---|---|---|
| `task/TASK-0028-work-document-processing` | `46dfc54ed` | 1 | 见下「TASK-0028 专项」 |
| `task/TASK-0033-result-policy` | `6a267ea55` | 1 | 3/3 文件与主树 **字节一致** |
| `task/TASK-0053-mcp-lifecycle` | `95f92d885` | 2 | 核心文件一致；`idleTimeout` 已贯通主树 20+ 文件 |
| `task/TASK-0060-canvas-artifact-service` | `a6b796ca5` | 1 | 核心实现（service/store/paths/session-scan）**字节一致** |
| `task/TASK-0062-browser-element-picker` | `b3a5743c3` | **0** | 无独有提交，纯祖先 |
| `task/TASK-0064-terminal-activity-tab` | `d9f5541c1` | 1 | 14 个改动文件中 12 个**字节一致** |
| `worktree-agent-a6d080b45c8dc8cc9` | `59d1e12e6` | 11 | 独有提交全为 merge，`diff` 为空——**零内容** |
| `worktree-task-0027-artifact-renderer` | `367782ac8` | 12 | 同上，**零内容** |

比对中出现的 `DIFFERS` 项，均为分支落后主树 75 个提交期间主树继续演进所致，非「分支有主树没有的实现」。

### 落地提交（核验通过）

| Task | 主树落地提交 |
|---|---|
| TASK-0028 | `a728de9e5`（Work 文档导出与 Task 面板读取集成） |
| TASK-0033 | `21e77cae3`、`243354732` |
| TASK-0053 / TASK-0054 | `d7175210e`（MCP stdio 空闲回收与延迟启动目录缓存） |
| TASK-0056 / TASK-0060 | `c1f931648`（Canvas Artifact Service 与存储层） |
| TASK-0062 | 主工作区实现与 15 处类型修正 |
| TASK-0064 | `da8de8fc0`（活动面板独立终端页） |
| TASK-0076 | `5978460b6`（见「异常发现」） |
| TASK-0084（MCP 按工具可见性） | `523c28005` |
| TASK-0102（工作区流程 UI；记录时编号为 `TASK-0084`） | `f9a79d399`、`c2e5c0849` |

### TASK-0028 专项

`46dfc54ed` 中唯一主树没有的是 `apps/desktop/src/main/task-activity/artifact-broker.ts` 与其测试——即收口提交 `6f4a6a53a` 已记录的「与主树 Canvas Artifact Service 形成重复事实源，明确不 cherry-pick」。其余文件主树均有对应实现。**淘汰判定成立，不予合入**；该 WIP 保留在远端 `origin/task/TASK-0028-work-document-processing`。

### 已执行的淘汰（不可逆操作，执行前已由用户确认）

- 移除注册 Worktree `open-forge-wt/TASK-0028-work-document-processing`（移除前确认工作区干净）
- 删除 8 个本地陈旧分支：`task/TASK-0028-work-document-processing`、`task/TASK-0033-result-policy`、`task/TASK-0053-mcp-lifecycle`、`task/TASK-0060-canvas-artifact-service`、`task/TASK-0062-browser-element-picker`、`task/TASK-0064-terminal-activity-tab`、`worktree-agent-a6d080b45c8dc8cc9`、`worktree-task-0027-artifact-renderer`
- 删除 3 个无 `.git` 的残留目录：`open-forge-wt/TASK-0060-canvas-service`、`TASK-0062-browser-picker`、`TASK-0064-terminal-tab`
- **未触碰**：远程 `origin/task/TASK-0028-work-document-processing`（WIP 的安全网）；本地 `main`（独立版本线，ahead 13 / behind 213）；`upstream` 仅 fetch

淘汰后本地仅剩 `forge/dev` 与 `main`，`git worktree list` 仅剩主树，`open-forge-wt/` 已空。

### 异常发现

1. **混提交（既有，不回写历史）**：TASK-0076 的品牌收尾与新会话开关两项无关改动被合入同一提交 `5978460b6 feat(desktop): 工作区只留一处办公/编程开关`，违反 `CLAUDE.md` §三 原子化提交。历史已进入 `forge/dev`，重写代价高于收益，仅在台账 `integration_status` 标注事实。
2. **编号冲突**：`TASK-0084` 被 `TASK-0084-mcp-per-tool-visibility` 与 `TASK-0084-workspace-session-flow-ui` 两个任务共用。本记录不自行重排编号（`CONVENTIONS.md` 规定编号不复用、不重排），留待立项人裁决。2026-09-24 裁决完成：工作区流程 UI 任务改名 `TASK-0102`，MCP 任务保留 `TASK-0084`；本记录的交叉引用已同步。
3. **Release Notes 门禁行为正确**：`task/TASK-0053-mcp-lifecycle` 曾向继承的 Vetta `.github/release-notes/v0.5.59.md` 写入两条 Open Forge 专有条目；主树未采纳该差异，改为在 `TASK-0053` 交付记录保留候选文案。这与 `CLAUDE.md` §七「首发版本切入 manifest 前不写入继承说明」一致——`apps/desktop/package.json` 当前仍为 `0.5.59`。**非遗漏**。

## 未运行的验证与原因

- 全量 `bun run check`：本次为文档与引用整理，未改动 `apps/`、`packages/` 任何源文件；按仓库规则「不运行测试不能替代定向行为测试」，但本次无可测行为面。
- `verify:ui:*`：用户未要求实机验收。
- `bun run check` 全量未跑（同上）。
- `verify:ui:*` 未跑（用户未要求实机验收）。

## 补充复跑

TASK-0076 交付记录中标注「受 React 漂移阻塞」的 `ImBridgeSettingsView.test.tsx`，在 `da40543a9` 收敛 override 后经文档化入口复跑：

```text
bun run test:impact -- apps/desktop/src/renderer/domains/settings/components/ImBridgeSettingsView.test.tsx
```

结果：`Test Files 1 passed (1)`、`Tests 6 passed (6)`。原阻塞项解除，TASK-0076 的验证面已闭合。

（首次以 `run-vitest.mjs --run <path>` 直连调用时，`@shared/*` 别名未解析导致收集失败；该失败源于调用方式，非断言失败，不作为结论。）

## 剩余风险

- macOS appshot 打包与 TCC 链路（BUG-0008 修复面）未实机验证，本机为 Windows。
- `TASK-0084` 编号冲突已于 2026-09-24 裁决并消除：工作区流程 UI 任务改名 `TASK-0102`，MCP 任务保留原编号；本节其余两项仍开放。
- 淘汰仅作用于本地；远端 `origin/forge/dev` 落后本地 12 个提交，未推送（推送需用户明确授权）。
