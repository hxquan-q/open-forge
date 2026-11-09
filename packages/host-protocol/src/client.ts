// Copyright The Open Forge contributors.

/**
 * 客户端出口（`@vetta/host-protocol/client`）：只含信封解包与错误还原，运行时不加载 typebox，
 * 供 preload / 远端客户端打包。方法签名以 `import type` 从领域合同取得。
 */
import type { HostRequest, HostResponse } from "./envelope.js";
import { HOST_PROTOCOL_ERROR_CODES, HostProtocolError, isHostProtocolErrorCode } from "./errors.js";
import type { HostMethodSignatureMap } from "./method.js";

/** transport 只负责把请求送到 Host 并带回响应信封：直接调用、Electron IPC、MessagePort、stdio、WS 均实现此签名。 */
export type HostTransport = (request: HostRequest) => Promise<HostResponse>;

export interface HostClient<M extends HostMethodSignatureMap> {
	call<K extends keyof M & string>(method: K, params: M[K]["params"]): Promise<M[K]["result"]>;
}

function toError(response: unknown): HostProtocolError {
	if (response && typeof response === "object") {
		const error = (response as { error?: unknown }).error;
		if (error && typeof error === "object") {
			const { code, message } = error as { code?: unknown; message?: unknown };
			if (isHostProtocolErrorCode(code)) {
				return new HostProtocolError(code, typeof message === "string" ? message : code);
			}
		}
	}
	return new HostProtocolError(HOST_PROTOCOL_ERROR_CODES.INVALID_REQUEST, "Malformed Host response");
}

export function createHostClient<M extends HostMethodSignatureMap>(transport: HostTransport): HostClient<M> {
	return {
		async call(method, params) {
			const response: unknown = await transport({ method, params });
			if (response && typeof response === "object" && (response as { ok?: unknown }).ok === true) {
				return (response as { result: unknown }).result as never;
			}
			throw toError(response);
		},
	};
}

export type { HostRequest, HostResponse } from "./envelope.js";
export type { HostProtocolErrorCode } from "./errors.js";
export { HOST_PROTOCOL_ERROR_CODES, HostProtocolError, isHostProtocolErrorCode } from "./errors.js";
// port-bridge 仅依赖 envelope/errors，不加载 typebox，随 client 子路径供 preload 打包（TASK-0463）。
export { type PortLike, portHostTransport, serveHostOnPort } from "./port-bridge.js";
