---
id: TASK-0177
type: task
status: done
priority: P2
owner: ssh-transport documentation
source: RESEARCH-0019; TASK-0172
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0133, TASK-0165, TASK-0168, TASK-0169, TASK-0174, TASK-0178]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（2026-10-03 主检出串行实施完成）
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [packages/ssh-transport/README.md, packages/ssh-transport/src/ssh2-runner.ts, packages/ssh-transport/src/node-process-runner.ts, packages/ssh-transport/src/known-hosts.ts, packages/ssh-transport/src/helper-deployment.ts, apps/desktop/src/main/ssh/ssh-hostkey-verifier.ts, apps/desktop/src/main/ssh/ssh-runtime.ts, docs/adr/0124-ssh-remote-projects-and-execution-boundary.md]
write_paths: [packages/ssh-transport/README.md, project/tasks/TASK-0177-ssh-platform-contract-documentation.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0174, TASK-0169]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# SSH 平台能力与验证文档对齐

## 当前事实与目标

README 仍无条件宣称传输使用系统 OpenSSH、ProxyCommand/FIDO/GSSAPI 全部原生支持、包内不做本地文件 I/O；当前 Desktop 在 win32 选择 ssh2，ProxyCommand 会显式拒绝，且 ssh2-runner 读取本地 IdentityFile、helper-deployment 读取本地二进制；known-hosts.ts 只解析，known_hosts 文件读写属于宿主。ADR 是历史决策依据，不能作为当前跨平台支持表。

目标：文档准确说明 Windows ssh2 与 POSIX OpenSSH 的真实能力、安全边界和测试入口，避免使用者按过时说明配置后遇到与承诺不符的失败。

证据与同类去重见 [RESEARCH-0019](../research/RESEARCH-0019-post-integration-optimization-audit.md)。本记录为待执行合同，**本轮只建档，没有实施授权或修复结果**。

## 范围与取舍

仅修正文档；按现行源码与测试列出后端选择、认证/known_hosts、ProxyJump、ProxyCommand、不支持能力与本地配置 I/O 所有者。无法确认的能力标为未验证，不从依赖库宣称推导宿主已支持。测试章节与 TASK-0174 串行衔接：入口落地前不写成已经存在。

不做：不修改认证实现、权限、凭据存储、错误文案或 ADR 决策，不新增未经证实的支持承诺。

## 输入、输出与并发

- 输入：上述固定源码快照、相关 Task/Bug 与可控测试夹具；开工先复核新 HEAD 和最近 AGENTS/README。
- 输出：本范围可独立回滚的改动或诊断/测量结论、对应回归与真实验证记录。
- 当前串行规划；依赖为 frontmatter 的 depends_on。未来仅在获得多 Agent 授权并补齐互斥写路径后使用独立 Task Worktree，不在主目录并行写。
- 共享冲突：记录的 conflicts_with 及公共索引/发布说明由 Coordinator 串行合并；性能/时序实验不得互相争抢同机资源。

## Given / When / Then 与验收

1. Given/When/Then：Windows 用户配置 ProxyCommand 时，文档提前说明当前会明确拒绝，而不是宣称“系统 ssh 可连就一定可用”；POSIX 的既有路径不被误写成 ssh2 限制。
2. Given/When/Then：表中每个能力和安全结论有真实实现/测试锚点；区分主机密钥确认、凭据存储与包内本地配置 I/O，不记录真实凭据。
3. Given/When/Then：README 中命令在所注明 cwd 与当前脚本集合下可解析，链接有效，ADR 的历史背景不被篡改为新决定。

完成标准：README 与当前代码/测试一致，平台限制和安全边界清楚；内部文档任务无需人工产品验收。

## 必须保持

原有错误/取消、资源释放和公开合同；不新增 any、静默本地回退或凭据暴露，不降低测试基线。工具不接触真实用户实例/配置，不调用付费 Provider。

## 验证命令

- 核对 ssh-runtime.ts/createPlatformRunner、ssh2-runner.ts/ProxyCommand/IdentityFile、helper-deployment.ts、本包 known-hosts.ts 纯解析与宿主 ssh-hostkey-verifier.ts 文件 I/O 的路径和职责。
- 执行当前适用的只读选择计划/文档链接检查、`git diff --check`；若为纯文档不新增产品单测或启动真实主机。

## 验收分层与当前交付

当前只完成规划，未来行为测试/实现/技术验收均未执行；源码/证据自审不等于产品测试通过。集成 pending，未创建代码分支或 Worktree。实现后回填 red/green、实际命令、提交与未验证边界，功能人工接受与发布分别处理。

## 交付记录（2026-10-03，纯文档）

- 修正 README：新增「平台后端」表，按现行实现区分 macOS/Linux（系统 OpenSSH，含 ProxyCommand/FIDO/GSSAPI、ControlMaster 与 `ssh -O exit` 失效）与 win32（进程内 ssh2：ProxyCommand 明确拒绝、ProxyJump 经 forwardOut、known_hosts 自实现含 `@revoked` 拒绝语义）；「不做任何本地文件 I/O」改为如实描述注入端口（`readFile`/`resolveBinary`）与宿主所有的 known_hosts 文件读写；删除与平台表重复的「传输选系统 OpenSSH」绝对化段落。锚点：`ssh-runtime.ts#createPlatformRunner`、`ssh2-runner.ts`（ProxyCommand 拒绝）、`node-process-runner.ts`（`-O exit`）、`known-hosts.ts`、Desktop `ssh-hostkey-verifier.ts`。
- 测试章节按 TASK-0174 已落地的标准入口如实重写（`bun run --cwd packages/ssh-transport test` 与选择器行为），并写明 POSIX 专属用例的显式 skipIf 边界。
- 核对：README 内 ADR-0124 相对链接有效；命令在仓库根可解析（本会话实测）；`git diff --check` 无空白问题；无运行时行为变化，未新增产品单测。
- 状态：工程完成转 `verifying`；`integration_status: integrated`（随本提交入 main）。
