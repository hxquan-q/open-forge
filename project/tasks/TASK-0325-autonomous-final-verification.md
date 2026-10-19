---
id: TASK-0325
type: task
status: verifying
priority: P1
owner: project/agent-workflow
requirement: REQ-0019
plan: PLAN-0019
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0019]
related_tasks: [TASK-0313, TASK-0322, TASK-0323, TASK-0324]
related_issues: [ISSUE-0029]
related_bugs: [BUG-0107, BUG-0132, BUG-0133]
execution: parallel
branch: task/TASK-0325-autonomous-final-verification
worktree: ../open-forge-wt/task-0325-autonomous-final-verification
base_commit: c22ccc1c53053426d302fc2d7d159631dbf869dc
read_paths: [scripts/agents, schemas/agents, scripts/quality, scripts/worktree, scripts/release, apps/cli-host, apps/desktop/src/main, packages/runtime-node, project, docs/dev]
write_paths: [docs/dev/agent-rules/autonomy.md, LESSONS.md, apps/cli-host/package.json, scripts/agents/release.mjs, scripts/agents/release.test.mjs, project/bugs/BUG-0133-publication-receipt-clock.md, apps/cli-host/scripts/compile-standalone-entry.mjs, apps/cli-host/test/compile-standalone-entry.test.ts, apps/cli-host/test/installed-artifact-runtime.test.ts, apps/cli-host/test/coding-agent-bootstrap.test.ts, apps/desktop/src/main/window-manager.ts, apps/desktop/src/main/brand-icon-directory.ts, apps/desktop/src/main/brand-icon-directory.test.ts, apps/desktop/src/main/window-manager-import.test.ts, project/tasks/TASK-0325-autonomous-final-verification.md, project/tasks/README.md, project/bugs/BUG-0107-desktop-vitest-collection-crash.md, project/bugs/BUG-0132-cli-standalone-photon-owner-path.md, project/bugs/README.md, project/plans/PLAN-0019-autonomous-development.md, project/plans/README.md, project/requirements/REQ-0019-autonomous-development.md, project/requirements/README.md, project/verification, project/decisions/waivers, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/cli-host/scripts/compile-standalone-entry.mjs, apps/desktop/src/main/window-manager.ts]
depends_on: [TASK-0324]
conflicts_with: [TASK-0313, TASK-0322, TASK-0323, TASK-0324, TASK-0130, TASK-0153, TASK-0154, TASK-0197, TASK-0218, TASK-0223, TASK-0276]
integration_status: pending
created: 2026-10-19
updated: 2026-10-19
---
<!-- Copyright The Open Forge contributors. -->

# 自主研发全流程最终验证与基线修复

## 目标与取舍

续接已提交 TASK-0322–0324，修复全量验证已证明的 CLI 制品与 Desktop 收集基线问题，核实其他超时/信任诊断，完成组合验证和逐项审计。复用 BUG-0107，新增 BUG-0132；内部测试合同与不符合产品行为的断言分别处理，不通过忽略断言或扩大超时换取绿灯。

直接修复生成 import 和过早求值的接线；只有既有接口强迫无效输入时才调整相邻小合同。保持业务协议、安全/信任诊断、品牌档位、打包布局和现有超时。实际 CLI 制品需运行既有 installed-artifact 验证，不用字符串断言替代编译运行。

## 并发评估

条件支持：独立 Task Worktree，基于 TASK-0324 提交串行续接；不派发子 Agent，不与其他目录并行写入。共享版本说明和台账路径声明冲突，必要时依据标准 worktree 检查补充冲突。Coordinator 最后按依赖集成、保留所有他人修改。

## Given / When / Then

- Given 冻结安装且无旧依赖残留，When 编译并运行 CLI 制品，Then JS/WASM 从实际依赖所有者解析，离线实际行为保持。
- Given Node 测试进程没有 Electron resourcesPath，When 收集非打包主进程模块，Then 不提前计算仅打包态需要的路径；打包态继续使用原布局与品牌。
- Given 非交互不可信工作区，When 资源加载受到拒绝，Then 测试确认真实安全诊断，不把告警删掉或强制授信消除失败。
- Given 进程测试在原超时内单独通过或仍失败，When 复验，Then 按证据区分争抢资源与行为缺陷，必要时先补 Task 范围再修。
- Given 模型/VM/签名/遥测未提供且 Actions 受预算阻断，When 最终审计，Then 逐项记录未执行与恢复条件，自治等级保持 0，不宣称真实 L4。

## 不变量与验证

不访问真实用户状态/Provider，不启动 verify:ui，不发布/上传、不修改账户预算。测试先复现再修复，新增回归覆盖实际入口；执行定向、制品验证、impact、完整 check 与最终 test:changed。管理记录与 release notes 随结果更新；失败必须保留，不以局部绿灯覆盖整仓红灯。

