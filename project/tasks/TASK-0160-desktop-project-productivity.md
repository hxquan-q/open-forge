---
id: TASK-0160
type: task
status: verifying
priority: P2
owner: desktop + plugin-git
source: user-request; upstream 2dd10fc5b, d9cc3e003, b41710a19, b530b02ae, 2543c5aec, c496fb60d, 8ad2abdcb
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/plugins/presets, apps/desktop/src/main, apps/desktop/src/renderer/domains]
write_paths: [packages/plugins/presets, apps/desktop/src/main, apps/desktop/src/renderer/domains, project/tasks/TASK-0160-desktop-project-productivity.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/plugins/presets]
depends_on: [TASK-0148]
conflicts_with: [TASK-0196]
integration_status: integrated（随本批推送 origin/dev）
created: 2026-10-02
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# Git 与项目工具体验适配

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：2dd10fc5b, d9cc3e003, b41710a19, b530b02ae, 2543c5aec, c496fb60d, 8ad2abdcb。

分别接 Git 检测/安装引导、提交详情、文件预览首次打开、自动化默认标题、能力筛选、设计画布切换。保留本仓归档、审查快照、Browser/Canvas 契约；破坏性 Git 动作必须显式确认，不直接删除现有项目功能。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

未安装 Git、特殊文件名/重命名、动作确认取消；关闭面板点文件一次打开、设计A切B、空标题自动化可创建；每片独立测试。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：TASK-0148。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 交付记录（2026-10-03，TASK-0196 批次；Git 特殊路径部分归 TASK-0187/0193）

- 范围裁决：Git 特殊路径/重命名（上游 2dd10fc5b）属 TASK-0187 批的 TASK-0193，本任务只交付「未安装 Git 的恢复入口」（上游 d9cc3e003 + b41710a19）；上游 ADR-0134 在本仓已被占用，重编号为 ADR-0145。
- 实际修改：
  - git 插件（d9cc3e003 全量）：`isGitAvailable`/`probeGitTab` 三态探测（repo/not-repo/no-git——没装 git 时按目录 `.git` 判定保留标签卡）；NoGitCta 安装引导组件；GitPanel/GitSettingsView 引导接线；中英文案；noGit/tabVisibility 测试。
  - 宿主（b41710a19 适配）：runtimes 新增 git-detection（系统优先、macOS 不碰 /usr/bin/git 防弹窗）与 git-tool（xcode-clt 调起 / Windows MinGit 托管下载 ~/.vetta/runtimes / Linux 包管理器命令 / 手动引导）；manager 集成（detect/applyEnv/installGit/shouldBlockGitCommand）与 IPC/preload/system 类型；设置 → 环境 Git 行（theme-ui EnvironmentGitRowView + desktop 模型）与中英文案；插件 command-runner 的 git 前置检查。
- 实际运行：desktop runtimes+settings 181+1skip；git 插件 51/51；完整 check 通过。manager 冲突（本仓 downloads/fetchImpl 构造分歧）按双方保留合并。
- 未运行及原因：真实 MinGit 下载/xcode 调起实机流程不做实机验证（网络/系统弹窗边界），由 git-tool 单测与设置行组件测试覆盖。
- 剩余风险：MinGit 下载源为上游固定 URL，未按本仓镜像策略配置（与 Node/Python 运行时同类的既有问题，不新增）。

### 人工验收实测（2026-10-08，VERIFY-0017 组二；保持 verifying 待裁定）

方法：隔离 Debug profile `04987e4e` 真实 UI 驱动 + 自建 Git 夹具仓库 `fixtures/git-literal-paths`（5 提交，独立于用户仓库）+ 磁盘 `git show --name-status -M` 与 md5 作对照。判据为验证合同六条子句；原始读数存档 `0160-git-evidence-2026-10-08.txt`。**注意 Git 面板正文渲染在 shadow root 内**：`document.querySelectorAll` / `body.innerText` / `getByText` 都看不到文件行，须自底向上遍历 `shadowRoot` 才能取到（本轮探针假象即由此而来）。

