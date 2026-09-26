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
| `BUG-0034` | 多分屏终端持续新增 WebGL context，触发 Too many active contexts 告警 | investigating | P3 | — |
| `BUG-0035` | Debug Profile 播种复制的 safeStorage 凭据跨 user-data 目录不可解密，Provider 鉴权必失败 | investigating | P2 | — |
| `BUG-0036` | 组队草稿点击操作区外任意位置即静默丢弃，无确认、不可恢复 | investigating | P3 | — |
| `BUG-0037` | 新会话页选中项目后工作区档位切换写错 cwd 键，高亮与确认句相反且切换不生效 | verifying | P1 | `PLAN-0001` |
| `BUG-0038` | Runtime Canary 的 Action RPC endpoint 契约不一致，`verify:ui:debug -- runtime-canary` 必失败 | verifying | P1 | — |
| `BUG-0039` | 新会话页 axe 审计命中三类可访问性违规（无名称按钮 / 交互嵌套 / 缺 landmark） | verifying | P2 | — |
