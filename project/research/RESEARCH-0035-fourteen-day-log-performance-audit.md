---
id: RESEARCH-0035
type: research
status: done
priority: P1
owner: coordinator
source: user-request; 2026-10-08 至 2026-10-21 本机保留日志、当前源码与本地 Git
created: 2026-10-21
updated: 2026-10-21
related_requirement: [REQ-0002]
related_plan: [PLAN-0002]
related_issue: []
related_tasks: [TASK-0350, TASK-0280, TASK-0281, TASK-0282]
---
<!-- Copyright The Open Forge contributors. -->

# 最近14天日志：性能瓶颈、剩余错误与优化顺序

## 问题与范围

**仍有值得处理的问题；优先核查安装版沙箱缺失、消息身份重复及远端会话资源加载。** 启动观测还存在明确的口径问题：大部分“正文可见”实际上是等待超时，不能拿其耗时当首屏性能。旧巡检中的终端监听、远端技能展示、SSH 握手异常等已有专项修复，不能重复列为尚未修复。

本轮只做调查，不修改业务代码、不启动或操作 Desktop、不连接真实 SSH/Provider。关联 [TASK-0350](../tasks/TASK-0350-fourteen-day-log-performance-audit.md)。后续修复需独立确定范围与回归合同。

## 事实来源

- 日期口径：Asia/Taipei 的 2026-10-08 至 2026-10-21，共14个日历日期；末日截至采样，不声称覆盖完整14×24小时。2026-10-11 没有保留事件，不能声称该日无故障。
- 2026-10-21 22:15:31 采样：dev 30、default 11、archive 14，共55份运行日志、6,171,139字节；另检查 temp 顶层8份构建/质量/插件测试日志。来源别名、逐文件指纹、计数和性能样本见[取证附表](log-audit-2026-10-21-evidence.md)。日志不等于55次运行。
- 标准运行事件头为 info 18,334 / warn 1,154 / error 1,837。归档复制、同一失败跨进程记录、测试输出及安全拒绝会重复或增加计数，不能据此计算故障率。
- 源码基线 `main@1b25abff0004fd32898eae4b442c3e73108fb0ae`。调查期间另一会话开始 TASK-0349；其修改不属于本轮，未用于宣称任何修复已完成。未 fetch 或核实所有运行实例加载的提交。
- `.ua` 图谱日期为2026-10-12、commit `254796d870036f0d3e7c0bbb9a0a1a2cbd28448f`，17,009节点/35,740边；至基线有1,195条变更路径。已读分层/导览与日志、技能、SSH相关节点和一跳关系，再回读当前实现；未刷新图谱。
- 对照前轮 [RESEARCH-0027](RESEARCH-0027-dev-log-audit.md)、[RESEARCH-0026](RESEARCH-0026-desktop-web-vitals-audit.md)、BUG-0118至0128及对应 Task。历史评测只作历史证据，不冒充本轮实测。

## 当前结论

### 优化优先级与最低验证

