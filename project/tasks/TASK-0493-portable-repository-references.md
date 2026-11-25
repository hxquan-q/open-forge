---
id: TASK-0493
type: task
status: verifying
priority: P2
owner: project
requirement: REQ-0031
source: BUG-0198
related_requirement: [REQ-0031, REQ-0032, REQ-0033]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0198]
execution: serial
branch: unassigned
worktree: unassigned（用户授权的主检出串行实施）
base_commit: 5a74b84dc
read_paths: [project, docs, apps, packages, scripts]
write_paths: [project, docs, exprot, packages/plugins/presets/eform-craft, packages/plugins/presets/build-apple-apps, scripts/ci, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-25
updated: 2026-11-25
---
<!-- Copyright The Open Forge contributors. -->

# 仓库个人路径引用盘点与可移植性修复

## 合同

- 来源与目标：BUG-0198；审计仓库中指向开发者本机的资料、链接、操作命令和已跟踪配置，消除会使克隆用户无法定位事实源或依赖特定开发机的错误引用。
- 输入 → 输出：按全仓扫描与语境分类；现行合同以仓库内部文档、源码与测试为事实源，必要的历史来源保留为不泄露具体机器路径且不冒充可重现的记录。
- 做 / 不做：修复可确认的失效本地源码链接、工作区外来源引用与可移植操作说明；对真正影响行为的配置/脚本先核合同和可控测试。保留明确用于兼容验证的路径示例、历史环境证据及未经核实的外部资料，不迁移私有凭据或用户数据，不进行远程 Git、发布或真实云端操作。唯一写入者串行实施；只读并行审计不改文件。
- Given 另一台机器的新检出，When 阅读现行需求、操作说明或链接到仓库源码，Then 不需要原作者本机路径即可定位仓库事实源；历史外部材料若未入仓须明确不可从仓库获取，不能伪造。
- 保留：既有产品、安全、插件和项目管理合同；不通过禁用功能或放宽校验掩盖真实运行路径问题。
- 用户决策（2026-11-25）：`project/agents.json` 已启用适配器的机器专属绝对路径仅记录问题，本次不修改该配置；当前实际检出 `chenxvhua`，没有创建或切换 Task 分支。
- 验证：修复前后做指定路径静态扫描及本地 Markdown 目标核对；如变更可执行代码/配置，先建立能证明旧路径问题的可控基线/回归，再执行对应定向测试。文档专用变更核对事实与链接；代码变更执行仓库规定的完整 check，impact/全量测试按用户要求单独申请，不自行启动。审查实际 diff，记录未覆盖项。
- 人工验收：文档可移植性以路径和链接核查为工程验收；用户可审阅分类与保留的历史证据。真实云端和付费 Provider 不访问。

## 审计与执行记录（2026-11-25）

- 基线：`chenxvhua` / `5a74b84dc`，开工时 `git status --short` 为空。项目管理文件、源码链接、可复制操作说明、插件 Skill、工具配置和历史证据分别分类；审计者仅只读，不并行写入。
- 范围记录纠正：实际修改历史入口 `exprot/README.md` 和 Apple Skill 的参考文档后，才补入 frontmatter 的 `exprot` 和该 preset 写域；这是执行期间的范围补记，不倒填为编辑前已声明。修改均为去掉不可访问的个人路径或说明历史边界。
- 个人辅助工作区路径：REQ-0031/0033、需求索引、TASK-0479、TASK-0425 和 eform-craft README/Skill 现改为仓库内合同、摘要或明确标记原材料未随仓库分发；保留原始 Code 审计报告及探针未入仓的限制，不声称摘要等价完整报告。TASK-0226/0482 的临时目录记录改为描述历史事实，不暴露辅助工作区绝对路径。
- 其他机器路径：PLAN-0009 的九个 `file:///` 源码链接改为仓库相对路径；Android 与 Claude Hook 旧复验命令改为当前检出/显式外部目录；历史清理建议不再要求删除整个用户目录。Apple Skill 移除不可访问的本机源码路径。Research 索引指向仓内摘要并说明转录未分发；历史归档入口标明本机路径不是当前操作指令。
- 历史证据保留：部分 Bug 文件仍记录当时的安装目录、工作区与 Windows TEMP 短/长路径形态；它们是故障环境或复现证据，不作为其他机器的可访问来源。历史原始日志、原始外部研究材料和审计探针未随仓库分发；不将摘要冒充完整材料。
- 初筛计数仅作范围说明：`project/` 和 `docs/` 的宽泛盘符正则分别命中 110 / 50 行，含示例、历史日志和环境证据，不是缺陷数量；本次未声称枚举所有拼接/编码路径。针对本用户辅助工作区绝对路径、特定 `file:///` 源码链接及已修脚本目录的定向复扫均无匹配。
- 控制器已启用配置仍绑定某开发机；按用户明确决定，本次只登记 [BUG-0199](../bugs/BUG-0199-controller-machine-specific-adapter-config.md)，未修改 `project/agents.json`，也未改变隔离证明或自主调度能力。
- 云效初始化辅助脚本：无默认个人目录，非 `-SelfTest` 路径必须显式指定已存在的 `-GeneratedDirectory`；在凭据检查、读定义及网络之前失败，正常离线 `-SelfTest` 保留。用户了解会影响使用方式后明确要求保留修复。未连接云效、未创建/修改远程流水线。

## 验证和交付

- 目录参数进程合同：修复前旧实现 1 通过、2 失败；修复后 `node --test scripts/ci/initialize-yunxiao-pipelines.node-test.mjs` 4/4 通过，测试进程移除云效令牌，不访问网络。
- eform-craft `test/manifest.test.ts` 14/14、build-apple-apps `test/agent-skill.test.ts` 5/5；指定 12 份修改文档的本地 Markdown 链接核查通过。初次核查发现需求索引一个既有错误的 RESEARCH-0040 链接，已修复并复查通过。
- `bun run check` 首次因三处既有文件本轮修改缺声明头失败；补齐后复跑 exit 0。之后仅修改 Task/Bug 管理记录与历史路径表述，最终需复核对应记录与守卫。impact/全量测试尚未执行；已向用户提出，用户先询问云效脚本用途并明确保留修复，未授权运行影响面测试。
- 发布说明：`v0.1.5` 碎片已写并经仓库脚本汇编；本地无同名 tag，本次没有查询远程或执行发布。
- 完整 `bun run check` 在补记范围与历史路径后再次实跑 exit 0（lint、root/CLI/Desktop/docs/mobile 类型、全部守卫、mobile lint）；用户未授权 impact/全量测试，未执行。独立只读审查 `review-portability` 检查了实际 diff、新 Task/Bug、测试与发布碎片，未发现阻断；审查者未运行测试或网络，个别链接核查超时，不宣称独立核完全部链接。Coordinator 另做目标链接检查。
- 遗留本机现场证据：BUG-0086/0087/0089/0090/0093/0108/0109/0110/0179/0192/0195 保留当时安装、会话或短/长 TEMP 路径的历史样本；这些不是当前指令或仓库依赖，未读取原始日志/会话。其他开发者的 `project/agents.json` 固定路径按 BUG-0199 与用户决定保持不变。
- 用户实际验收、远端 CI、真实云效请求及完整原始审计证据均未覆盖。工程验证和审查完成，Task 进入 verifying，等待用户接受；未远程 Git、发布或部署。
