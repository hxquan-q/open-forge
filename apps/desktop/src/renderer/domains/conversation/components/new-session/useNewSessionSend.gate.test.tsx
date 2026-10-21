// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import type { ModelsConfigData } from "@preload/api";
import { createConversationUserMessage } from "@shared/conversation";
import type { OpenSessionOptions, SessionExecutionMode, StagedSendInput } from "@shared/store/atoms";
import { localModelsConfigAtom, missingModelDialogOpenAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNewSessionSend } from "./useNewSessionSend";

const perf = vi.hoisted(() => ({
	begin: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
	mark: vi.fn(),
}));

const stagedSend = vi.hoisted(() => ({
	restore: vi.fn(),
	stage: vi.fn<(overrideText?: string, interactionId?: string) => StagedSendInput | null>(),
}));

vi.mock("@shared/lib/perf-send", () => ({
	perfSendBegin: perf.begin,
	perfSendMark: perf.mark,
}));

vi.mock("../../services/staged-new-session-send", () => ({
	restoreStagedNewSessionSend: stagedSend.restore,
	stageNewSessionSend: stagedSend.stage,
}));

const store = getDefaultStore();

function modelsConfig(providers: ModelsConfigData["providers"]): ModelsConfigData {
	return { providers };
}

function stagedInput(): StagedSendInput {
	return {
		draftKey: "new:C:/workspace",
		rawText: "hello",
		inputSegments: [{ kind: "text", text: "hello" }],
		hasOverride: false,
		attachedImages: [],
		mentionedFiles: [],
		appshot: null,
		selectedModel: null,
		optimisticMessage: createConversationUserMessage({ id: "user-staged", text: "hello" }),
	};
}

describe("useNewSessionSend 发送前置闸门", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		store.set(missingModelDialogOpenAtom, false);
		store.set(localModelsConfigAtom, null);
		stagedSend.stage.mockReturnValue(stagedInput());
	});

	it("无可用模型:不派发(不开会话、不暂存),弹引导对话框", async () => {
		store.set(localModelsConfigAtom, modelsConfig({}));
		const openSession = vi.fn(
			async (_cwd: string, _path?: string, _mode?: SessionExecutionMode, _options?: OpenSessionOptions) => {},
		);
		const sendMessage = vi.fn(async () => ({ status: "sent" as const }));
		const { result } = renderHook(() =>
			useNewSessionSend({ cwd: "C:/workspace", executionMode: "sandbox", openSession, sendMessage }),
		);

		await act(async () => {
			await result.current.send("你好");
		});

		expect(openSession).not.toHaveBeenCalled();
		expect(stagedSend.stage).not.toHaveBeenCalled();
		expect(sendMessage).not.toHaveBeenCalled();
		expect(store.get(missingModelDialogOpenAtom)).toBe(true);
	});

	it("有可用模型:发送链照常(零回归),不弹对话框", async () => {
		store.set(localModelsConfigAtom, modelsConfig({ openai: { models: [{ id: "gpt-5" }] } }));
		const openSession = vi.fn(
			(_cwd: string, _path?: string, _mode?: SessionExecutionMode, options?: OpenSessionOptions) => {
				options?.onPromptReady?.();
				return Promise.resolve();
			},
		);
		const sendMessage = vi.fn(async () => ({ status: "sent" as const }));
		const { result } = renderHook(() =>
			useNewSessionSend({ cwd: "C:/workspace", executionMode: "sandbox", openSession, sendMessage }),
		);

		await act(async () => {
			await result.current.send("你好");
		});

		expect(openSession).toHaveBeenCalledOnce();
		expect(sendMessage).toHaveBeenCalledOnce();
		expect(store.get(missingModelDialogOpenAtom)).toBe(false);
	});
});
