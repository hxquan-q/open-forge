// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import type { ModelsConfigData } from "@preload/api";
import { localModelsConfigAtom, remoteProvidersAtom } from "@shared/store/atoms";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it } from "vitest";
import { hasAvailableModel } from "./useModelOptions";

const store = getDefaultStore();

function modelsConfig(providers: ModelsConfigData["providers"]): ModelsConfigData {
	return { providers };
}

describe("hasAvailableModel(发送闸门真值,与模型选择器同源)", () => {
	beforeEach(() => {
		store.set(localModelsConfigAtom, null);
		store.set(remoteProvidersAtom, {});
	});

	it("目录尚未加载(本地 null 且无远程):视为可用,启动瞬间不误报", () => {
		expect(hasAvailableModel(store)).toBe(true);
	});

	it("目录已加载但没有任何服务商:无可用模型(闸门命中)", () => {
		store.set(localModelsConfigAtom, modelsConfig({}));
		expect(hasAvailableModel(store)).toBe(false);
	});

	it("本地服务商带模型:可用", () => {
		store.set(localModelsConfigAtom, modelsConfig({ openai: { models: [{ id: "gpt-5" }] } }));
		expect(hasAvailableModel(store)).toBe(true);
	});

	it("仅远程目录带模型:可用(与选择器同一合并口径)", () => {
		store.set(localModelsConfigAtom, modelsConfig({}));
		store.set(remoteProvidersAtom, { "vetta-go": { models: [{ id: "gpt-5" }] } });
		expect(hasAvailableModel(store)).toBe(true);
	});
});
