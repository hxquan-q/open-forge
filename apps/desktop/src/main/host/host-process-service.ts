// Copyright The Open Forge contributors.
import {
	HOST_PROTOCOL_ERROR_CODES,
	type HostDomainImplementation,
	HostProtocolError,
	type HostRequest,
	type HostResponse,
	type HostTransport,
	type PortLike,
	portHostTransport,
	type SETTINGS_HOST_METHODS,
} from "@vetta/host-protocol";

/** 子进程句柄的最小形状（utilityProcess.UtilityProcess 的可注入子集）。 */
export interface HostChildProcess {
	postMessage(message: unknown, transfer?: unknown[]): void;
	on(event: "exit", listener: (code: number) => void): unknown;
	kill(): boolean;
}

/** 端口对 + 主进程侧端口适配（生产为 MessageChannelMain/MessagePortMain；测试注入内存对）。 */
export interface HostProcessWiring {
	child: HostChildProcess;
	port1: unknown;
	port2: unknown;
	toPortLike: (port: unknown) => PortLike;
}

export interface HostProcessService {
	/** 经子进程转发请求信封；子进程不可用时返回 HOST_UNAVAILABLE 错误信封。 */
	request(request: unknown): Promise<HostResponse>;
	/** 请求子进程退出并释放端口。 */
	dispose(): void;
}

/** Host 子进程服务（TASK-0464）：fork 出的子进程持有 settings 域，主进程经端口转发；崩溃不自动重启。 */
export function createHostProcessService(wiring: HostProcessWiring): HostProcessService {
	const transport: HostTransport = portHostTransport(wiring.toPortLike(wiring.port2));
	let alive = true;
	wiring.child.on("exit", () => {
		alive = false;
	});
	// 把 port1 交给子进程（其 parentPort 'message' 事件的 ports[0]）。
	wiring.child.postMessage(null, [wiring.port1]);
	return {
		async request(request) {
			if (!alive) {
				return {
					ok: false,
					error: {
						code: HOST_PROTOCOL_ERROR_CODES.HOST_UNAVAILABLE,
						message: "host process is unavailable (crashed and not restarted)",
					},
				};
			}
			return transport(request as HostRequest);
		},
		dispose() {
			wiring.child.kill();
		},
	};
}

/** 把子进程服务包装成 settings 域实现：逐方法转信封，错误信封还原为 HostProtocolError（由 dispatcher 折回信封）。 */
export function settingsDomainProxy(
	service: Pick<HostProcessService, "request">,
): HostDomainImplementation<typeof SETTINGS_HOST_METHODS> {
	const forward = async <T>(method: string, params: unknown): Promise<T> => {
		const response = await service.request({ method, params });
		if (response.ok) return response.result as T;
		throw new HostProtocolError(response.error.code, response.error.message);
	};
	return {
		getServerUrl: () => forward<string>("settings.getServerUrl", {}),
		getSiteUrl: () => forward<string>("settings.getSiteUrl", {}),
		getModelTransport: () => forward<"auto" | "sse" | "websocket">("settings.getModelTransport", {}),
		setModelTransport: (params) => forward<"auto" | "sse" | "websocket">("settings.setModelTransport", params),
		getSessionInterruptContinue: () =>
			forward<{ mode: "auto" | "off" | "notify"; maxAttempts: number }>("settings.getSessionInterruptContinue", {}),
		setSessionInterruptContinue: async (params) => {
			await forward<null>("settings.setSessionInterruptContinue", params);
			return null;
		},
	};
}
