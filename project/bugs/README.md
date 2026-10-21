<!-- Copyright The Open Forge contributors. -->
# Bugs

这里记录已确认的缺陷、性能回退和可靠性问题。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`templates/bug.md`](templates/bug.md)。每个 Bug 必须能回答：

```text
用户做了什么？
实际发生什么？
应该发生什么？
如何稳定复现？
根因证据是什么？
哪一个测试会在旧实现失败？
```

## 当前 Bug

| ID | 标题 | 状态 | 优先级 | 关联计划 |
|---|---|---|---|---|
| `BUG-0137` | 安装版Windows沙箱二进制缺失或定位失败 | blocked | P1 | PLAN-0020 |
| `BUG-0138` | 启动绘制超时被记录为内容已可见 | verifying | P1 | PLAN-0020 |
| `BUG-0139` | 插件HostedRoute能力在模块重载后未注册 | verifying | P2 | PLAN-0020 |
| `BUG-0140` | Desktop测试日志写入默认用户数据目录 | verifying | P2 | PLAN-0020 |
| `BUG-0141` | Windows输入适配器重复初始化触发原生类型重名 | investigating | P2 | PLAN-0020 |
| `BUG-0136` | 点选页面元素后「发送给 Agent」不发起对话，模型也不会把改动写回源码 | verifying | P1 | PLAN-0006 |
| `BUG-0135` | 文件树 HTML 预览丢失文件目录语义（`srcDoc` 继承宿主地址）并用「加载完才可见」放大白屏；已按 TASK-0340 修复，工程验证通过，待真实 Desktop 验收 | done | P1 | — |
| `BUG-0134` | browser_tab 校验失败只回泛化文案，单回合把一次错误放大成 105 次；已按 TASK-0339 实现可纠正错误与有界止损，待集成与真实回合验收 | done | P1 | — |
| `BUG-0133` | 发布回执用发起时刻验签，正常稍后签发被误拒绝；真实时钟回归先红后绿，已集成 main `80ad98655`，组合 46/46 包通过 | verifying | P1 | PLAN-0019 |
| `BUG-0132` | 独立 CLI Photon 生成路径修复，独立制品 14/14 通过，已集成本地 main，组合 46/46 包通过 | verifying | P1 | PLAN-0019 |
| `BUG-0131` | 被拦截的主窗口导航把插件工具宿主永久留在 loading，设计插件工具全部被拒 | done | P1 | — |
| `BUG-0130` | 设置页脚仍显示旧品牌数据根的模型配置路径 `~/.vetta/agent/models.json`（本仓实际默认 `~/.openforge`，支持 env 覆盖与旧根迁移） | verifying | P3 | — |
| `BUG-0129` | Dependabot 第二轮 9 项 high 告警：electron 39.8.10 落入 4 项新通告区间（需 41.10.4/41.10.6+）、engine source-map-js 1.2.1（需 1.2.2+） | done | P1 | — |
| `BUG-0128` | 工作区被标为 Low 完整性级别后，仓库内 Electron 的 Chromium 子进程创建失败（GPU/renderer error 18） | verifying | P1 | — |
| `BUG-0127` | 团队长任务主进程累积性卡顿：会话读路径无缓存全量物化被每命令/每 turn/每次 persist 高频触发（trace 45.7% 采样） | done | P0 | PLAN-0002 |
| `BUG-0126` | session-interrupt monitor 长任务全程误报 suspected（判据不认识"主控等子代理"） | verifying | P3 | — |
| `BUG-0125` | 远程项目会话创建挂起约 30 分钟后失败，耗时阶段无远端读取观测 | verifying | P1 | — |
| `BUG-0124` | 插件 Hook 处理器被反复派发但渲染端已无该处理器，双方都没有定位信息 | verifying | P2 | — |
| `BUG-0123` | 消息列表出现重复渲染 key，React 反复告警且无法定位来源 | verifying | P2 | — |
| `BUG-0122` | 会话忙碌时续跑条仍可点击，点击必被内核拒绝且只弹笼统失败 | verifying | P1 | — |
| `BUG-0121` | SSH 握手失败后的清理窗口让 error 逃逸为全局未捕获异常 | verifying | P1 | — |
| `BUG-0120` | 远程项目的 Skill 展示读取把远端绝对路径当本机路径 | verifying | P2 | — |
| `BUG-0119` | 终端 owner 与订阅的生命周期监听器未成组解绑 | verifying | P2 | — |
| `BUG-0118` | report-canvas 展示元数据使用不支持的 canvas 枚举 | verifying | P2 | — |
| `BUG-0117` | SessionError 裸对象跨 IPC：team 链渲染端只见 [object Object]（单聊链有翻译层，team 链缺） | verifying | P2 | — |
| `BUG-0116` | 团队会话 runtime 损坏后无自愈：此后每次 send 必败 SESSION_NOT_FOUND，仅重启可恢复 | verifying | P1 | — |
| `BUG-0115` | 团队长任务收尾连环失败：结算失败 → 成员 runtime 重配竞态 → SESSION_NOT_FOUND | verifying | P1 | — |
| `BUG-0114` | 删除 runtime 未加载的 team 会话：SESSION_NOT_FOUND 抛穿 + 渲染端无 catch 成 unhandled rejection | verifying | P2 | — |
| `BUG-0113` | 文档站搜索索引因跨语言 URL 重复而返回 500 | verifying | P2 | PLAN-0003 |
| `BUG-0112` | 本地生产探针以回环 IP 绑定时产生 307 自重定向 | done | P3 | PLAN-0003 |
| `BUG-0111` | Desktop 可执行文件兜底发现路径仍指向旧品牌安装位置，命中不了真实安装 | investigating | P2 | — |
| `BUG-0110` | 上下文压缩提交与事件追加并发共享 `state.version`，压缩持久化间歇性版本冲突失败 | verifying | P2 | — |
| `BUG-0109` | 续跑条「继续」把持久会话路径当 runtime session id 传给宿主，必然 `SESSION_NOT_FOUND` | verifying | P1 | — |
| `BUG-0108` | 删除团队会话失败：通知日志写入与成员 runtime 释放失败双双掀翻删除 | verifying | P1 | — |
| `BUG-0107` | 四个 desktop 测试文件在 vitest 下收集期崩溃；TASK-0325 延迟计算打包路径，6 文件 / 29 例通过，待最终集成验证 | verifying | P2 | — |
| `BUG-0106` | 品牌档位翻转后 provider 展示名断言未同步，desktop 渲染层测试恒红 | verifying | P2 | — |
| `BUG-0102` | dev 启动在 Electron 二进制安装不完整时硬失败：无自愈、无可操作指引 | verifying | P2 | — |
| `BUG-0101` | 团队会话流式事件驱动成员胶囊条测量循环：Maximum update depth exceeded 整页崩为路由错误页 | verifying | P1 | — |
| `BUG-0099` | 内置浏览器仍调用 Electron 已废弃的 `canGoBack`/`canGoForward`，应迁移 `navigationHistory` | verifying | P3 | — |
| `BUG-0098` | 无效代理配置无有效性门即可保存，运行时静默降级为逐条请求失败 | verifying | P3 | — |
| `BUG-0097` | `assertCapability` 把「会话不归本运行时管/被拒绝」统一误报为「不支持 delete」，诊断语义失真 | verifying | P3 | — |
| `BUG-0096` | 异步上下文投递被瞬态拒绝时记录永久丢失，子代理完成通知/报告静默消失 | verifying | P2 | — |
| `BUG-0095` | `transformMessages` 不冲刷消息列表结尾的孤儿 tool_calls，严格 provider 永久拒绝该会话 | verifying | P1 | — |
| `BUG-0094` | 内置浏览器 `WebContentsView` 按工作区永久常驻、无回收上限，渲染进程随使用线性累积 | verifying | P2 | — |
| `BUG-0093` | 单个成员 runtime 恢复失败回滚全部已恢复成员，team 会话整体打不开 | verifying | P2 | — |
| `BUG-0100` | 会话文件锁对跨实例竞争无容忍：1s 重试预算、stale 无心跳、超时不带持有者信息 | verifying | P2 | — |
| `BUG-0092` | IPC 与巡检日志把抛值序列化为 `[object Object]`/只记 `errorName`，一线诊断信息全丢 | verifying | P3 | — |
| `BUG-0091` | Turn 终态持久化失败一次后 session 永久滞留 `recovery_required`，用户无恢复手段 | verifying | P1 | — |
| `BUG-0090` | Windows Inno 打包版通用 updater 检查确定性失败：`app-update.yml` 缺失与 feed 404 | verifying | P2 | — |
| `BUG-0089` | Windows 打包版每次启动安装 CLI shim 因目标文件被占用报 `EPERM: copyfile` | verifying | P2 | — |
| `BUG-0088` | allstar-coding ac-fence 审计日志缺 `fs.write` 权限声明，fence-log 追加必被拒 | verifying | P2 | — |
| `BUG-0087` | Team 会话 coordination 文档不可读时 delete-session 同样失败，僵尸会话无法清理 | verifying | P1 | — |
| `BUG-0086` | 内置浏览器指针穿透调用落在 `WebContents` 上，`setIgnoreMouseEvents` 每次必抛 TypeError | verifying | P1 | — |
| `BUG-0085` | provider 连接被切断后回合长时间不进终态：停滞重试级联把 30 分钟预算烧在死连接上 | verifying | P1 | — |
| `BUG-0084` | team 会话引用文件后输入框反复重建内容：中文输入法组字被打断、光标闪烁无法输入 | verifying | P1 | — |
| `BUG-0083` | React DEV 告警「flushSync was called from inside a lifecycle method」在 render 日志里成批落盘 | verifying | P3 | — |
| `BUG-0082` | ac-fence 黑盒 shell 白名单可被复合命令绕过、读域前缀可被 .. 穿越 | verifying | P1 | — |
| `BUG-0081` | 脚本面板 7 个 i18n key 缺条，界面显示原始 key 与 `{{count}}` | investigating | P3 | PLAN-0014 |
| `BUG-0080` | 提示音开关可用但 Agent 终结事件从不响铃 | investigating | P2 | PLAN-0014 |
| `BUG-0079` | 终端能力被误判为缺失 | verifying | P1 | — |
| `BUG-0078` | browser_tab 拒绝回传 snapshot 打印的 elementRef 编码串 | verifying | P1 | PLAN-0006 |
| `BUG-0077` | git preset 的 noGit 回归缺少 @testing-library/react 依赖声明 | done | P2 | — |
| `BUG-0069` | 流式输出使历史回复用量引用不断变化 | verifying | P1 | PLAN-0014 |
| `BUG-0070` | 工具调用间隙回复被提前标为完成 | verifying | P1 | PLAN-0014 |
| `BUG-0071` | 回合恢复成功仍报告旧错误终态 | verifying | P1 | PLAN-0014 |
| `BUG-0072` | 自动跟随中的半途滚动位置被错误记住 | verifying | P1 | PLAN-0014 |
| `BUG-0074` | Git 提交详情错误解析特殊路径和重命名 | verifying | P1 | PLAN-0014 |
| `BUG-0075` | 桌面配置并发读改写丢失更新 | verifying | P1 | PLAN-0014 |
| `BUG-0076` | 开发主进程缓存遗漏部分 workspace 输出 | verifying | P1 | PLAN-0014 |
| `BUG-0068` | 会话结束后用户消息仍显示在回复末尾（队列消费变体） | verifying | P1 | — |
| `BUG-0073` | BUG-0068 修复提交引入的四处锚定/派发序号回归（unbump 误杀最新轮重拉、未消费排队气泡锚进中段、首部重排污染 prependedCount、两层回退方向相反） | verifying | P1 | TASK-0194 |
| `BUG-0064` | desktop-packaged 合同 job 缺依赖安装致 cleanlist 必红 | verifying | P1 | PLAN-0014 |
| `BUG-0067` | docs-site 构建在 CI 上 Turbopack 报错（fumadocs stringifier 递归 + HTML 注释非法） | verifying | P2 | — |
| `BUG-0066` | desktop-packaged 的 packaged E2E job 连续红（`--staging` 三平台并集误报本平台 prebuild） | verifying | P1 | — |
| `BUG-0065` | macOS 上 worktree 用例因 /var 符号链接误红 | verifying | P2 | — |

