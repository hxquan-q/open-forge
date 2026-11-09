// Copyright The Open Forge contributors.
/** renderer → Host 的唯一请求 channel（ADR-0152）；载荷为 `{ method, params }`，响应为 HostResponse 信封。 */
export const HOST_REQUEST_CHANNEL = "vetta:host:request" as const;
/** MessagePort 握手（TASK-0463）：preload 发起请求，主进程经 HOST_PORT_CHANNEL 回传端口（ipc.invoke 同信封保留为回退）。 */
export const HOST_PORT_REQUEST_CHANNEL = "vetta:host:port:request" as const;
export const HOST_PORT_CHANNEL = "vetta:host:port" as const;