| 优先级/所有者 | 本轮证据 | 建议与最低验证 |
|---|---|---|
| P1：Desktop 打包与沙箱 | `default/main/2026-10-21.log:1522`：sandbox unavailable / binary_not_found；同次12:52启动有安装版可执行文件与 app.asar 栈证据 | 先核对实际安装包的受控沙箱清单、安装落点及探测路径。隔离安装包必须通过制品合同，沙箱状态应可用或呈现明确失败；不能通过关闭沙箱或放宽打包校验消除报错。无需先优化渲染装饰。 |
| P1：会话列表/身份 | 10-21 `dev/render:12–27` 共16条 duplicate render keys；载荷退化为 `[object Object]` | 续接 BUG-0123：先让诊断载荷可读并按来源定位，再修历史/live/跨成员合并的身份问题。回归应走打开长会话→翻页→live更新，保持滚动锚点且同一逻辑项唯一；不能简单在 key 后加 index。 |
| P1：远程资源初始化 | 10-20 `dev/main:879` reload 11,879ms、9个远端操作、累计10,720ms；其中8次stat、1次realPath。10-21仍有同型9次操作 | 续接 BUG-0125，先测SSH helper与exec回退的调用数/RTT/连接复用。按一次reload合并相同探测，评估有界并发或批量元数据查询；仅在有失效合同后缓存。相同夹具按冷/热、取消/失败比较reload分位数与远端调用数，不能仅提高超时。 |
| P1（测量前置）：启动可观测性 | 33条 dev content记录中30条 result=timeout；日志名却为 content frame visible | 区分真实paint、timeout和后台窗口；记录whenReady、动态模块加载、路由提交与内容paint的独立阶段。用IPC fake及可控计时器验证超时不计入成功paint；之后再做同负载启动前后对比。不要把30条超时当成30次真实10秒首屏。 |
| P2：插件宿主生命周期 | Hook缺失仍无根治证据；10-21另有29条 unregistered navigation capability 导致多个插件加载失败 | Hook注册代次/lease及HostedRoute provider装配分开排查。隔离reload/HMR/卸载→再激活，确认旧派发受控、当前注册可用、同一加载入口成功；需要冷启动对照才能区分HMR与稳定故障。 |
| P2：日志/测试基础设施 | 默认目录255条 marketplace失败中254条带测试栈；116条ghost角色告警对应测试夹具 | 测试统一使用临时数据根/注入logger，运行后断言真实日志目录没有新增写入；日志带运行角色/构建身份，避免开发测试、安装版与生成预览混算。 |

性能建议是下一步实验，不是已证明的提速百分比。远端26条非零观测与55条零远端操作观测必须分组；后者也有数秒reload，说明不能把全部初始化延迟都归因于网络。

### 已有错误尚未闭环的程度

| 项目 | 证据与截至本轮的判断 |
|---|---|
| BUG-0123 重复消息身份 | **仍在发生**：10-21有新诊断。TASK-0280明示只加观测、不改去重；源码 MessageListView 每次messages变更运行诊断。renderer console桥只转发字符串，结构化对象在文件里成为 `[object Object]`，新增诊断尚不能回答重复来源。 |
| BUG-0124 Hook handler not found | **只完成取证，未证明根治**：窗口内122条落盘记录，最后10-16；不能声称10-17以后仍发生。TASK-0281明示派发语义不变。宿主activation/lease与renderer注册表不对称仍需隔离验证，未确定唯一根因。 |
| BUG-0125 远端会话约30分钟 | **只补观测，根因未闭环**：10-16有1,840,165.4ms失败和1,838,273.3ms成功创建；10-17另有62,716.9ms失败，prompt-runtime占62,541.5ms。之后可见8stat+1realPath的秒级代价；没有证据宣称30分钟挂起在10-21又复现，也不能因时长下降宣布修好。 |
| HostedRoute未注册 | **新近可确认的加载失败，根因未定**：10-21共29条，影响browser、设计等插件。当前 renderApp 在root.render前调用initializeHostedRoutes，后者应注册provider，所以不直接断言当前冷启动必然缺注册；优先隔离HMR下singleton/注册代次及运行构建错位。 |
| 目录读取Capability失败 | **失败仍有，但不能一律立Bug**：共112条IPC记录（dev109/default3）；dev至少78条明确由canonical路径越出授权项目根拒绝。源码filesystem-service保留realpath边界是正确的。需区别合理越权拒绝、合法symlink/项目根错误及SSH通道失败，不以扩权作为修复。 |
| Windows远程输入重复原生类型 | 默认目录27条 Duplicate type name INPUT。system-input每次初始化都执行命名koffi.struct(INPUT)；本轮隔离Node探针重复声明同名新类型，稳定得到同类Duplicate type name。部分记录来自重复测试初始化；尚未复现真实宿主stop/start后的影响，不能把27条说成27次用户远控失败。建议复用类型注册，回归在同进程连续创建两次且均supported。 |