| `BUG-0063` | quality CI 的 desktop tsc 冷启动堆内存耗尽 | verifying | P1 | PLAN-0014 |
| `BUG-0062` | ssh2 校验接受已撤销的主机公钥 | verifying | P1 | PLAN-0014 |
| `BUG-0060` | 原子写入短写与重命名前失败合同不完整 | verifying | P1 | PLAN-0014 |
| `BUG-0061` | 失效后的迟到 SSH 探测恢复旧状态 | verifying | P1 | PLAN-0014 |
| `BUG-0059` | CLI 进程测试并发下 RPC 超时 | investigating | P1 | PLAN-0014 |
| `BUG-0058` | 文本模型收到超出输入能力的图片 | verifying | P1 | PLAN-0014 |
| `BUG-0057` | Windows 新增 SSH 主机交互认证被 15s 握手预算掐断，KI 回退吞掉已存口令 | verifying | P1 | — |
| `BUG-0053` | 兼容网关省略思考块初始签名时被拒绝 | verifying | P1 | PLAN-0014 |
| `BUG-0054` | 短暂文件占用使原子写入直接失败 | verifying | P1 | PLAN-0014 |
| `BUG-0055` | 知识库工厂未转发宿主提示词来源 | verifying | P1 | PLAN-0014 |
| `BUG-0056` | 懒边界回归误将冷编译计入断言超时 | verifying | P1 | PLAN-0014 |
| `BUG-0050` | 打包版内置浏览器视图建不起来，宿主在运行时按相对路径 require 主进程模块 | verifying | P1 | — |
| `BUG-0051` | 注入 guest 的脚本引用网页里不存在的打包器辅助函数，浏览器交互命令全部异常终止 | verifying | P1 | — |
| `BUG-0052` | 注入 guest 的脚本缺少 return，点选与快照结果恒为 undefined | verifying | P1 | — |
| `BUG-0046` | Windows 上 PATH 含 GNU tar 时托管 Node runtime 解压 zip 必失败 | verifying | P1 | — |
| `BUG-0047` | 主进程 stdout pipe 断开后 uncaughtException 日志自反馈风暴 | done | P1 | — |
| `BUG-0049` | Windows 上 ControlMaster fd 传递失败，SSH 主机全部不可连接 | done | P1 | — |
| `BUG-0048` | ResizeObserver 噪音过滤器在 dev 下失效，渲染器错误日志被淹没 | verifying | P3 | — |
| `BUG-0045` | 有效预压缩摘要随尾部增长重复生成 | done | P2 | — |
| `BUG-0001` | Session 长任务取消/压缩后的终态与性能问题 | done | P0 | `PLAN-0002` |
| `BUG-0002` | DeepSeek Responses 流事件关联错误 | done | P1 | `PLAN-0002` |
| `BUG-0003` | App Monitor 漏记 Compaction | done | P1 | `PLAN-0002` |
| `BUG-0004` | Windows 上 Desktop 类型检查未可靠执行 | done | P1 | — |
| `BUG-0005` | DeepSeek 拒绝顶层无 `type` 的工具 schema | done | P1 | — |
| `BUG-0006` | Browser 点选可命中 html/body，附件变成整页截图 | done | P1 | `PLAN-0006` |
| `BUG-0014` | 选择项目后首次对话创建会话失败 | done | P1 | — |
| `BUG-0015` | 对话输入框无法通过粘贴或拖放引用文件 | done | P2 | — |
| `BUG-0016` | Desktop 阶段性刷新后长时间白屏 | done | P1 | — |
| `BUG-0017` | 工作区 Work/Coding 切换响应迟缓 | blocked | P2 | — |
| `BUG-0018` | 对话中断及中断后继续不流畅 | done | P1 | — |
| `BUG-0019` | Browser 面板 allowpopups 属性产生 React 警告 | done | P3 | — |
| `BUG-0020` | 同一会话中的 Canvas 操作连续被通道占用错误拒绝 | done | P2 | — |
| `BUG-0021` | 用户消息可能在 Assistant 回复之后显示 | done | P1 | — |
| `BUG-0022` | Desktop 当前环境无法启用沙盒执行模式 | investigating | P1 | `PLAN-0001` |
| `BUG-0023` | Windows 自带 bsdtar 不认识 `--force-local`，托管运行时安装失败 | done | P1 | — |
| `BUG-0024` | Renderer 引入 coding-agent Node 入口导致空白页与 renderer 构建失败 | done | P0 | `PLAN-0012` |
| `BUG-0025` | 二进制读提示点名当前会话不存在的技能，把模型引向死路 | done | P1 | `PLAN-0010` |
| `BUG-0026` | 会话执行环境路径未转发技能可用性，二进制提示文案与事实不符 | done | P3 | `PLAN-0010` |
| `BUG-0027` | CLI 宿主工具环境未转发技能可用性，二进制读提示与事实不符 | done | P3 | `PLAN-0010` |
| `BUG-0028` | 内置插件完整性清单锚定源码 plugin.json，全部系统插件运行时校验被拒 | done | P0 | — |
| `BUG-0029` | 插件工作区视图 description 未过 i18n 解析，侧边栏 tooltip 显示原始占位符 | done | P3 | — |
| `BUG-0030` | 窗口遮挡期间 Virtuoso 列表不渲染行，遮挡粘滞时可见窗口内空白 | done | P3 | — |
| `BUG-0031` | 会话归档导出/导入用 window.prompt 收集口令，Electron 不支持导致功能必失败 | done | P1 | — |
| `BUG-0032` | 项目会话归档导入副本写进默认对话目录，侧边栏不可见且幂等失效 | done | P1 | — |
| `BUG-0033` | 项目详情页会话计数依赖侧边栏展开懒加载，重载后误显「0 个会话」 | done | P3 | — |
| `BUG-0034` | 多分屏终端持续新增 WebGL context，触发 Too many active contexts 告警 | verifying | P3 | — |
| `BUG-0035` | Debug Profile 播种复制的 safeStorage 凭据跨 user-data 目录不可解密，Provider 鉴权必失败 | verifying | P2 | — |
| `BUG-0036` | 组队草稿点击操作区外任意位置即静默丢弃，无确认、不可恢复 | verifying | P3 | — |
| `BUG-0037` | 新会话页选中项目后工作区档位切换写错 cwd 键，高亮与确认句相反且切换不生效 | done | P1 | `PLAN-0001` |
| `BUG-0038` | Runtime Canary 的 Action RPC endpoint 契约不一致，`verify:ui:debug -- runtime-canary` 必失败 | verifying | P1 | — |
| `BUG-0039` | 新会话页 axe 审计命中三类可访问性违规（无名称按钮 / 交互嵌套 / 缺 landmark） | done | P2 | — |
| `BUG-0040` | 新建智能体未打开「能力」tab 时静默落盘零能力，无任何提示 | verifying | P1 | — |
| `BUG-0041` | 路由切换时 xterm dispose 竞态崩溃，整页落到错误边界 | verifying | P2 | — |
| `BUG-0043` | 「通用数据库」连接器首启被 30s 握手超时杀掉，npx 缓存损坏后秒失败且无 stderr 详情 | done | P1 | — |
| `BUG-0044` | 已装 MCP 连接器工具被会话静态 tools 白名单挡掉，模型永远看不到 | done | P1 | — |
