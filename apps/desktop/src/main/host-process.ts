// Copyright The Open Forge contributors.
import {
	HostDispatcher,
	HostOwnerRegistry,
	type PortLike,
	SETTINGS_HOST_METHODS,
	serveHostOnPort,
} from "@vetta/host-protocol";
import { settingsHostDomain } from "./host/settings-domain.js";

/**
 * Host 子进程入口（TASK-0464，Phase 3 第二步）：仅承载 Node 纯净的 settings 域。
 * 主进程经 `child.postMessage(null, [port])` 投递端口；本进程在 parentPort 上接收，
 * 用同一 port-bridge 收发。依赖主进程专属能力的领域（models 的 clipboard/net、
 * mcp 的凭据存储）不在此进程，待 owner 插槽切片（RESEARCH-0050）。
 */
const host = new HostDispatcher(new HostOwnerRegistry());
host.register(SETTINGS_HOST_METHODS, settingsHostDomain);

interface ParentPortLike {
	on(event: "message", listener: (event: { ports?: unknown[] }) => void): unknown;
}

const parentPort = (process as { parentPort?: ParentPortLike }).parentPort;
if (!parentPort) throw new Error("host-process must be spawned by utilityProcess (parentPort missing)");

parentPort.on("message", (event) => {
	// utilityProcess 子进程收到的 transferred port 为 MessagePortMain 形状，结构满足 PortLike。
	const port = event.ports?.[0] as PortLike | undefined;
	if (port) serveHostOnPort(port, (request, events) => host.handle(request, { events }));
});
