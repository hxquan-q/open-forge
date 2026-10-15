// Modified by The Open Forge contributors.
import type { Api, AssistantMessage, Model, UserMessage } from "@vetta/ai";
import { createRuntimeObservationPublisher, type RuntimeObservationRecord } from "@vetta/runtime-core";
import { describe, expect, it, vi } from "vitest";
import type { CompactionPreparation, CompactionResult, CompactionSettings } from "../../../src/compaction/index.js";
import { CompactionPrefireCache } from "../../../src/compaction/runtime/compaction-prefire-cache.js";
import { CODING_AGENT_COMPACTION_PREFIRE_OBSERVATION } from "../../../src/runtime-contracts/context-observability.js";
import type { CodingAgentSessionEntry as SessionEntry } from "../../../src/sessions/index.js";

describe("CompactionPrefireCache", () => {
	it("caches a completed prefire and consumes it once", async () => {
		const result: CompactionResult = {
			summary: "prefired",
			firstKeptEntryId: "entry-3",
			tokensBefore: 90,
		};
		const generateCompaction = vi.fn(async () => result);
		const cache = new CompactionPrefireCache({
			resolveApiKey: () => "key",
			generateCompaction,
			canAttempt: () => true,
		});

		cache.start(ENTRIES, SETTINGS, MODEL);
		await vi.waitFor(() => expect(generateCompaction).toHaveBeenCalledOnce());
		await vi.waitFor(() => expect(cache.take(ENTRIES)).toEqual(result));
		expect(cache.take(ENTRIES)).toBeUndefined();
	});

	it("keeps a completed summary across appended history instead of paying for a moving cut point", async () => {
		const records: RuntimeObservationRecord[] = [];
		const generateCompaction = vi.fn(
			async (preparation: CompactionPreparation): Promise<CompactionResult> => ({
				summary: "prefired once",
				firstKeptEntryId: preparation.firstKeptEntryId,
				tokensBefore: preparation.tokensBefore,
			}),
		);
		const cache = new CompactionPrefireCache({
			resolveApiKey: () => "key",
			generateCompaction,
			canAttempt: () => true,
			observations: createRuntimeObservationPublisher({
				port: {
					record: (record) => {
						records.push(record);
					},
				},
			}),
		});
		try {
			cache.start(ENTRIES, SETTINGS, MODEL);
			await vi.waitFor(() => expect(records).toHaveLength(1));
			const grown: readonly SessionEntry[] = [
				...ENTRIES,
				{
					type: "message",
					id: "entry-4",
					parentId: "entry-3",
					timestamp: new Date(4).toISOString(),
					message: userMessage("follow-up request", 4),
				},
			];

			cache.start(grown, SETTINGS, MODEL);
			const signal = new AbortController().signal;
			await expect(cache.settle(grown, signal)).resolves.toMatchObject({
				summary: "prefired once",
				firstKeptEntryId: "entry-3",
			});
			// No second result may arrive after the original cached summary is consumed.
			await expect(cache.settle(grown, signal)).resolves.toBeUndefined();
			expect(generateCompaction).toHaveBeenCalledOnce();
		} finally {
			cache.dispose();
		}
	});

	it("replaces a completed summary when a branch no longer contains its summarized prefix", async () => {
		const records: RuntimeObservationRecord[] = [];
		const generateCompaction = vi.fn(
			async (preparation: CompactionPreparation): Promise<CompactionResult> => ({
				summary: `summary-${preparation.firstKeptEntryId}`,
				firstKeptEntryId: preparation.firstKeptEntryId,
				tokensBefore: preparation.tokensBefore,
			}),
		);
		const cache = new CompactionPrefireCache({
			resolveApiKey: () => "key",
			generateCompaction,
			canAttempt: () => true,
			observations: createRuntimeObservationPublisher({
				port: {
					record: (record) => {
						records.push(record);
					},
				},
			}),
		});
		try {
			cache.start(ENTRIES, SETTINGS, MODEL);
			await vi.waitFor(() => expect(records).toHaveLength(1));
			const branched = ENTRIES.map((entry) => ({
				...entry,
				id: `branch-${entry.id}`,
				parentId: entry.parentId ? `branch-${entry.parentId}` : null,
			}));

			cache.start(branched, SETTINGS, MODEL);
			await expect(cache.settle(branched, new AbortController().signal)).resolves.toMatchObject({
				summary: "summary-branch-entry-3",
				firstKeptEntryId: "branch-entry-3",
			});
			expect(generateCompaction).toHaveBeenCalledTimes(2);
		} finally {
			cache.dispose();
		}
	});

	it("aborts an in-flight prefire when disposed", async () => {
		let observedSignal: AbortSignal | undefined;
		const generateCompaction = vi.fn(
			async (_preparation, _model, _apiKey, _instructions, signal): Promise<CompactionResult> => {
				observedSignal = signal;
				return new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), { once: true });
				});
			},
		);
		const cache = new CompactionPrefireCache({
			resolveApiKey: () => "key",
			generateCompaction,
			canAttempt: () => true,
		});

		cache.start(ENTRIES, SETTINGS, MODEL);
		await vi.waitFor(() => expect(observedSignal).toBeDefined());
		cache.dispose();

		expect(observedSignal?.aborted).toBe(true);
		expect(cache.take(ENTRIES)).toBeUndefined();
	});

	it("settle awaits an in-flight prefire with a matching fingerprint and reuses its result", async () => {
		const result: CompactionResult = {
			summary: "prefired",
			firstKeptEntryId: "entry-3",
			tokensBefore: 90,
		};
		let releaseGeneration: (() => void) | undefined;
		let notifyStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			notifyStarted = resolve;
		});
		const generateCompaction = vi.fn(
			(): Promise<CompactionResult> =>
				new Promise((resolve) => {
					notifyStarted?.();
					releaseGeneration = () => resolve(result);
				}),
		);
		const cache = new CompactionPrefireCache({
			resolveApiKey: () => "key",
			generateCompaction,
			canAttempt: () => true,
		});

		cache.start(ENTRIES, SETTINGS, MODEL);
		await started;
		const settled = cache.settle(ENTRIES, new AbortController().signal);
		releaseGeneration?.();

		await expect(settled).resolves.toEqual(result);
		expect(generateCompaction).toHaveBeenCalledOnce();
		expect(cache.take(ENTRIES)).toBeUndefined();
	});

	it("settle returns promptly when the caller aborts while a prefire is still running", async () => {
		let releaseGeneration: (() => void) | undefined;
		let notifyStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			notifyStarted = resolve;
		});
		const generateCompaction = vi.fn(
			(): Promise<CompactionResult> =>
				new Promise((resolve) => {
					notifyStarted?.();
					releaseGeneration = () => resolve({ summary: "late", firstKeptEntryId: "entry-3", tokensBefore: 90 });
				}),
		);
		const cache = new CompactionPrefireCache({
			resolveApiKey: () => "key",
			generateCompaction,
			canAttempt: () => true,
		});
		const controller = new AbortController();

		cache.start(ENTRIES, SETTINGS, MODEL);
		await started;
		const settled = cache.settle(ENTRIES, controller.signal);
		controller.abort();

		await expect(settled).resolves.toBeUndefined();
		releaseGeneration?.();
		await vi.waitFor(() => expect(cache.take(ENTRIES)).toBeDefined());
	});

	it("reports privacy-safe success and failure observations through the injected publisher", async () => {
		const records: RuntimeObservationRecord[] = [];
		const observations = createRuntimeObservationPublisher({
			port: {
				record: (record) => {
					records.push(record);
				},
			},
		});
		const cache = new CompactionPrefireCache({
			resolveApiKey: () => "key",
			generateCompaction: async () => {
				throw Object.assign(new Error("secret provider response"), { code: "RATE_LIMIT" });
			},
			canAttempt: () => true,
			observations,
		});

		cache.start(ENTRIES, SETTINGS, MODEL);
		await vi.waitFor(() => expect(records).toHaveLength(1));

		expect(records[0]).toMatchObject({
			token: CODING_AGENT_COMPACTION_PREFIRE_OBSERVATION,
			payload: {
				phase: "failed",
				failure: { category: "error", errorName: "Error", errorCode: "RATE_LIMIT" },
			},
		});
		expect(JSON.stringify(records[0])).not.toContain("secret provider response");
	});
});

const SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 20,
	minFreePercent: 20,
	keepRecentTokens: 1,
};

const ENTRIES: readonly SessionEntry[] = [
	{
		type: "message",
		id: "entry-1",
		parentId: null,
		timestamp: new Date(1).toISOString(),
		message: userMessage("old request".repeat(40), 1),
	},
	{
		type: "message",
		id: "entry-2",
		parentId: "entry-1",
		timestamp: new Date(2).toISOString(),
		message: assistantMessage("old response", 90, 2),
	},
	{
		type: "message",
		id: "entry-3",
		parentId: "entry-2",
		timestamp: new Date(3).toISOString(),
		message: userMessage("kept request", 3),
	},
];

function userMessage(text: string, timestamp: number): UserMessage {
	return { role: "user", content: text, timestamp };
}

function assistantMessage(text: string, totalTokens: number, timestamp: number): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-responses",
		provider: "test",
		model: "model",
		usage: {
			input: totalTokens,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp,
	};
}

const MODEL: Model<Api> = {
	id: "model",
	name: "Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100,
	maxTokens: 20,
};