### 已有明确修复，不再重复推荐同一方案

| 历史问题 | 当前实现/记录证据 | 仍需区分 |
|---|---|---|
| report-canvas展示Schema错误（BUG-0118） | ability.json默认/英文canvas均为docs，TASK-0275有Schema回归 | verifying不等于从未编码。 |
| 终端监听器积累（BUG-0119） | `dcce9f877`；terminal.ts按owner成组removeListener并释放订阅，TASK-0276有旧红新绿 | 没有本轮堆快照，不宣称具体节省内存。 |
| 远端Skill当本地文件读取（BUG-0120） | `9e2084c31`/`036d44848`；宿主保留SSH URI、模型路径另行包装，SkillService跳过远端本地presentation读取 | 原始报错最后10-16，非新的未修复发现；远端图标完整展示仍受原范围限制。 |
| SSH握手error逃逸（BUG-0121） | `f89acb75d`；ssh2-runner统一destroyQuietly加终止error保护，TASK-0278有真实Client回环回归 | 不代表所有Channel open failure/超时已修。 |
| 忙碌续跑（BUG-0122） | TASK-0279已加队列门控、在途锁、busy分类；本窗口最后原症状10-16 | 当前没有更新失败证据，不据旧日志重复实施。 |
| 团队长任务越来越卡（BUG-0127） | 读缓存、指纹、索引、快照合并与投影缓存等路线已集成，状态done；原记录含实测，10-18用户对平行缓存实现反馈明显改善 | RESEARCH-0026的10-15指标早于此修复，不能当现行基线。session-updated增量协议只是条件候选，先复测字节量/序列化成本再决定。 |
| Vitest resourcesPath收集崩溃（BUG-0107） | TASK-0325集成于`80ad98655`，Bug正文已记录6文件29例及组合验证 | 旧Task中的存量红不代表当前仍红；本轮未重跑业务套件。 |
| 导航卡住插件宿主/Browser重复失败/HTML预览白屏 | BUG-0131/0134/0135已有修复，后两条10-21按用户验收闭合；TASK-0341版本探测缓存也已实施 | 不重复提出已做的文件协议、止损和版本探测缓存；旧导航拦截告警本身也不证明修复失败。 |

### 环境、测试与生成内容：需要处理，但不同于宿主核心缺陷

- **测试污染已可取证**：default目录255条marketplace失败，145条manifest 404、73条offline、36条package=wrong都带`.test.ts`调用栈；剩1条是真实ERR_CONNECTION_CLOSED。process-health的ghost调用在process-health.test.ts明确存在。不要据该目录报错多判断市场服务整体不可用。
- **生成预览错误**：10-19至10-21有26条KitPartRow/shortagesForPart ReferenceError；相关HTML嵌套告警带设计frames标记，10-19还有位图化readyExpression超时。仓库源码未找到该组件或变量；归属生成页面/预览内容，不能当成宿主会话状态机崩溃。优化方向是生成页面的构建/挂载验收及预览错误归属，不只是屏蔽console。
- **安装环境**：10-21有safeStorage解密失败后按未配置降级、universal-db命令不存在、updater 404与市场连接关闭。未读凭据或真实配置，不推断已丢Key；分别核对加密上下文/迁移、MCP可执行文件、更新渠道和网络。
- **打包证据不完整**：pack-win-inno.log:928为EPERM；第二轮:943被Windows受控沙箱校验阻止；第三轮末尾显示已创建安装器，但未证明前述受控沙箱问题已修，且稍后安装版有binary_not_found。两轮还有release notes暂存缺失提示与solar--folder-move-linear图标缺失，后者当前FileOrganizeApproval仍引用该图标。成功生成exe不能替代制品合同验证。
- 10-17的renderer launch-failed等与BUG-0128/MIC Low排障时段相邻；当前已有修复记录，未取得本轮dump或加载版本，不将其全部归成新崩溃。取消、沙箱脚本阻断、CSP开发警告也不直接视为功能Bug。

