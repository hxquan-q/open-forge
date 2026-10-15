<!-- Modified by The Open Forge contributors. -->
# Desktop 性能记录

本目录收录按日期保存的历史性能诊断与测量快照。文中的品牌、路径、构建与指标属于当时环境，不代表当前 Open Forge 的默认配置或性能承诺；当前操作入口见[开发验证指南](../../dev/README.md)。

- [侧边栏会话切换：跨进程性能诊断](./session-switch-observability-2026-08-20.md)：说明 Renderer、Desktop 包装层与 Coding Agent 初始化三层 trace 的开启、关联和解读方式。
- [新会话首次发送：先反馈、后初始化](./new-session-first-send-2026-08-19.md)：记录首次发送卡顿的复现、定位、执行顺序重构、前后对比与后续优化方向。

相关历史记录：[侧边栏切换、发送卡顿与入口首开优化（2026-08-18）](../sidebar-perf-081826.md)。
