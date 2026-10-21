// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import type { ModelsConfigData } from "@preload/api";
import {
	activeSessionAtom,
	chatMessagesAtom,
	inputValueAtom,
	localModelsConfigAtom,
	missingModelDialogOpenAtom,
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
});
