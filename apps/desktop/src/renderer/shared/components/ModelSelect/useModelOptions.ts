import type { ModelsConfigData } from "@preload/api";
import { localModelsConfigAtom, remoteProvidersAtom } from "@shared/store/atoms";
import { modelCatalog } from "@shared/store/model-catalog";
import { getDefaultStore, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { DESKTOP_BRAND } from "@/shared/desktop-brand";

export interface ModelOption {
	provider: string;
	modelId: string;
	displayName: string;
	/** "provider/modelId" */
	key: string;
	/** Whether this model comes from the remote server */
	remote?: boolean;
	/** Tags from server config */
	tags?: string[];
	/** Whether this model supports image input */
	supportsImage?: boolean;
	/** API type ("openai-completions" / "openai-responses" / ...), for reasoning preset fallback */
	api?: string;
	/** Whether the model is reasoning-capable */
	reasoning?: boolean;
	/** Configured reasoning levels; empty/undefined falls back to the api-type preset */
	reasoningLevels?: string[];
	/** Default reasoning level when the user has not chosen one */
	defaultReasoningLevel?: string;
	/** Per-model billing multipliers relative to the credit base (undefined for local BYOK) */
	multiplier?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

function flattenModels(config: ModelsConfigData, remote?: boolean): ModelOption[] {
	const result: ModelOption[] = [];
	for (const [provider, providerConfig] of Object.entries(config.providers)) {
		for (const model of providerConfig.models ?? []) {
			const raw = model as Record<string, unknown>;
			result.push({
				provider,
				modelId: model.id,
				displayName: model.name || model.id,
				key: `${provider}/${model.id}`,
				remote,
				tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : undefined,
				supportsImage: model.input?.includes("image") ?? false,
				api: model.api ?? providerConfig.api,
				reasoning: model.reasoning,
				reasoningLevels: model.reasoningLevels,
				defaultReasoningLevel: model.defaultReasoningLevel,
				multiplier: (raw.multiplier as ModelOption["multiplier"]) ?? undefined,
			});
		}
	}
	return result;
}

/**
 * 本地 models.json 与远程 provider 目录的合并口径唯一真源(local 覆盖 remote 同 key)。
 * 模型选择器与发送前置闸门({@link hasAvailableModel})共用,避免「选择器为空」与
 * 「闸门命中」出现两套判断。
 */
function mergeModelOptions(config: ModelsConfigData | null, remoteProviders: Record<string, unknown>): ModelOption[] {
	const localModels = config ? flattenModels(config) : [];
	const remoteModels =
		Object.keys(remoteProviders).length > 0
			? flattenModels({ providers: remoteProviders as ModelsConfigData["providers"] }, true)
			: [];
	const localKeys = new Set(localModels.map((m) => m.key));
	return [...localModels, ...remoteModels.filter((m) => !localKeys.has(m.key))];
}

export interface UseModelOptionsResult {
	/** Merged local + remote options (local wins on duplicate key) */
	options: ModelOption[];
	/** Options grouped by provider, in insertion order */
	grouped: Map<string, ModelOption[]>;
	/** Configured default model key, if any */
	defaultKey: string | undefined;
	/** Resolve a provider's icon symbol (local config / remote provider) */
	iconFor: (provider: string) => string | undefined;
	/** Resolve a provider's display label for group headers */
	labelFor: (provider: string) => string;
}

/**
 * Shared loader for the model picker: reads local models.json + remote provider
 * catalog, merges them (local overrides remote on duplicate key) and exposes
 * grouping + provider label/icon helpers. Used by every model selector so the
 * option list and provider metadata stay consistent across the app.
 *
 * 两份数据都来自 modelCatalog 的共享 atom：目录变化（服务端增删模型、设置页
 * 保存本地 provider）会立刻反映到所有已挂载的选择器上，无需重启应用。
 */
export function useModelOptions(): UseModelOptionsResult {
	const remoteProviders = useAtomValue(remoteProvidersAtom);
	const config = useAtomValue(localModelsConfigAtom);

	// 挂载即校验一次；TTL 内命中缓存不会真的打接口，所以多个选择器同时挂载也只有一次请求。
	useEffect(() => {
		void modelCatalog.revalidate();
	}, []);

	const options = useMemo(() => mergeModelOptions(config, remoteProviders), [config, remoteProviders]);

	const grouped = useMemo(() => {
		const groups = new Map<string, ModelOption[]>();
		for (const m of options) {
			const list = groups.get(m.provider) ?? [];
			list.push(m);
			groups.set(m.provider, list);
		}
		return groups;
	}, [options]);

	const iconFor = (provider: string): string | undefined => {
		const local = config?.providers[provider] as { icon?: string } | undefined;
		const remote = (remoteProviders as Record<string, { icon?: string }>)[provider];
		return local?.icon ?? remote?.icon;
	};

	const labelFor = (provider: string): string => {
		const local = config?.providers[provider] as { displayName?: string } | undefined;
		const remote = (remoteProviders as Record<string, { displayName?: string }>)[provider];
		if (local?.displayName) return local.displayName;
		if (remote?.displayName) return remote.displayName;
		if (provider === "vetta-go") return `${DESKTOP_BRAND.displayName} Go`;
		return provider;
	};

	return { options, grouped, defaultKey: config?.defaultModel, iconFor, labelFor };
}

/**
 * 发送前置闸门的真值:当前是否有用户可见的可用模型。
 *
 * 与模型选择器同源——共用 {@link mergeModelOptions} 的合并口径,保证「选择器为空 ⇔ 闸门命中」。
 * 目录尚未加载(本地 models.json 未到且无远程目录)时不判定,视为可用:启动瞬间的未知态
 * 不应误报「没有配置模型」。可在非 React 环境(发送 hook 内)直接调用。
 */
export function hasAvailableModel(store = getDefaultStore()): boolean {
	const config = store.get(localModelsConfigAtom);
	const remote = store.get(remoteProvidersAtom);
	if (config === null && Object.keys(remote).length === 0) return true;
	return mergeModelOptions(config, remote).length > 0;
}
