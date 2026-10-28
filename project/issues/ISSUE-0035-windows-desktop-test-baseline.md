---
id: ISSUE-0035
type: issue
status: draft
priority: P1
owner: desktop/testing
related_requirement: [REQ-0002]
related_plan: [PLAN-0026]
related_tasks: [TASK-0410, TASK-0411]
source: PLAN-0026 combined test:changed and independent baseline comparison
created: 2026-10-29
updated: 2026-10-29
---
<!-- Copyright The Open Forge contributors. -->

# Windows Desktop 广域测试的存量失败与归因

## 背景

PLAN-0026 在隔离 Task 实现、审查和定向验证后，于本地 main 组合运行跨包门禁。共享资源与子代理相关包通过，但 Desktop 广域测试仍红，需要区分 shell/测试宿主问题和真实产品回归。这里记录未决根因，不将失败直接认定为资源准入改动或已确认的产品 Bug。

## 已知事实

候选含 TASK-0411 ddf02a580 与 TASK-0410 619cd9c3b；起点为 6bb27d048c5dccade7decafde58f4eeb8ec6686c。宿主为本次 Windows PowerShell/Node/Bun 环境，统一仓库 Node runner，无真实用户实例、Provider 或生产状态。

完整 bun run test:changed --base 6bb27d048 执行 2152 秒，六个其他受影响包全通过、2684 例通过；Desktop 1102 文件通过、7 文件失败、4 文件既有跳过，6233 例通过、14 例失败、18 例既有跳过，整体 exit 1。失败文件及用例数如下：

| Desktop 相对路径 | 失败例数 | 观测 |
| --- | --- | --- |
| src/main/plugins/remote-command-runner.test.ts | 4 | shell 脚本解析错误；单文件复验仍失败 |
| src/main/media-protocol.test.ts | 1 | 远端媒体按范围读取 |
| src/main/skills/skill-presentation-read.test.ts | 2 | 远端技能 URI 与展示列表 |
| src/main/filesystem/filesystem-service.remote-flow.test.ts | 4 | 远端文件树/过滤/变更/预览 |
| src/main/plugins/command-spawner.remote.test.ts | 1 | 远端长跑命令 |
| src/main/file-protocol.test.ts | 1 | 远端文件内容 |
| src/renderer/domains/weknora/weknora-background-flow.test.tsx | 1 | AC-20 多路终态合并刷新期望 baseline+1，实际 baseline+2 |

七个文件均不在本轮修改范围。远端命令单文件诊断 stdout/stderr 报 /bin/bash 的 unexpected EOF while looking for matching 双引号，exitCode 2；不能据此直接判定 WSL 缺失。UI 失败涉及现有 debounce/请求计数，未定位到产品实现或测试时钟根因。

### 独立源码基线

通过 git clone --shared --no-checkout 建立独立临时检出 C:/Users/xquan/AppData/Local/Temp/of-0026-6bb27d048，detach 精确原提交后 bun install --frozen-lockfile。检查 workspace 实际链接指向该检出 packages，原 gate 不含 waitTimeoutMs，原 scheduling-observation.ts 不存在；没有借用新源码或复制用户状态。

同一宿主执行以下命令（从基线根目录），14 个完整失败测试名称与候选逐项相等，7 文件失败、14 例失败、17 例通过、3 例既有跳过，exit 1：

~~~powershell
bun run test:impact -- apps/desktop/src/main/plugins/remote-command-runner.test.ts apps/desktop/src/main/media-protocol.test.ts apps/desktop/src/main/skills/skill-presentation-read.test.ts apps/desktop/src/main/filesystem/filesystem-service.remote-flow.test.ts apps/desktop/src/main/plugins/command-spawner.remote.test.ts apps/desktop/src/main/file-protocol.test.ts apps/desktop/src/renderer/domains/weknora/weknora-background-flow.test.tsx
~~~

原始本机日志在主检出 node_modules/.cache/plan-0026/：combined-test-changed.log、combined-main-check.log、desktop-remote-diagnosis.log、independent-baseline-install.log、independent-baseline-desktop-failures.log。日志为 ignored 诊断产物，不提交。新行为用例及完整 check 通过见两项 Task。

初次将基线放到 node_modules 内导致 TSX 转换出现 React 未定义；该 UI 对照无效，已更换独立 Temp 检出，以本节有效结果为准。未删除断言、增加 skip、延长超时或过滤失败项。

## 未决问题

远端测试的脚本 quoting/宿主边界与 AC-20 的异步刷新根因需要分别定位，当前未证明它们具有共同根因，也未证明真实产品表现与夹具相同。基线一致说明本次改动前已能复现，不能替代这些功能自身验收。

## 候选方案与推荐

推荐后续按远端 shell 与后台刷新两个 concern 分别复现、建立最小失败、诊断并修复，保留原行为断言。扩大本次资源准入 Task 修复全部 Desktop 会混淆范围和回滚边界，因此不采用；跳过现有测试或降低期望不采用。

## 决策触发条件与后续 Task

任何下一次 origin/dev 推送前先解决当前完整批次门禁。仅本地资源准入集成按 [WAIVER-0015](../decisions/waivers/WAIVER-0015-resource-admission-local-baseline.md) 记录有限 Policy 例外；不豁免推送/发布边界。本记录为后续调查入口，未在本次创建或实施独立修复 Task。
