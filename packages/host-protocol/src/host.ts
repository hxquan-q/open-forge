// Copyright The Open Forge contributors.
import type { Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { HostTransport } from "./client.js";
import type { HostRequest, HostResponse } from "./envelope.js";
import { HOST_PROTOCOL_ERROR_CODES, HostProtocolError, type HostProtocolErrorCode } from "./errors.js";
import type { HostMethodDefinition } from "./method.js";
import type { HostOwnerRegistry } from "./owners.js";
import type { HostEventSink } from "./port-bridge.js";

export interface HostCallContext {
	readonly owners: HostOwnerRegistry;
	/** 连接级事件发射器：仅 port 服务路径提供；invoke 回退通道缺省（事件走旧通道）。 */
	readonly events?: HostEventSink;
}

export type HostMethodHandler<D extends HostMethodDefinition> = (
	params: Static<D["params"]>,
	context: HostCallContext,
) => Static<D["result"]> | Promise<Static<D["result"]>>;

/** 合同定义表对应的实现表：每个定义都必须有实现，类型由 Schema 推导。 */
export type HostDomainImplementation<D extends Record<string, HostMethodDefinition>> = {
	readonly [K in keyof D]: HostMethodHandler<D[K]>;
};

interface RegisteredMethod {
	readonly definition: HostMethodDefinition;
	readonly handler: (params: unknown, context: HostCallContext) => unknown;
}

function failure(code: HostProtocolErrorCode, message: string): HostResponse {
	return { ok: false, error: { code, message } };
}

function firstSchemaError(definition: HostMethodDefinition["params"], value: unknown): string {
	const error = Value.Errors(definition, value).First();
	return error ? `${error.path || "/"}: ${error.message}` : "value does not match schema";
}

function asRequest(value: unknown): HostRequest | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	if (typeof record.method !== "string" || record.method.length === 0) return undefined;
	return { method: record.method, params: record.params };
}

/**
 * 进程无关的 Host 分发器：校验信封与参数 → 检查 owner → 执行 → 校验结果 → 返回信封。
 * 只依赖合同，不关心 transport；进程内直接调用与跨进程 IPC 共用这一个入口（ADR-0152）。
 */
export class HostDispatcher {
	readonly #methods = new Map<string, RegisteredMethod>();

	constructor(readonly owners: HostOwnerRegistry) {}

	register<D extends Record<string, HostMethodDefinition>>(
		definitions: D,
		implementation: HostDomainImplementation<D>,
	): void {
		for (const key of Object.keys(definitions) as (keyof D & string)[]) {
			const definition = definitions[key];
			if (this.#methods.has(definition.name)) throw new Error(`Host method already registered: ${definition.name}`);
			this.#methods.set(definition.name, {
				definition,
				handler: implementation[key] as RegisteredMethod["handler"],
			});
		}
	}

	methods(): string[] {
		return [...this.#methods.keys()].sort();
	}

	async handle(raw: unknown, options?: { readonly events?: HostEventSink }): Promise<HostResponse> {
		const request = asRequest(raw);
		if (!request)
			return failure(HOST_PROTOCOL_ERROR_CODES.INVALID_REQUEST, "Host request must be { method, params }");
		const registered = this.#methods.get(request.method);
		if (!registered) {
			return failure(HOST_PROTOCOL_ERROR_CODES.UNKNOWN_METHOD, `Unknown Host method: ${request.method}`);
		}
		const { definition, handler } = registered;
		if (!Value.Check(definition.params, request.params)) {
			return failure(
				HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS,
				`Invalid params for ${definition.name}: ${firstSchemaError(definition.params, request.params)}`,
			);
		}
		const missing = this.owners.missing(definition.requires ?? []);
		if (missing.length > 0) {
			return failure(
				HOST_PROTOCOL_ERROR_CODES.CAPABILITY_UNAVAILABLE,
				`Host capability is unavailable: ${missing.join(", ")}`,
			);
		}
		let result: unknown;
		try {
			result = await handler(request.params, { owners: this.owners, events: options?.events });
		} catch (error) {
			if (error instanceof HostProtocolError) return failure(error.code, error.message);
			return failure(HOST_PROTOCOL_ERROR_CODES.INTERNAL, error instanceof Error ? error.message : String(error));
		}
		if (!Value.Check(definition.result, result)) {
			return failure(
				HOST_PROTOCOL_ERROR_CODES.INVALID_RESULT,
				`Invalid result from ${definition.name}: ${firstSchemaError(definition.result, result)}`,
			);
		}
		return { ok: true, result };
	}
}

/** 进程内 transport：直接调用分发器。Phase 3 换成 MessagePort/stdio 时调用方不变。 */
export function createDirectHostTransport(dispatcher: HostDispatcher): HostTransport {
	return (request) => dispatcher.handle(request);
}
