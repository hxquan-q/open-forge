// Copyright The Open Forge contributors.

/**
 * 稳定错误码（ADR-0152）。错误码是跨进程合同：发布后不改语义、不复用，新增只能追加。
 * message 面向人，code 面向程序分支。本模块不依赖 typebox，preload 可直接打包。
 */
export const HOST_PROTOCOL_ERROR_CODES = {
	/** 请求信封结构不合法（不是对象、缺 method 等）。 */
	INVALID_REQUEST: "INVALID_REQUEST",
	/** Host 未注册该方法。 */
	UNKNOWN_METHOD: "UNKNOWN_METHOD",
	/** 参数未通过方法合同校验。 */
	INVALID_PARAMS: "INVALID_PARAMS",
	/** 实现返回值未通过方法合同校验（Host 侧缺陷，不是调用方错误）。 */
	INVALID_RESULT: "INVALID_RESULT",
	/** 所需 owner 插槽在当前 Host 未提供（如远端 Host 没有 BrowserOwner）。 */
	CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
	/** 实现抛出未分类错误。 */
	INTERNAL: "INTERNAL",
} as const;

export type HostProtocolErrorCode = (typeof HOST_PROTOCOL_ERROR_CODES)[keyof typeof HOST_PROTOCOL_ERROR_CODES];

const ERROR_CODE_SET: ReadonlySet<string> = new Set(Object.values(HOST_PROTOCOL_ERROR_CODES));

export function isHostProtocolErrorCode(value: unknown): value is HostProtocolErrorCode {
	return typeof value === "string" && ERROR_CODE_SET.has(value);
}

export class HostProtocolError extends Error {
	readonly code: HostProtocolErrorCode;

	constructor(code: HostProtocolErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "HostProtocolError";
		this.code = code;
	}
}
