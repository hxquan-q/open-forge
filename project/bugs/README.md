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
| `BUG-0004` | Windows 上 Desktop 类型检查未可靠执行 | in_progress | P1 | — |
| `BUG-0005` | DeepSeek 拒绝顶层无 `type` 的工具 schema | verifying | P1 | — |
| `BUG-0006` | Browser 点选可命中 html/body，附件变成整页截图 | verifying | P1 | `PLAN-0006` |
| `BUG-0014` | 选择项目后首次对话创建会话失败 | investigating | P1 | — |
| `BUG-0015` | 对话输入框无法通过粘贴或拖放引用文件 | investigating | P2 | — |
| `BUG-0016` | Desktop 阶段性刷新后长时间白屏 | investigating | P1 | — |
| `BUG-0017` | 工作区 Work/Coding 切换响应迟缓 | investigating | P2 | — |
| `BUG-0018` | 对话中断及中断后继续不流畅 | investigating | P1 | — |
| `BUG-0019` | Browser 面板 allowpopups 属性产生 React 警告 | investigating | P3 | — |
| `BUG-0020` | 同一会话中的 Canvas 操作连续被通道占用错误拒绝 | investigating | P2 | — |
| `BUG-0021` | 用户消息可能在 Assistant 回复之后显示 | investigating | P1 | — |
| `BUG-0022` | Desktop 当前环境无法启用沙盒执行模式 | investigating | P1 | `PLAN-0001` |
| `BUG-0023` | Windows 自带 bsdtar 不认识 `--force-local`，托管运行时安装失败 | verifying | P1 | — |
