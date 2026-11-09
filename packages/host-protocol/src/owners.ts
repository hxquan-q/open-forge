// Copyright The Open Forge contributors.
import { HOST_PROTOCOL_ERROR_CODES, HostProtocolError } from "./errors.js";

/**
 * Owner 插槽：宿主专属能力（BrowserOwner、SandboxOwner、FileIndexOwner…）以接口注入 Host。
 * 同一 Host 跑在远端或 headless 时缺少的 owner 会明确报 CAPABILITY_UNAVAILABLE，
 * 不隐式回退到本机实现。插槽名与接口由各领域合同定义，本注册表只管存在性。
 */
export class HostOwnerRegistry {
	readonly #owners = new Map<string, unknown>();

	provide<T>(slot: string, owner: T): () => void {
		if (this.#owners.has(slot)) throw new Error(`Host owner slot already provided: ${slot}`);
		this.#owners.set(slot, owner);
		return () => {
			if (this.#owners.get(slot) === owner) this.#owners.delete(slot);
		};
	}

	has(slot: string): boolean {
		return this.#owners.has(slot);
	}

	/** 取 owner；调用方负责以领域接口类型声明 T。缺失时抛合同错误。 */
	require<T>(slot: string): T {
		if (!this.#owners.has(slot)) {
			throw new HostProtocolError(
				HOST_PROTOCOL_ERROR_CODES.CAPABILITY_UNAVAILABLE,
				`Host capability is unavailable: ${slot}`,
			);
		}
		return this.#owners.get(slot) as T;
	}

	missing(slots: readonly string[]): string[] {
		return slots.filter((slot) => !this.#owners.has(slot));
	}
}
