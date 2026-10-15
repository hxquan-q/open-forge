# Remote Relay Agent Guide

This application owns the Cloudflare Worker and Durable Object relay implementation.

- Keep it a transport boundary: validate every frame with `@vetta/remote-control`, but never interpret prompt, file, terminal, screen, or input payloads.
- Pairing credentials are secrets. Never include them in URLs, logs, Durable Object attachments, errors, or test snapshots.
- Durable Object hibernation means in-memory state cannot be required for routing. Persist room authorization state and use small WebSocket attachments for connection metadata.
- Do not add a Cloudflare deployment, secret, route, account configuration, or production test without explicit user approval.
- Test all externally observable routes with the Workers Vitest pool. Include unauthorized and malformed-input cases whenever routing or authentication changes.

## 规则分级

- **Invariant**：纯传输边界（只校验不解释 payload）、Pairing 凭据不进 URL/日志/Durable Object 附件/错误/快照、未经用户批准不碰 Cloudflare 部署/密钥/路由/生产测试。
- **Policy**：hibernation 下授权状态持久化要求、外部路由的 Workers Vitest 测试要求。
- **Guideline**：—（本文件无纯建议项）
