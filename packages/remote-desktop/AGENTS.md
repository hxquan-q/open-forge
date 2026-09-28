# Remote Desktop Agent Guide

This package owns the platform-neutral WebRTC signaling, browser peer orchestration, and remote input DataChannel contract.

- It must not import Electron, Android, Cloudflare, Node native APIs, or chat/session protocol modules.
- Screen media and input injection are host-provided adapters. Never implement OS permission bypasses here.
- Validate every signaling and input message at the first boundary. Reject unknown fields that could expand authority.
- Logs and diagnostics may contain session IDs, state, dimensions, codec names, counts, and timing only. Never log SDP, ICE candidates, key text, clipboard data, or captured pixels.
- A remote-control grant is scoped to one peer session and must be explicitly revocable by the host.
- WebRTC E2E must verify nonblank moving pixels and a real DataChannel input round trip in Chromium.

## 规则分级

- **Invariant**：不导入宿主/平台 API、不做 OS 权限绕过、首边界校验并拒绝扩权字段、不记 SDP/ICE/按键/剪贴板/像素、remote-control grant 单会话且可撤销。
- **Policy**：WebRTC E2E 验证要求（非空动态像素 + DataChannel 输入往返）。
- **Guideline**：—（本文件无纯建议项）
