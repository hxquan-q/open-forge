// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { i18n, initI18n } from "@shared/i18n";
import { activeSessionAtom, promptSuggestionsAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, expect, it } from "vitest";
import { useSuggestionBubblesModel } from "./useSuggestionBubblesModel";

const RUNTIME = "runtime-bubbles";

function setup() {
	const store = createStore();
	store.set(activeSessionAtom, { runtimeId: RUNTIME, cwd: "/repo", sessionPath: "/a.jsonl" });
	const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
	const hook = renderHook(() => useSuggestionBubblesModel(), { wrapper });
	return { store, hook };
}

beforeAll(async () => {
	await initI18n();
	await i18n.changeLanguage("zh");
});

it("气泡只含第二条起的预测，第一条已内联进输入框", () => {
	const { store, hook } = setup();
	act(() => store.set(promptSuggestionsAtom, { [RUNTIME]: ["第一条", "第二条", "第三条"] }));

	expect(hook.result.current.suggestions).toEqual(["第二条", "第三条"]);
});

it("只有一条预测时气泡为空，会话无预测时为空", () => {
	const { store, hook } = setup();
	act(() => store.set(promptSuggestionsAtom, { [RUNTIME]: ["第一条"] }));
	expect(hook.result.current.suggestions).toEqual([]);

	act(() => store.set(promptSuggestionsAtom, {}));
	expect(hook.result.current.suggestions).toEqual([]);
});
