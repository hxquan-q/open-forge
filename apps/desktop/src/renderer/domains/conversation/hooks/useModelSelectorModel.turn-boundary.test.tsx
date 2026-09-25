// @vitest-environment jsdom

import { i18n, initI18n } from "@shared/i18n";
import {
	SELECTED_MODEL_STORAGE_KEY,
	activeSessionAtom,
	activeSessionStreamingAtom,
	selectedModelAtom,
} from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enCommon from "@/shared/i18n/locales/en/common.json";
import zhCommon from "@/shared/i18n/locales/zh/common.json";
import { installVettaBridge } from "@/test/vetta-bridge";
import { useModelSelectorModel } from "./useModelSelectorModel";

vi.mock("@shared/store/model-catalog", () => ({
	modelCatalog: { revalidate: vi.fn(async () => undefined) },
}));

vi.mock("@shared/components/ModelSelect/useModelOptions", () => {
	const option = (provider: string, modelId: string) => ({
		provider,
		modelId,
		displayName: modelId,
		key: `${provider}/${modelId}`,
	});
	const options = [option("cli-proxy-api.google", "gemini-3.8-flash-high"), option("cli-proxy-api.responses", "gpt-5.5")];
	return {
		useModelOptions: () => ({
			options,
			grouped: new Map([["cli-proxy-api.google", options]]),
			defaultKey: undefined,
			iconFor: () => undefined,
			labelFor: (provider: string) => provider,
		}),
	};
});

const RUNTIME_ID = "session-1";
const CURRENT_MODEL = "cli-proxy-api.google/gemini-3.8-flash-high";
const NEXT_MODEL = "cli-proxy-api.responses/gpt-5.5";

function stubSessionBridge(): ReturnType<typeof vi.fn> {
	const updateSettings = vi.fn(async () => undefined);
	installVettaBridge({ session: { updateSettings } });
	return updateSettings;
}

/**
 * 活动 Turn 的夹具：`activeSessionStreamingAtom` 由 `useSessionManager` 在收到
 * agent_start/agent_end 时写入，`isStreamingAtom` 直接读它，所以测试用同一个
 * 可控信号构造「回合进行中」，不需要真的跑一条流。
 */
function renderSelector({ streaming, updateActiveSession = true }: { streaming: boolean; updateActiveSession?: boolean }) {
	const store = createStore();
	store.set(activeSessionAtom, { cwd: "C:/workspace", runtimeId: RUNTIME_ID, sessionPath: "C:/workspace/session.jsonl" });
	store.set(activeSessionStreamingAtom, streaming);
	store.set(selectedModelAtom, CURRENT_MODEL);
	const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
	const { result } = renderHook(() => useModelSelectorModel({ updateActiveSession }), { wrapper });
	return { store, result };
}

beforeEach(async () => {
	localStorage.clear();
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("模型选择的生效边界文案", () => {
	it("中英两套 catalog 都给出作用域说明与锁定说明", () => {
		expect(zhCommon.modelSelect.turnScopeHint).toBe("仅影响后续回合");
		expect(enCommon.modelSelect.turnScopeHint).toBe("Applies to later turns only");
		expect(zhCommon.modelSelect.disabledDuringTurn).toContain("当前回合");
		expect(enCommon.modelSelect.disabledDuringTurn).toContain("current turn");
	});
});

describe("活动 Turn 期间的模型选择", () => {
	it("回合进行中选中另一个模型：不写会话设置，也不改新会话偏好", () => {
		const updateSettings = stubSessionBridge();
		localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, CURRENT_MODEL);
		const { store, result } = renderSelector({ streaming: true });

		act(() => result.current.viewProps.onModelSelect(NEXT_MODEL));

		expect(updateSettings).not.toHaveBeenCalled();
		expect(store.get(selectedModelAtom)).toBe(CURRENT_MODEL);
		expect(localStorage.getItem(SELECTED_MODEL_STORAGE_KEY)).toBe(CURRENT_MODEL);
		// 阻止写入不能是静默 no-op：选择器同时要置为禁用态。
		expect(result.current.viewProps.disabled).toBe(true);
	});

	it("回合结束后按既定语义写入活动会话，并记住为新会话偏好", () => {
		const updateSettings = stubSessionBridge();
		const { store, result } = renderSelector({ streaming: false });

		expect(result.current.viewProps.disabled).toBe(false);

		act(() => result.current.viewProps.onModelSelect(NEXT_MODEL));

		expect(updateSettings).toHaveBeenCalledWith(RUNTIME_ID, { modelKey: NEXT_MODEL });
		expect(store.get(selectedModelAtom)).toBe(NEXT_MODEL);
		expect(localStorage.getItem(SELECTED_MODEL_STORAGE_KEY)).toBe(NEXT_MODEL);
	});

	it("团队输入框的 scope 路径不受活动 Turn 锁定影响", () => {
		const updateSettings = stubSessionBridge();
		const onModelSelect = vi.fn();
		const store = createStore();
		store.set(activeSessionAtom, { cwd: "C:/workspace", runtimeId: RUNTIME_ID, sessionPath: "C:/workspace/session.jsonl" });
		store.set(activeSessionStreamingAtom, true);
		const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(
			() => useModelSelectorModel({ updateActiveSession: false, scope: { modelKey: CURRENT_MODEL, onModelSelect, onReasoningSelect: vi.fn() } }),
			{ wrapper },
		);

		expect(result.current.viewProps.disabled).toBe(false);

		act(() => result.current.viewProps.onModelSelect(NEXT_MODEL));

		expect(onModelSelect).toHaveBeenCalledWith(NEXT_MODEL, undefined);
		expect(updateSettings).not.toHaveBeenCalled();
	});

	it("锁定说明与作用域说明都取自 i18n catalog，不是硬编码", () => {
		stubSessionBridge();
		const { result } = renderSelector({ streaming: true });

		// 先证明两处都真的取到了串，否则 undefined === undefined 会假绿。
		expect(zhCommon.modelSelect.turnScopeHint).toBeTruthy();
		expect(zhCommon.modelSelect.disabledDuringTurn).toBeTruthy();
		expect(result.current.viewProps.labels.turnScopeHint).toBe(zhCommon.modelSelect.turnScopeHint);
		expect(result.current.viewProps.labels.disabledReason).toBe(zhCommon.modelSelect.disabledDuringTurn);
	});
});
