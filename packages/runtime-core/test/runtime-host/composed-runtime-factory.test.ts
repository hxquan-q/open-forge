// Modified by The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import type { ConversationDocumentStore } from "../../src/conversation/index.js";
import { RUNTIME_ERROR_CODES } from "../../src/errors.js";
import type {
	ConversationRepository,
	EventSink,
	KernelEvent,
	RuntimeSnapshotProvider,
} from "../../src/kernel/index.js";
import { ComposedRuntimeFactory, type RuntimeResources } from "../../src/runtime-host/composed-runtime-factory.js";
import type { RuntimePromptAdapter } from "../../src/runtime-host/kernel-runtime-session-backend.js";
import type { RuntimeModelRuntime } from "../../src/runtime-host/runtime-model.js";

describe("ComposedRuntimeFactory initialization", () => {
	it("closes an acquired Kernel session before resources and can initialize again", async () => {
		const initializationError = new Error("peripheral initialization failed");
		const order: string[] = [];
		let attempts = 0;
		const disposeResources = vi.fn(async () => {
			order.push("resources");
		});
		const factory = new ComposedRuntimeFactory<Record<string, never>>({
			createResources: async () => ({
				sessionId: "factory-session",
				repository: { create: vi.fn(async () => undefined) } as unknown as ConversationRepository,
				conversationDocumentStore: {} as ConversationDocumentStore,
				promptAdapter: {} as RuntimePromptAdapter,
				snapshotProvider: {} as RuntimeSnapshotProvider,
				modelRuntime: {} as RuntimeModelRuntime,
				identity: { cwd: "C:/workspace" },
				stateSource: { read: () => ({ contextPercent: 0, contextWindow: 8_000, activeToolNames: [] }) },
				createSessionPeripherals: (session) => {
					attempts += 1;
					vi.spyOn(session, "close").mockImplementation(async () => {
						order.push("session");
					});
					if (attempts === 1) throw initializationError;
					return {};
				},
				dispose: disposeResources,
			}),
		});
		const eventSink: EventSink = { publish: vi.fn(async () => undefined) };

		await expect(factory.create({}, eventSink)).rejects.toBe(initializationError);
		expect(order).toEqual(["session", "resources"]);

		const assembly = await factory.create({}, eventSink);
		await assembly.session.close();
		await assembly.dispose?.();
		expect(attempts).toBe(2);
		expect(disposeResources).toHaveBeenCalledTimes(2);
	});

	it("rolls back when final assembly projection fails before publication", async () => {
		const publicationError = new Error("assembly projection failed");
		const order: string[] = [];
		const factory = new ComposedRuntimeFactory<Record<string, never>>({
			createResources: async () => ({
				sessionId: "factory-publication-session",
				repository: { create: vi.fn(async () => undefined) } as unknown as ConversationRepository,
				conversationDocumentStore: {} as ConversationDocumentStore,
				promptAdapter: {} as RuntimePromptAdapter,
				snapshotProvider: {} as RuntimeSnapshotProvider,
				modelRuntime: {} as RuntimeModelRuntime,
				identity: { cwd: "C:/workspace" },
				stateSource: { read: () => ({ contextPercent: 0, contextWindow: 8_000, activeToolNames: [] }) },
				createSessionPeripherals: (session) => {
					vi.spyOn(session, "close").mockImplementation(async () => {
						order.push("session");
					});
					return {};
				},
				get toolController(): RuntimeResources["toolController"] {
					throw publicationError;
				},
				dispose: async () => {
					order.push("resources");
				},
			}),
		});

		await expect(factory.create({}, { publish: vi.fn(async () => undefined) })).rejects.toBe(publicationError);
		expect(order).toEqual(["session", "resources"]);
	});
});

describe("ComposedRuntimeFactory cancel deadline wiring", () => {
	it("把取消宽限到期投影为 error + agent_end 观察事件", async () => {
		const published: KernelEvent[] = [];
		const eventSink: EventSink = {
			publish: async (event) => {
				published.push(event);
			},
		};
		const factory = new ComposedRuntimeFactory<Record<string, never>>({
			cancelDeadlineMs: 20,
			createResources: async () => ({
				sessionId: "deadline-session",
				repository: { create: vi.fn(async () => undefined) } as unknown as ConversationRepository,
				conversationDocumentStore: {} as ConversationDocumentStore,
				promptAdapter: {} as RuntimePromptAdapter,
				// Snapshot acquire 永不结算：模拟不响应 AbortSignal 的底层工作。
				snapshotProvider: {
					acquire: () => new Promise(() => {}),
				} as unknown as RuntimeSnapshotProvider,
				modelRuntime: {} as RuntimeModelRuntime,
				identity: { cwd: "C:/workspace" },
				stateSource: { read: () => ({ contextPercent: 0, contextWindow: 8_000, activeToolNames: [] }) },
			}),
		});

		const assembly = await factory.create({}, eventSink);
		void assembly.session.send({
			message: { role: "user", content: "hi", timestamp: 1 },
		});
		await vi.waitFor(() => expect(assembly.session.state).toBe("running"));

		await assembly.session.cancel("user stopped");

		expect(assembly.session.state).toBe("recovery_required");
		const observations = published
			.filter((event) => event.type === "session.observation")
			.map((event) => (event.type === "session.observation" ? event.observation : undefined));
		expect(observations).toContainEqual(
			expect.objectContaining({
				type: "error",
				error: expect.objectContaining({ code: RUNTIME_ERROR_CODES.SESSION_CANCEL_DEADLINE_EXCEEDED }),
			}),
		);
		expect(observations).toContainEqual(expect.objectContaining({ type: "lifecycle", phase: "agent_end" }));

		await assembly.session.close();
		await assembly.dispose?.();
	});
});
