// Copyright The Open Forge contributors.
import type { Static, TSchema } from "@sinclair/typebox";

/**
 * 一个 Host 方法的合同：名称 + 参数/结果 Schema + 所需 owner 插槽。
 * Schema 是跨进程边界的运行时校验事实源；类型由 Schema 推导，二者不分开维护。
 */
export interface HostMethodDefinition<
	P extends TSchema = TSchema,
	R extends TSchema = TSchema,
	N extends string = string,
> {
	readonly name: N;
	readonly params: P;
	readonly result: R;
	/** 执行前必须存在的 owner 插槽名；缺失时 Host 返回 CAPABILITY_UNAVAILABLE。 */
	readonly requires?: readonly string[];
}

/** 保留方法名的字面量类型，使 HostMethodSignatures 能按名称区分各方法签名。 */
export function defineHostMethod<P extends TSchema, R extends TSchema, const N extends string>(
	definition: HostMethodDefinition<P, R, N>,
): HostMethodDefinition<P, R, N> {
	return definition;
}

/** 方法名 → 参数/结果的纯类型映射，供不加载 typebox 的客户端（preload）使用。 */
export type HostMethodSignatures<D extends Record<string, HostMethodDefinition>> = {
	readonly [K in keyof D as D[K]["name"]]: {
		readonly params: Static<D[K]["params"]>;
		readonly result: Static<D[K]["result"]>;
	};
};

export interface HostMethodSignature {
	readonly params: unknown;
	readonly result: unknown;
}

export type HostMethodSignatureMap = { readonly [method: string]: HostMethodSignature };
