// Copyright The Open Forge contributors.
import { beforeEach, describe, expect, it, vi } from "vitest";

const RUNTIME_STATE_KEY = "__vettaPluginHostBridgeRuntimeState_v2";

vi.mock("@shared/store/atoms", async () => {
	const { atom } = await import("jotai");
	return {
		activeSessionAtom: atom(null),
		chatMessagesAtom: atom([]),
		inputValueAtom: atom(""),
		isStreamingAtom: atom(false),
		languageAtom: atom("zh"),
		openSessionFnRef: { current: null },
		pluginConversationOverrideAtom: atom(null),
		promptAttachmentAtom: atom(null),
		selectedModelAtom: atom(null),
		sessionExecutionModeAtom: atom("workspace-write"),
	};
});

beforeEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
	delete (globalThis as unknown as Record<string, unknown>)[RUNTIME_STATE_KEY];
});

describe("plugin host bridge hook miss 诊断（BUG-0124）", () => {
	it("未命中时输出本地表规模与该插件下的已知键，并保持原纯文本回复", async () => {
		const hookRequestListeners: Array<(request: unknown) => void> = [];
		const respondAgentHook = vi.fn(async () => undefined);
		const plugins = {
			onAgentToolRequest: () => () => undefined,
			onAgentHookRequest: (listener: (request: unknown) => void) => {
				hookRequestListeners.push(listener);
				return () => undefined;
			},
			onAgentHandlerReleased: () => () => undefined,
			onAppActionRequest: () => () => undefined,
			onAppActionCancel: () => () => undefined,
			onContinuationRequest: () => () => undefined,
			onSystemPromptRequest: () => () => undefined,
			onMediaProviderRequest: () => () => undefined,
			onOcrProviderRequest: () => () => undefined,
			onOcrProviderCancel: () => () => undefined,
			respondAgentHook,
		};
		vi.stubGlobal("window", {
			vetta: { plugins, session: { subscribe: async () => () => undefined } },
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const bridge = await import("./plugin-host-bridge.js");
		bridge.installPluginHostBridge();
		// 同一插件下另有一个仍有效的处理器：未命中诊断应报出「该插件已知键」而非只看总表。
		bridge.registerPluginAgentHookHandler({
			pluginId: "demo",
			handlerId: "PreToolUse:known",
			activationId: "activation-1",
			handler: async () => undefined,
			api: {} as never,
		});

		hookRequestListeners[0]?.({
			requestId: "hook-1",
			pluginId: "demo",
			hookId: "fence",
			handlerId: "PreToolUse:stale",
			activationId: "activation-old",
			session: { id: "session-1", cwd: "C:/workspace", scenario: "project" },
			event: { eventName: "PreToolUse" },
		});

		await vi.waitFor(() => expect(respondAgentHook).toHaveBeenCalledTimes(1));
		// 回复载荷与文案保持原样（本轮只加诊断，不改行为）。
		expect(respondAgentHook).toHaveBeenCalledWith("hook-1", {
			error: "Plugin hook handler not found: demo/PreToolUse:stale",
		});
		expect(warn).toHaveBeenCalledWith(
			"[plugin-host-bridge] hook handler miss",
			expect.objectContaining({
				pluginId: "demo",
				hookId: "fence",
				handlerId: "PreToolUse:stale",
				activationId: "activation-old",
				handlerCount: 1,
				knownForPlugin: 1,
				knownKeyPrefixes: ["demo:PreToolUse:known"],
			}),
		);
	});
});
