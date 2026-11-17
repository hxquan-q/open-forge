---
id: TASK-0488
type: task
status: verifying
priority: P1
owner: packages/runtime-node
requirement: []
source: user-request / workspace AUD-FILE-TOOL-ERROR-001
related_requirement: []
related_plan: []
related_tasks: [TASK-0479, TASK-0339]
related_issues: []
related_bugs: [BUG-0190]
execution: serial
branch: task/TASK-0488-file-policy-error-result
worktree: unassigned（主检出串行，本地候选，不处理main）
base_commit: 26789eae694fc9b8c35cc72c2e82eac9c31b2940
read_paths: [packages/runtime-node/, packages/runtime-core/, packages/agent/]
write_paths:
  - packages/runtime-node/src/coding/tools/read/read-tool.ts
  - packages/runtime-node/src/coding/tools/write/write-tool.ts
  - packages/runtime-node/test/coding-suite/read/read-runtime-contract.test.ts
  - packages/runtime-node/test/coding-suite/write/write-runtime-contract.test.ts
  - packages/runtime-core/test/kernel/agent-core-turn-engine.test.ts
  - packages/agent/test/tool-failure-guard.test.ts
  - project/tasks/TASK-0488-file-policy-error-result.md
  - project/tasks/README.md
  - project/bugs/BUG-0190-file-policy-denial-reported-success.md
  - project/bugs/README.md
  - .github/release-notes/fragments/v0.1.5/task-0488-file-policy-error-result.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-17
updated: 2026-11-17
---
<!-- Copyright The Open Forge contributors. -->

# 文件路径策略拒绝的结构化错误结果

## 合同

- BUG-0190 / 台账A7，队列第4项D2/S3，归属Upstreamable。只修read/write拒绝结果，不重开TASK0479权限或TASK0339浏览器止损工程。
- 输入→输出：现有路径策略拒绝字符串→保留text并返回isError:true、details.code:policy_denied；当前Runtime合同与适配已有承载能力，不新增公共类型/错误框架。
- Given工具注册入口与拒绝policy，When执行read/write，Then结构化失败且没有文件读写/mkdir；When在允许路径执行代表性读取/写入，Then成功输出与持久文件结果不变。
- Given通用Runtime工具正常resolve错误结果，When经过真实AgentCoreTurnEngine/执行器，Then模型可见toolResult保留isError及code；同Turn同参数三次policy_denied后既有止损生效，改参数/新Turn恢复遵从现合同。
- 保留：路径解析/策略及拒绝文案、正常details/review、权限拒绝不执行副作用；不改edit/shell/SSH/ENOENT/取消，不新增权限、不开放Skill/家目录。动态policy变允许不绕过同Turn已触发止损。
- 方案比较：两份生产者就地补结果字段最简单；throw普通Error会丢确定性policy_denied语义，新helper/全局类型无真实需要。不改Runtime/Agent生产代码，若发现透传真实缺口先回报与更新合同。

## 验证与协作

- 实施前读最近runtime-node/runtime-core/agent AGENTS与README、相关ADR/源码/测试。外部I/O可替身，内部注册/适配/执行器尽量真实，不从Agent/Runtime反向导入平台或coding-agent实现。
- 先在现有read/write拒绝合同中加结构化字段断言取得目标红灯，再只补拒绝生产者字段；验证拒绝零I/O、允许正常读写。Runtime测试通用返回isError错误结果，Agent现有invalid_input止损fixture可参数化policy_denied，不复制私有实现。
- 定向命令：`bun scripts/quality/run-vitest.mjs --run packages/runtime-node/test/coding-suite/read/read-runtime-contract.test.ts packages/runtime-node/test/coding-suite/write/write-runtime-contract.test.ts packages/runtime-core/test/kernel/agent-core-turn-engine.test.ts packages/agent/test/tool-failure-guard.test.ts`，按各包runner配置必要时分包执行。收尾完整bun run check，不自动跑impact/全包/全量/live。
- 必须串行，同一concern跨生产者/消费者合同，不并行实施后续Bug。实现子代理仅写上述六份源码/测试，Coordinator写Bug/Task/索引/发布碎片并本地提交，另派独立只读审查。
- 用户仅授权主仓和工作区。TEMP/TMP及隔离VETTA_HOME定向工作区 `.bugfix-validation/tmp`，日志同目录。禁止范围外私有状态、真实Provider/UI/dev/安装依赖、main或远程Git。
- 既有全仓waiver/类型/声明头阻断不擅自治理；若仍在则verifying/integration pending保留候选，不宣称工程完成或集成。文件权限改变/资源allowlist属于A8另题。

## 交付

- 宿主原生实现子代理 `fix-file-error`已派发，仅有上述六份源码/测试写域；Coordinator负责记录/索引/碎片/提交，后续Bug未并行实施。
- 首轮实际目标红灯：真实registration/read/write拒绝合同4个用例全部因isError实际undefined、期望true而失败（read1，write受保护Skill2、wiki1），exit 1，其余36例按过滤跳过；非环境失败。Coordinator已读实际日志。实现者红灯job已回收，生产者当时尚未修改。
- 实现仅两生产者policy拒绝分支保留原text并增加isError:true/details.code:policy_denied；Runtime/Agent生产代码无须改变，未新增类型/helper或放宽权限。
- 定向绿灯按三包各自Node runner执行：runtime-node read-runtime-contract29+write-runtime-contract12=41，runtime-core agent-core-turn-engine21，agent tool-failure-guard13，共4文件75/75，均exit 0。Coordinator已读三份真实绿灯日志。覆盖真实注册拒绝零I/O、同注册入口拒绝→允许真实写文件、Runtime resolve错误结果到下一模型请求、policy_denied同参三次后止损/改参与新Turn恢复；正常读写原行为也随整文件实跑。
- 实现者5个红绿/格式后台任务均已回收；六文件Biome检查exit 0、无格式改写，并已停写。Coordinator已看实际diff，写域仅两生产者与四测试，未见无关生产变更。
- 新上下文 `review-file-error`已完成独立只读候选审查，亲读源码/测试与四红、75绿及格式日志，未发现本项代码/测试/安全阻断；确认未扩权、未弱化原合同且无跨包反向依赖。审查未运行Git/测试，不冒充异家族审查。
- 保持verifying/integration pending，仅保存本地候选。既有全仓门禁需owner治理事项按用户允许的跳过机制记录后继续队列，不宣称工程完成/已集成/发布。
- 完整bun run check已回收exit 1，仍为既有WAIVER-0011/0012过期、三份无关测试声明头、spawn请求夹具/委任代码/旧terminal-settle测试类型错误；未见本项路径报错。全仓Biome、Task合同/索引和CLI/docs/mobile类型通过，不擅自治理waiver或夹带其他Bug，不宣称完整门禁通过。
- 发布碎片：`.github/release-notes/fragments/v0.1.5/task-0488-file-policy-error-result.md`，不升版/汇编/发布，不改已发布说明。
