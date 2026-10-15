# Team: Runtime

This package owns the platform-neutral remote control wire contract and connection state machine.

- Production code must not import application packages, Electron, Android, Node I/O, Cloudflare APIs, or Coding Agent product implementations.
- Validate every untrusted frame before it reaches connection state.
- Protocol changes require contract tests for invalid input, ordering, duplicate delivery, timeout, cancellation, and reconnect behavior.
- Logs must contain diagnostic metadata only. Never log credentials, prompts, file contents, or raw payloads.
- Screen streaming and input injection remain outside this package.

## 规则分级

- **Invariant**：平台无关边界（不 import 应用包/Electron/Android/Node I/O/产品实现）、不可信帧先于状态机校验、日志不记凭据/prompt/文件内容/原始 payload、不承载屏幕流与输入注入。
- **Policy**：协议变更的合同测试要求（invalid/ordering/duplicate/timeout/cancel/reconnect）。
- **Guideline**：—（本文件无纯建议项）