## 验收与交付

工程分项验证通过，最终组合 test:changed 待执行；技术评审为自审，独立模型未提供。集成 pending，人工真实自主行为未接受，发布未授权。最终 Verification 对照 v2 和 REQ-0019 记录软件证据、配置缺失、未实现适配和真实环境差距，不将模拟回执写为实际外部完成。

## 执行证据

- 冻结安装成功，3044 包 / 40.98 秒，锁文件不变。直接跑 Desktop 新回归先暴露工作区依赖未构建；按已有 Turbo 依赖闭包构建（不启动 dev、不下载 MCP），24 项 / 9.603 秒通过，再得到准确的 resourcesPath 失败。
- CLI 新生成入口回归在旧实现从实际文件读取时报 Photon 旧路径 ENOENT；改为真实依赖所有者 runtime-node 后，生成入口与 bootstrap 共 2 文件 / 3 例通过。实际 installed-artifact 最终复验 14 例通过（95.85 秒）。
- bootstrap 旧断言把合法信任告警误当失败。现固定非交互未授权输入，精确断言 warning、路径和原因；保留产品的拒绝行为，不删除告警，不设置强制授信。
- Desktop 新回归实际 import window-manager，在旧实现精确复现 undefined 路径。修复后原四个失败文件、图标目录合同与新入口回归共 6 文件 / 29 例通过。

- 实际制品首轮已编译并运行，14 例中 13 通过；动态项目 Skill 正向夹具没有信任前置条件，被现有安全策略正确拒绝。先将该测试纳入范围，再仅对临时项目通过既有 NodeProjectTrustStore 授权，保留原加载/更新/移除断言；不改产品安全逻辑。

- 自审发现 BUG-0133：发布回执沿用请求发起时刻校验，真实服务稍后签发会被误拒绝。先纳入发布控制器与回归范围，以真实子进程签发时间建立失败证据，再按接收时刻校验；不得放宽签名、有效期或绑定。

- Runtime 合同入口首轮强制 4 worker：27 文件 / 137 例中 2 例原 5 秒超时；同一 runtime-selection 文件单 worker 9/9 通过（50.29 秒，对照竞争轮 81.8 秒）。范围补充 CLI package.json，移除入口对既有 test 单 worker 策略的旧覆盖，随后通过公开命令复验同一 27 文件；断言与超时不变。

- 最终本地闭环包括对本次真实发现 BUG-0133 做会话内复盘，使用其来源提交 c22ccc1c5 作为可核实证据，通过公开 lesson/nightly/report 命令验证幂等与 Seen=1，再按 Task 范围沉淀 LESSONS.md；不伪造三日期或每日自动运行历史。

- 已实际完成上述公开入口演练：nightly 读取当前仓库 2026-10-19 的 22 个提交，reviewPerformed=false；同一真实来源提交重复导入保持 Seen=1、collecting、enforced=false。材料与外部状态留在系统临时目录 `open-forge-autonomy-audit-6f506b6ad67f4513b32d67d525487843`，未提交控制器密钥。LESSONS 仅写本次真实教训，启动路由读取相关候选，未修改硬规则。

- 公开 `bun run verify:runtime-contract` 最终同一 27 文件 / 137 例全通过，465.74 秒；日志 `open-forge-task-0325-runtime-contract-v2-20261019.log`。单 worker 策略复用现有 test 入口，未调整原超时、断言、案例或包测试范围。
- BUG-0133 的真实签发时刻回归先 4/8 失败，接收时刻校验后 8/8 通过；补充真实未来、过期和有效结构但篡改签名的拒绝断言。`test:impact -- scripts/agents/release.mjs` 实际重跑质量套件 54 文件 / 597 例，通过；CLI 的制品/合同与 Desktop 直接流程另有上述真实命令覆盖，最终全影响测试尚未执行。
- 完整 `bun run check` exit 0，日志 `open-forge-task-0325-check-20261019.log`；当前版本发布说明已补，根指南 8074 字节，未放宽声明或质量基线。后续只补齐管理证据/waiver，再运行最终完整检查。
- 归属 Open-Forge-only：自主工具及本 fork 的分包路径、品牌与信任测试合同；未向上游发送。最终组合合并按 WAIVER-0005 保留七个他人 temp 文件，不豁免测试或推送/发布条件。
- 当前执行路径只有实现/评审，其他分析与 UI 适配尚未接入，实际环境均缺失；当前依赖仍要求 done+integrated，不静默改变人工接受合同。完整未完成项见 VERIFY-0019，目标仍未达成。