| 子句 | 实测结果 |
|---|---|
| 未安装 Git | **仅单测级**。Git 插件 51/51 与 NoGitCta/`tabVisibility` 组件测试覆盖「没装 git 时按目录 `.git` 保留标签卡 + 安装引导」；真实「未安装」形态未在 UI 构造（需以去掉 git 的 PATH 启动实例），未授权不做。 |
| 特殊文件名/重命名 | **成立**（UI 实测；该项归 TASK-0193 批 / BUG-0074）。449e837 恰好列出 `br[ack]et.txt`、`bracket.txt`、`x[1].txt`、`x1.txt` 四行，点 `br[ack]et.txt` 的详情是它自己的 hunk（`+BRACKET_ONE`），未串到 glob 邻居；b25171db 两行重命名各带 `旧 → 新` 标题与 `R` 标记（`R087`/`R100`），点纯重命名行得到空正文「无差异内容。」。含 `&`、`#`、`'`、空格、方括号的路径在变更视图与提交详情中均按字面显示。截图 `0160-diff-bracket.png`、`0160-diff-paren-rename.png`。 |
| 动作确认取消 | **成立**。变更视图右键 `amp&and.txt` → 「丢弃更改」→ 破坏性确认框（「丢弃 1 个文件的更改？这些改动会从工作区移除，无法撤销；未跟踪的文件会被直接删除。」+ 路径清单 + 取消/丢弃）；点「取消」后对话框消失、文件仍在更改列表，磁盘 md5 与操作前一致（`44822b9d…`，内容仍含探针行）⇒ 未执行删除。截图 `0160-change-context-menu.png`、`0160-discard-confirm.png`、`0160-discard-cancelled.png`。 |
| 关闭面板点文件一次打开 | **未适配**。上游 b530b02ae 未落本仓：`useFileTabContentModel.ts:69` 仍是修复前形态 `useEffect(() => () => closePreview(), [closePreview])`，无 `mountedFileTabs` 微任务延后（本仓另有分叉实现 `PREVIEW_MOUNT_DELAY_MS = 240`，与上游 `waitForCommittedPaint` 不同）。用户可见面**未实测**：复现需「聊天消息里的文件引用」，本 profile 无此会话，未为它专门造一轮。 |
| 设计A切B | **未适配**。上游 8ad2abdcb 未落本仓：`design-runtime.ts` 无 `pendingDesignListeners` / `onPendingDesignPath`，打开请求仍只写 pending。用户可见面**未实测**（需同 cwd 两份设计且画布已挂载，本 profile 未构造）。 |
| 空标题自动化可创建 | **不成立（已实测）**。自动化页 → 新建任务：名称（placeholder「新建任务」）与提示词皆空时创建按钮 `disabled=true`；**只填提示词**（「每天早上汇总仓库里未提交的改动，写成三条要点」）后创建按钮**仍为 disabled**、名称仍空。上游 2543c5aec 的「标题选填 + 留空取任务内容首行」在本仓不存在（`scheduler/automation-draft.ts` 缺失；`useTaskFormModel.ts` 的 `canSubmitFromData` 要求 `data.name?.trim()`）。截图 `0160-automation-dialog.png`、`0160-automation-prompt-only.png`。 |

- 附带核查：上游 c496fb60d（能力页类型/来源筛选）同样未适配（`abilities/components/AbilityFilterPopover.tsx` 不存在），但未列入本 Task 验证合同。
- 归属与范围：四个未落 SHA（b530b02ae、2543c5aec、c496fb60d、8ad2abdcb）在 `project/` 下只出现于本 Task 与 PLAN-0014，**无其它 Task 承接**；而交付记录只交付了 d9cc3e003 + b41710a19（未安装 Git 引导），并把 2dd10fc5b 归给 TASK-0187/0193。即验证合同六条里，两条有真实读数、一条单测级、三条（含一条已实测为否）未落地。
- 关闭建议：不闭合。请用户在两条路里裁定——① 补做四片（文件预览一次打开、画布切设计、自动化空标题、能力筛选）后复验；② 收窄本 Task 验证合同为「未安装 Git + Git 特殊路径/确认取消」并把其余四片另立 Task/Bug 跟踪，之后闭合。
