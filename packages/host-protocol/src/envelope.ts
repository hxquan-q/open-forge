// Copyright The Open Forge contributors.
import type { HostProtocolErrorCode } from "./errors.js";

/** 跨 transport 的请求信封；params 在 Host 侧按方法合同校验。 */
export interface HostRequest {
	readonly method: string;
	readonly params: unknown;
}

export interface HostErrorPayload {
	readonly code: HostProtocolErrorCode;
	readonly message: string;
}

/** 响应信封：错误按值返回，不依赖 transport 能否保留 Error 子类。 */
export type HostResponse =
	| { readonly ok: true; readonly result: unknown }
	| { readonly ok: false; readonly error: HostErrorPayload };
