// Modified by The Open Forge contributors.
import type { Api, Model } from "@vetta/ai";
import { type RuntimeObservationPublisher, runtimeObservationFailure } from "@vetta/runtime-core";
import { CODING_AGENT_COMPACTION_PREFIRE_OBSERVATION } from "../../runtime-contracts/context-observability.js";
import type { CodingAgentContextRuntimeOptions } from "../../runtime-contracts/index.js";
import type { CodingAgentSessionEntry as SessionEntry } from "../../sessions/index.js";
import {
	type CompactionPreparation,
	type CompactionResult,
	type CompactionSettings,
	fingerprintCompactionPrefix,
	isPrefireCacheValid,
	type PrefireCache,
	prepareCompaction,
} from "../index.js";

export interface CompactionPrefireCacheOptions {
	readonly resolveApiKey: CodingAgentContextRuntimeOptions["resolveApiKey"];
	readonly generateCompaction: NonNullable<CodingAgentContextRuntimeOptions["generateCompaction"]>;
	readonly resolveCompactionModel?: CodingAgentContextRuntimeOptions["resolveCompactionModel"];
	readonly canAttempt: () => boolean;
	readonly observations?: RuntimeObservationPublisher;
}

interface PendingPrefire {
	readonly fingerprint: string;
	readonly firstKeptEntryId: string;
	readonly promise: Promise<void>;
}

export class CompactionPrefireCache {
	private cache: PrefireCache | undefined;
	private abortController: AbortController | undefined;
	private pending: PendingPrefire | undefined;
	private disposed = false;

	constructor(private readonly options: CompactionPrefireCacheOptions) {}

	start(
		entries: readonly SessionEntry[],
		settings: CompactionSettings,
		model: Model<Api>,
		credential?: { resolve(): Promise<string | undefined> | string | undefined },
	): void {
		if (this.abortController || this.disposed || !this.options.canAttempt()) return;
		// Appended history moves the proposed cut point without invalidating the cached prefix.
		// Keep the original summary and retain the new tail until automatic compaction consumes it.
		if (this.cache && isPrefireCacheValid(this.cache, entries)) return;
		this.cache = undefined;
		const preparation = prepareCompaction([...entries], settings);
		if (!preparation) return;
		const fingerprint = fingerprintCompactionPrefix([...entries], preparation.firstKeptEntryId);
		if (!fingerprint) return;

		const controller = new AbortController();
		this.abortController = controller;
		const pending: PendingPrefire = {
			fingerprint,
			firstKeptEntryId: preparation.firstKeptEntryId,
			promise: this.generate(preparation, fingerprint, model, credential, controller.signal),
		};
		this.pending = pending;
		void pending.promise.finally(() => {
			if (this.pending === pending) this.pending = undefined;
			if (this.abortController === controller) this.abortController = undefined;
		});
	}

	take(entries: readonly SessionEntry[]): CompactionResult | undefined {
		const cache = this.cache;
		if (!cache) return undefined;
		this.cache = undefined;
		return isPrefireCacheValid(cache, [...entries]) ? cache.result : undefined;
	}

	/**
	 * 压缩触发时收敛在途 prefire：指纹匹配则等待其结果并复用，避免同一前缀
	 * 并发跑第二次摘要（single-flight）。不匹配或已中止时立即返回，由调用方
	 * 走正常生成路径。
	 */
	async settle(entries: readonly SessionEntry[], signal: AbortSignal): Promise<CompactionResult | undefined> {
		const cached = this.take(entries);
		if (cached) return cached;
		const pending = this.pending;
		if (!pending || this.disposed || signal.aborted) return undefined;
		if (fingerprintCompactionPrefix([...entries], pending.firstKeptEntryId) !== pending.fingerprint) {
			return undefined;
		}
		await Promise.race([pending.promise, aborted(signal)]);
		return this.take(entries);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.abortController?.abort();
		this.abortController = undefined;
		this.pending = undefined;
		this.cache = undefined;
	}

	private async generate(
		preparation: CompactionPreparation,
		fingerprint: string,
		turnModel: Model<Api>,
		credential: { resolve(): Promise<string | undefined> | string | undefined } | undefined,
		signal: AbortSignal,
	): Promise<void> {
		try {
			const model = (await this.options.resolveCompactionModel?.(turnModel)) ?? turnModel;
			const apiKey =
				model === turnModel && credential ? await credential.resolve() : await this.options.resolveApiKey(model);
			if (!apiKey) return;
			const result = await this.options.generateCompaction(preparation, model, apiKey, undefined, signal);
			if (signal.aborted || this.disposed) return;
			this.cache = { fingerprint, result };
			this.options.observations?.record(CODING_AGENT_COMPACTION_PREFIRE_OBSERVATION, {
				phase: "cached",
				tokensBefore: result.tokensBefore,
			});
		} catch (error) {
			this.options.observations?.record(CODING_AGENT_COMPACTION_PREFIRE_OBSERVATION, {
				phase: signal.aborted ? "cancelled" : "failed",
				failure: runtimeObservationFailure(error, signal),
			});
			// Prefire is best-effort and does not affect the compaction circuit breaker.
		}
	}
}

function aborted(signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve();
			return;
		}
		signal.addEventListener("abort", () => resolve(), { once: true });
	});
}
