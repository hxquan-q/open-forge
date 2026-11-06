// Copyright The Open Forge contributors.
/** renderer → Host 的唯一请求 channel（ADR-0152）；载荷为 `{ method, params }`，响应为 HostResponse 信封。 */
export const HOST_REQUEST_CHANNEL = "vetta:host:request" as const;
