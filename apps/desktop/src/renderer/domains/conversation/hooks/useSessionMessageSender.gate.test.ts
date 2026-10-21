// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import type { ModelsConfigData } from "@preload/api";
import {
	activeSessionAtom,
	chatMessagesAtom,
	inputValueAtom,
	localModelsConfigAtom,
	missingModelDialogOpenAtom,
	promptAttachmentAtom,
} from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionMessageSender } from "./useSessionMessageSender";

const prompt = vi.fn(async () => ({ status: "completed" as const }));

vi.mock("@domains/project/hooks/useProjects", () => ({
	useProjectActions: () => ({
		applyLocalRename: vi.fn(),
		ensureLocalSession: vi.fn(),
		loadSessions: vi.fn(async () => undefined),
	}),
}));

vi.mock("@domains/plugins/runtime/plugin-events", () => ({
	waitForPluginHostReady: async () => undefined,
	waitForPluginHostFirstReady: async () => undefined,
}));

vi.mock("@shared/i18n", () => ({
	i18n: { t: (key: string) => key },
}));

vi.mock("@shared/lib/app-monitor-events", () => ({
	BUILTIN_KNOWLEDGE_RETRIEVAL_ACTION_ID: "builtin:knowledge-retrieval",
	recordInputActionsUsed: vi.fn(),
	recordInputContextUsed: vi.fn(),
}));

const store = getDefaultStore();

function modelsConfig(providers: ModelsConfigData["providers"]): ModelsConfigData {
	return { providers };
}

describe("useSessionMessageSender 发送前置闸门", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		store.set(missingModelDialogOpenAtom, false);
		store.set(localModelsConfigAtom, null);
		store.set(activeSessionAtom, { cwd: "/workspace", runtimeId: "runtime-1", sessionPath: "/w/s.jsonl" });
		store.set(inputValueAtom, "你好");
		store.set(chatMessagesAtom, []);
		store.set(promptAttachmentAtom, null);
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: { session: { prompt } },
		});
	});

	it("无可用模型:不派发 prompt、无会话副作用,弹引导对话框且输入原样保留", async () => {
		store.set(localModelsConfigAtom, modelsConfig({}));
		const { result } = renderHook(() => useSessionMessageSender({ bumpSuggestionToken: vi.fn() }));

		await act(async () => {
			await result.current.sendMessage();
		});

		expect(prompt).not.toHaveBeenCalled();
		expect(store.get(missingModelDialogOpenAtom)).toBe(true);
		expect(store.get(inputValueAtom)).toBe("你好");
		expect(store.get(chatMessagesAtom)).toEqual([]);
	});

	it("有可用模型:照常派发 prompt(零回归)", async () => {
		store.set(localModelsConfigAtom, modelsConfig({ openai: { models: [{ id: "gpt-5" }] } }));
		const { result } = renderHook(() => useSessionMessageSender({ bumpSuggestionToken: vi.fn() }));

		await act(async () => {
			await result.current.sendMessage();
		});

		expect(prompt).toHaveBeenCalledOnce();
		expect(store.get(missingModelDialogOpenAtom)).toBe(false);
	});

	it("元素选区另起一条消息：带上截图路径和元素附件，并保留输入框里已有的草稿", async () => {
		store.set(localModelsConfigAtom, modelsConfig({ openai: { models: [{ id: "gpt-5" }] } }));
		store.set(inputValueAtom, "先别发这段");
		store.set(promptAttachmentAtom, {
			id: "vetta.browser.element-selection",
			ownerPluginId: "vetta.browser",
			label: "element",
			lifecycle: "once",
			context: {
				schema: "vetta.browser.element-selection",
				version: 1,
				payload: { pageUrl: "http://127.0.0.1:5173/", domPath: "button#save" },
			},
		});
		const { result } = renderHook(() => useSessionMessageSender({ bumpSuggestionToken: vi.fn() }));

		await act(async () => {
			await result.current.sendMessage(undefined, {
				composed: {
					text: "把按钮改成蓝色",
					imagePaths: ["C:/cache/el.png"],
					preserveDraft: true,
				},
			});
		});

		expect(prompt).toHaveBeenCalledOnce();
		const calls = prompt.mock.calls as unknown as Array<
			[
				string,
				{
					text?: string;
					metadata?: { pluginPromptContexts?: Array<{ schema?: string }> };
					attachments?: Array<{ path?: string }>;
				},
			]
		>;
		const request = calls[0]?.[1];
		expect(request?.text).toBe("把按钮改成蓝色");
		expect(request.metadata?.pluginPromptContexts?.[0]?.schema).toBe("vetta.browser.element-selection");
		expect(request.attachments).toEqual(
			expect.arrayContaining([expect.objectContaining({ path: "C:/cache/el.png" })]),
		);
		expect(store.get(inputValueAtom)).toBe("先别发这段");
		expect(store.get(promptAttachmentAtom)).toBeNull();
	});
});