## 被否决的方案

- 不按error次数或verifying状态建立“所有错误未修”的清单；逐项回看实际交付和新日志。
- 不先提高超时、禁沙箱、扩大文件根、禁用功能或改React key为index；这些会掩盖原问题或改变安全/身份合同。
- 不据开发异步初始化耗时推算CPU阻塞，不把日志中的100ms慢任务阈值当业务失败；runtime-and-cli在content等待之后注册，不能直接归因为此前的首屏等待。
- 不以旧400ms INP/21.9s LCP或历史团队卡顿数值承诺当前仍慢；不未经复测就重做缓存/投影，也不对候选优化给出虚构收益。

## 代码/测试/指标锚点

- 启动：`apps/desktop/src/main/app-lifecycle.ts`（10s超时仍resolve）、`main.ts`（content frame visible不区分result；之后才注册runtime-and-cli）；`renderer/main.tsx`及`root-layout/RootLayoutView.tsx`（准备与双rAF上报）。dev确认boot painted的28样本中位1,881.5ms；3个content painted样本为7,085/9,850/10,078ms。33个runtime初始化中位1,945ms、p95 5,563ms、最大21,069ms；异步等待与同步CPU尚未分解。
- 身份诊断：`renderer/domains/conversation/services/conversation-key-diagnostics.ts`和`components/message-list/MessageListView.tsx`；日志桥`main/window-manager.ts`。诊断每次messages变更O(n)分组并分配identity，属于需量测的额外热路径，不声称已测得显著成本。
- 远端：`main/agent-runtime/resource-runtime.ts`的reload与remoteStats；`packages/runtime-ssh/src/project-resource-access.ts`（stat/readText/readDirectory/realPath，累计操作时间）；TASK-0282没有优化读取行为。
- 插件：`renderer/initialize-hosted-routes.ts`、`shared/capabilities/renderer-capability-host.ts`、`domains/plugins/runtime/plugin-hosted-route-capability.ts`；Hook证据见TASK-0281列出的双侧入口。
- 隔离探针：Node加载已安装koffi，先后两次`struct('OpenForgeAuditInput', {x:'int'})`，第二次返回`Duplicate type name 'OpenForgeAuditInput'`；未调用系统输入或真实实例。仅验证同名类型重复注册行为。
- 方法：Python标准库读取日志字节，按`[YYYY-MM-DDTHH:mm:ss...][level][scope]`的实际空格格式识别事件头，取多行块至下一事件头；只提取日期、等级、阶段、result和数字聚合。窗口按事件日期筛选，SHA-256标识读取边界；p95用nearest-rank，多个指标独立取样。源码检索使用rg，本地Git核对目标路径历史，不执行日志中的命令。

## 失效条件与置信度

日志证明失败曾发生，不能独自证明当前可复现或唯一根因。默认目录混有真实安装版、Node测试及其他工具进程；dev含HMR/热重载，未按PID/构建关联全部事件。逐文件读取并非跨目录原子快照，文件采样后继续追加时以附表指纹为边界。只覆盖本机已保留文件，不含私有业务服务端或GitHub CI全量日志。

高置信：paint/timeout口径、10-21重复key、新近插件加载失败、安装版沙箱缺失、测试日志污染、具体远端调用与耗时。中置信：需要优化的阶段/接缝。未证实：当前发行版整体LCP/INP、内存泄漏、Hook唯一原因、HostedRoute冷启动故障、预期优化百分比。

## 下一步触发信号

先以隔离制品核对沙箱缺失；随后分别推进消息身份、远端资源读取和启动测量。Hook/导航注册用reload与冷启动对照建立反馈环，再决定修复。只有新trace显示IPC字节数或主线程序列化占主导，才升级为session-updated增量协议；保护既有兼容与取消/错误语义。

本轮交付仅文档与脱敏证据。检查命令与实际结果写入TASK-0350；未运行新的UI、真实Provider、完整业务测试或完整check。
