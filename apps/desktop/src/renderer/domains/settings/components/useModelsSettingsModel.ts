// Modified by The Open Forge contributors.
import type { ModelsConfigData, ProviderTestResult } from "@preload/api.js";
import { localModelsConfigAtom, modelCatalog } from "@shared/store/model-catalog";
import { showToast } from "@shared/store/toast-atoms";
import type { TFunction } from "i18next";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { recordSettingsUsage } from "./recordSettingsUsage";

export type ProviderEntry = ModelsConfigData["providers"][string];
export type ModelEntry = NonNullable<ProviderEntry["models"]>[number];

export interface ProviderFormState {
	name: string;
	baseUrl: string;
	apiKey: string;
	api: string;
	headers: string;
	authHeader: boolean;
}

export interface ModelFormState {
	id: string;
	name: string;
	api: string;
	reasoning: boolean;
	reasoningLevels: string[];
	defaultReasoningLevel: string;
	input: string[];
	contextWindow: string;
	maxTokens: string;
}

export interface EditingModelState {
	provider: string;
	modelId: string;
}

/** 「从 /models 接口拉取」面板状态：某个 provider 拉到的模型 id 与勾选情况。 */
export interface FetchedModelsState {
	provider: string;
	models: string[];
	/** 将要添加的 id——只含尚未在 provider 里的项；已添加项在面板上禁用展示。 */
	selected: string[];
	error?: string;
}

export interface ModelsSettingsModel {
	config: ModelsConfigData | null;
	providerNames: string[];
	expandedProvider: string | null;
	addingProvider: boolean;
	providerForm: ProviderFormState;
	editingProvider: string | null;
	addingModelFor: string | null;
	editingModel: EditingModelState | null;
	modelForm: ModelFormState;
	saving: boolean;
	fetchingModelsFor: string | null;
	fetchedModels: FetchedModelsState | null;
	testingProvider: string | null;
	/** 每个 provider 最近一次「测试可用性」的结果，按 provider 名存留。 */
	providerTestResults: Record<string, ProviderTestResult>;
	setProviderForm: React.Dispatch<React.SetStateAction<ProviderFormState>>;
	setModelForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
	saveConfig: (newConfig: ModelsConfigData) => Promise<void>;
	onStartAddProvider: () => void;
	onCancelAddProvider: () => void;
	onAddProvider: () => Promise<void>;
	onStartEditProvider: (name: string) => void;
	onCancelEditProvider: () => void;
	onUpdateProvider: (oldName: string) => Promise<void>;
	onDeleteProvider: (name: string) => Promise<void>;
	onCopyProviderApiKey: (name: string) => Promise<void>;
	onToggleProvider: (name: string) => void;
	onStartAddModel: (providerName: string) => void;
	onCancelAddModel: () => void;
	onAddModel: (providerName: string) => Promise<void>;
	onStartEditModel: (providerName: string, modelId: string) => void;
	onCancelEditModel: () => void;
	onUpdateModel: (providerName: string, oldModelId: string) => Promise<void>;
	onDeleteModel: (providerName: string, modelId: string) => Promise<void>;
	onSetDefaultModel: (providerName: string, modelId: string) => Promise<void>;
	onFetchProviderModels: (providerName: string) => Promise<void>;
	onToggleFetchedModel: (modelId: string) => void;
	onSetAllFetchedSelected: (select: boolean) => void;
	onCancelFetchedModels: () => void;
	onApplyFetchedModels: (providerName: string) => Promise<void>;
	onTestProvider: (providerName: string) => Promise<void>;
}

export const API_OPTIONS = [
	"openai-completions",
	"openai-responses",
	"azure-openai-responses",
	"openai-codex-responses",
	"anthropic-messages",
	"bedrock-converse-stream",
	"google-generative-ai",
	"google-gemini-cli",
	"google-vertex",
	"nvidia-openai-responses",
	"qwen-openai-completions",
	"openai-completions-deepseek",
	"zai-openai-completions",
	"zhipu-openai-completions",
].map((api) => ({ value: api, label: api }));

/**
 * 模型级 API 类型下拉的选项：
 * - 空串表示「继承服务商」，是模型 api 未显式设置时的语义；
 * - `Api` 类型对自定义值开放，配置里可能出现内置列表之外的 api，
 *   保留当前值作为额外选项，避免打开表单就被下拉悄悄改写。
 */
export function buildModelApiOptions(currentApi: string, inheritLabel: string): { value: string; label: string }[] {
	const options = [{ value: "", label: inheritLabel }, ...API_OPTIONS];
	const current = currentApi.trim();
	if (current && !options.some((option) => option.value === current)) {
		options.push({ value: current, label: current });
	}
	return options;
}

export const INPUT_OPTIONS = [
	{ value: "text", label: "Text" },
	{ value: "image", label: "Image" },
];

export const CANDIDATE_REASONING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max", "none"];

export const emptyProvider: ProviderFormState = {
	name: "",
	baseUrl: "",
	apiKey: "",
	api: "openai-completions",
	headers: "",
	authHeader: false,
};

export const emptyModel: ModelFormState = {
	id: "",
	name: "",
	api: "",
	reasoning: false,
	reasoningLevels: [],
	defaultReasoningLevel: "",
	input: ["text"],
	contextWindow: "",
	maxTokens: "",
};

export function useModelsSettingsModel(): ModelsSettingsModel {
	const { t } = useTranslation("settings");
	// 与所有模型选择器共用同一份本地配置：这里保存后，已挂载的 popover 立刻同步。
	const config = useAtomValue(localModelsConfigAtom);
	const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
	const [addingProvider, setAddingProvider] = useState(false);
	const [providerForm, setProviderForm] = useState<ProviderFormState>({ ...emptyProvider });
	const [editingProvider, setEditingProvider] = useState<string | null>(null);
	const [addingModelFor, setAddingModelFor] = useState<string | null>(null);
	const [editingModel, setEditingModel] = useState<EditingModelState | null>(null);
	const [modelForm, setModelForm] = useState<ModelFormState>({ ...emptyModel });
	const [saving, setSaving] = useState(false);
	const [fetchingModelsFor, setFetchingModelsFor] = useState<string | null>(null);
	const [fetchedModels, setFetchedModels] = useState<FetchedModelsState | null>(null);
	const [testingProvider, setTestingProvider] = useState<string | null>(null);
	const [providerTestResults, setProviderTestResults] = useState<Record<string, ProviderTestResult>>({});

	useEffect(() => {
		void modelCatalog.revalidate({ sources: ["local"] });
	}, []);

	const saveConfig = useCallback(async (newConfig: ModelsConfigData) => {
		setSaving(true);
		try {
			await window.vetta.models.set(newConfig);
			// 刚写过盘，必须绕开 TTL 重新读回主进程规范化后的结果。
			await modelCatalog.revalidate({ force: true, sources: ["local"] });
		} finally {
			setSaving(false);
		}
	}, []);

	const providerFormToData = useCallback(() => {
		const headers = parseHeadersString(providerForm.headers);
		return {
			baseUrl: providerForm.baseUrl.trim() || undefined,
			apiKey: providerForm.apiKey.trim() || undefined,
			api: providerForm.api || undefined,
			headers,
			authHeader: providerForm.authHeader || undefined,
		};
	}, [providerForm]);

	const clearProviderTests = useCallback((...names: string[]) => {
		setProviderTestResults((prev) => {
			const next = { ...prev };
			for (const name of names) delete next[name];
			return next;
		});
	}, []);

	const handleAddProvider = useCallback(async () => {
		if (!config || !providerForm.name.trim()) return;
		const name = providerForm.name.trim();
		await saveConfig({
			...config,
			providers: {
				...config.providers,
				[name]: {
					...providerFormToData(),
					models: [],
				},
			},
		});
		setAddingProvider(false);
		setProviderForm({ ...emptyProvider });
		setExpandedProvider(name);
		recordSettingsUsage({ tab: "models", action: "added", target: "provider", value: providerForm.api });
	}, [config, providerForm.api, providerForm.name, providerFormToData, saveConfig]);

	const handleUpdateProvider = useCallback(
		async (oldName: string) => {
			if (!config || !providerForm.name.trim()) return;
			const newProviders = { ...config.providers };
			const existing = newProviders[oldName];
			if (!existing) return;

			const nextName = providerForm.name.trim();
			if (oldName !== nextName) {
				delete newProviders[oldName];
			}

			const providerData = providerFormToData();
			if (!providerData.apiKey && existing.apiKey) providerData.apiKey = existing.apiKey;
			newProviders[nextName] = {
				...existing,
				...providerData,
			};

			await saveConfig({ ...config, providers: newProviders });
			clearProviderTests(oldName, nextName);
			setEditingProvider(null);
			setProviderForm({ ...emptyProvider });
			if (oldName !== nextName) {
				setExpandedProvider(nextName);
			}
			recordSettingsUsage({ tab: "models", action: "updated", target: "provider", value: providerForm.api });
		},
		[clearProviderTests, config, providerForm.api, providerForm.name, providerFormToData, saveConfig],
	);

	const handleDeleteProvider = useCallback(
		async (name: string) => {
			if (!config) return;
			const newProviders = { ...config.providers };
			delete newProviders[name];
			const defaultModel = config.defaultModel?.startsWith(`${name}/`) ? undefined : config.defaultModel;
			await saveConfig({ ...config, defaultModel, providers: newProviders });
			clearProviderTests(name);
			if (expandedProvider === name) setExpandedProvider(null);
			recordSettingsUsage({ tab: "models", action: "deleted", target: "provider" });
		},
		[clearProviderTests, config, expandedProvider, saveConfig],
	);

	const startEditProvider = useCallback(
		(name: string) => {
			if (!config) return;
			const provider = config.providers[name];
			if (!provider) return;
			setProviderForm({
				name,
				baseUrl: provider.baseUrl || "",
				apiKey: "",
				api: provider.api || "openai-completions",
				headers: headersToString(provider.headers),
				authHeader: provider.authHeader ?? false,
			});
			setEditingProvider(name);
			setAddingProvider(false);
		},
		[config],
	);

	const handleCopyProviderApiKey = useCallback(
		async (name: string): Promise<void> => {
			try {
				const copied = await window.vetta.models.copyApiKey(name);
				showToast({
					variant: copied ? "success" : "error",
					message: t(copied ? "apiKeyCopied" : "apiKeyCopyFailed"),
				});
			} catch {
				showToast({ variant: "error", message: t("apiKeyCopyFailed") });
			}
		},
		[t],
	);

	const handleAddModel = useCallback(
		async (providerName: string) => {
			if (!config || !modelForm.id.trim()) return;
			const provider = config.providers[providerName];
			if (!provider) return;
			const models = [...(provider.models || []), formToModelDef(modelForm)];
			await saveConfig({
				...config,
				providers: {
					...config.providers,
					[providerName]: { ...provider, models },
				},
			});
			setAddingModelFor(null);
			setModelForm({ ...emptyModel });
			recordSettingsUsage({
				tab: "models",
				action: "added",
				target: "model",
				value: modelForm.api || "provider-default",
			});
		},
		[config, modelForm, saveConfig],
	);

	const handleUpdateModel = useCallback(
		async (providerName: string, oldModelId: string) => {
			if (!config || !modelForm.id.trim()) return;
			const provider = config.providers[providerName];
			if (!provider) return;
			const models = (provider.models || []).map((model) =>
				model.id === oldModelId ? formToModelDef(modelForm) : model,
			);
			const oldKey = `${providerName}/${oldModelId}`;
			const newKey = `${providerName}/${modelForm.id.trim()}`;
			await saveConfig({
				...config,
				defaultModel: config.defaultModel === oldKey ? newKey : config.defaultModel,
				providers: {
					...config.providers,
					[providerName]: { ...provider, models },
				},
			});
			setEditingModel(null);
			setModelForm({ ...emptyModel });
			recordSettingsUsage({
				tab: "models",
				action: "updated",
				target: "model",
				value: modelForm.api || "provider-default",
			});
		},
		[config, modelForm, saveConfig],
	);

	const handleDeleteModel = useCallback(
		async (providerName: string, modelId: string) => {
			if (!config) return;
			const provider = config.providers[providerName];
			if (!provider) return;
			const models = (provider.models || []).filter((model) => model.id !== modelId);
			const modelKey = `${providerName}/${modelId}`;
			await saveConfig({
				...config,
				defaultModel: config.defaultModel === modelKey ? undefined : config.defaultModel,
				providers: {
					...config.providers,
					[providerName]: { ...provider, models },
				},
			});
			recordSettingsUsage({ tab: "models", action: "deleted", target: "model" });
		},
		[config, saveConfig],
	);

	const handleSetDefaultModel = useCallback(
		async (providerName: string, modelId: string) => {
			if (!config) return;
			const modelKey = `${providerName}/${modelId}`;
			const newDefault = config.defaultModel === modelKey ? undefined : modelKey;
			await saveConfig({ ...config, defaultModel: newDefault });
			if (newDefault) {
				localStorage.setItem("vetta-selected-model", newDefault);
			}
			recordSettingsUsage({
				tab: "models",
				action: newDefault ? "selected" : "reset",
				target: "default-model",
			});
		},
		[config, saveConfig],
	);

	const startEditModel = useCallback(
		(providerName: string, modelId: string) => {
			if (!config) return;
			const provider = config.providers[providerName];
			if (!provider) return;
			const model = (provider.models || []).find((item) => item.id === modelId);
			if (!model) return;
			setModelForm(modelToForm(model));
			setEditingModel({ provider: providerName, modelId });
			setAddingModelFor(null);
		},
		[config],
	);

	const handleFetchProviderModels = useCallback(async (providerName: string) => {
		setFetchingModelsFor(providerName);
		try {
			const result = await window.vetta.models.fetchProviderModels(providerName);
			setFetchedModels({
				provider: providerName,
				models: result.models,
				// 默认不勾选：中转网关可能返回上百个模型，全选后逐个点掉成本很高，
				// 改为由用户挑要加的（面板提供全选/清空批量操作）。
				selected: [],
				error: result.error,
			});
		} finally {
			setFetchingModelsFor(null);
		}
	}, []);

	const setAllFetchedSelected = useCallback(
		(select: boolean) => {
			setFetchedModels((prev) => {
				if (!prev) return prev;
				if (!select) return { ...prev, selected: [] };
				const existing = new Set((config?.providers[prev.provider]?.models || []).map((item) => item.id));
				// 已添加的模型不可勾选：selected 的语义是「将要写入的 id」。
				return { ...prev, selected: prev.models.filter((id) => !existing.has(id)) };
			});
		},
		[config],
	);

	const handleTestProvider = useCallback(async (providerName: string) => {
		setTestingProvider(providerName);
		try {
			const result = await window.vetta.models.testProvider(providerName);
			setProviderTestResults((prev) => ({ ...prev, [providerName]: result }));
			recordSettingsUsage({ tab: "models", action: "tested", target: "provider" });
		} catch (err) {
			setProviderTestResults((prev) => ({
				...prev,
				[providerName]: { ok: false, error: "network", detail: err instanceof Error ? err.message : String(err) },
			}));
		} finally {
			setTestingProvider(null);
		}
	}, []);

	const handleApplyFetchedModels = useCallback(
		async (providerName: string) => {
			if (!config || !fetchedModels || fetchedModels.provider !== providerName) return;
			const provider = config.providers[providerName];
			if (!provider) return;
			const existing = new Set((provider.models || []).map((item) => item.id));
			const added = fetchedModels.selected.filter((id) => !existing.has(id)).map((id) => ({ id }));
			if (added.length === 0) {
				setFetchedModels(null);
				return;
			}
			await saveConfig({
				...config,
				providers: {
					...config.providers,
					[providerName]: { ...provider, models: [...(provider.models || []), ...added] },
				},
			});
			setFetchedModels(null);
			recordSettingsUsage({ tab: "models", action: "added", target: "model", value: "fetched" });
		},
		[config, fetchedModels, saveConfig],
	);

	const providerNames = useMemo(
		() =>
			config ? Object.keys(config.providers).filter((name) => config.providers[name]?.source !== "template") : [],
		[config],
	);

	return {
		config,
		providerNames,
		expandedProvider,
		addingProvider,
		providerForm,
		editingProvider,
		addingModelFor,
		editingModel,
		modelForm,
		saving,
		fetchingModelsFor,
		fetchedModels,
		testingProvider,
		providerTestResults,
		setProviderForm,
		setModelForm,
		saveConfig,
		onStartAddProvider: () => {
			setAddingProvider(true);
			setEditingProvider(null);
			setProviderForm({ ...emptyProvider });
		},
		onCancelAddProvider: () => {
			setAddingProvider(false);
			setProviderForm({ ...emptyProvider });
		},
		onAddProvider: handleAddProvider,
		onStartEditProvider: startEditProvider,
		onCancelEditProvider: () => {
			setEditingProvider(null);
			setProviderForm({ ...emptyProvider });
		},
		onUpdateProvider: handleUpdateProvider,
		onDeleteProvider: handleDeleteProvider,
		onCopyProviderApiKey: handleCopyProviderApiKey,
		onToggleProvider: (name: string) => setExpandedProvider(expandedProvider === name ? null : name),
		onStartAddModel: (providerName: string) => {
			setAddingModelFor(providerName);
			setEditingModel(null);
			setModelForm({ ...emptyModel });
		},
		onCancelAddModel: () => {
			setAddingModelFor(null);
			setModelForm({ ...emptyModel });
		},
		onAddModel: handleAddModel,
		onStartEditModel: startEditModel,
		onCancelEditModel: () => {
			setEditingModel(null);
			setModelForm({ ...emptyModel });
		},
		onUpdateModel: handleUpdateModel,
		onDeleteModel: handleDeleteModel,
		onSetDefaultModel: handleSetDefaultModel,
		onFetchProviderModels: handleFetchProviderModels,
		onToggleFetchedModel: (modelId: string) =>
			setFetchedModels((prev) =>
				prev
					? {
							...prev,
							selected: prev.selected.includes(modelId)
								? prev.selected.filter((id) => id !== modelId)
								: [...prev.selected, modelId],
						}
					: prev,
			),
		onSetAllFetchedSelected: setAllFetchedSelected,
		onCancelFetchedModels: () => setFetchedModels(null),
		onApplyFetchedModels: handleApplyFetchedModels,
		onTestProvider: handleTestProvider,
	};
}

export interface ProviderTestChip {
	/** 行内短标签：可用时给延迟，失败时给原因。 */
	label: string;
	/** 语义色：success=快（≤500ms），warn=慢（≤1000ms），error=很慢/失败（ccswitch 延迟分级）。 */
	tone: "success" | "warn" | "error";
	/** 悬停时的补充说明（模型数、HTTP 状态原文或底层错误）。 */
	title: string;
}

/** 把结构化测试结果折算成行内徽标文案；title 永远给出用户可读的结论。 */
export function providerTestChip(result: ProviderTestResult, t: TFunction<"settings">): ProviderTestChip {
	if (result.ok) {
		const latencyMs = result.latencyMs ?? 0;
		return {
			label: `${latencyMs}ms`,
			tone: latencyMs <= 500 ? "success" : latencyMs <= 1000 ? "warn" : "error",
			title:
				result.modelCount === undefined ? t("providerTestOk") : t("providerTestOkModels", { n: result.modelCount }),
		};
	}
	if (result.status !== undefined) {
		const label =
			result.status === 401 || result.status === 403
				? t("providerTestUnauthorized")
				: result.status === 404
					? t("providerTestNotFound")
					: t("providerTestHttpError", { status: result.status });
		return { label, tone: "error", title: result.detail ?? label };
	}
	const label =
		result.error === "missing-base-url"
			? t("fetchModelsNeedsBaseUrl")
			: result.error === "invalid-base-url"
				? t("providerTestInvalidBaseUrl")
				: result.error === "timeout"
					? t("providerTestTimeout")
					: result.error === "unknown-provider"
						? t("providerTestUnknownProvider")
						: t("providerTestNetwork");
	return { label, tone: "error", title: result.detail ?? label };
}

function parseHeadersString(value: string): Record<string, string> | undefined {
	const lines = value
		.trim()
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length === 0) return undefined;
	return Object.fromEntries(
		lines.map((line) => {
			const idx = line.indexOf(":");
			return idx > 0 ? [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] : [line, ""];
		}),
	);
}

function headersToString(headers?: Record<string, string>): string {
	if (!headers) return "";
	return Object.entries(headers)
		.map(([key, value]) => `${key}: ${value}`)
		.join("\n");
}

function modelToForm(model: ModelEntry): ModelFormState {
	return {
		id: model.id,
		name: model.name || "",
		api: model.api || "",
		reasoning: model.reasoning ?? false,
		reasoningLevels: model.reasoningLevels ?? [],
		defaultReasoningLevel: model.defaultReasoningLevel ?? "",
		input: model.input ?? ["text"],
		contextWindow: model.contextWindow != null ? String(model.contextWindow) : "",
		maxTokens: model.maxTokens != null ? String(model.maxTokens) : "",
	};
}

function formToModelDef(form: ModelFormState): ModelEntry {
	const model: ModelEntry = {
		id: form.id.trim(),
	};
	if (form.name.trim()) model.name = form.name.trim();
	if (form.api) model.api = form.api;
	if (form.reasoning) {
		model.reasoning = true;
		if (form.reasoningLevels.length > 0) {
			model.reasoningLevels = form.reasoningLevels;
			if (form.defaultReasoningLevel) model.defaultReasoningLevel = form.defaultReasoningLevel;
		}
	}
	if (form.input.length > 0) model.input = form.input;
	const contextWindow = Number(form.contextWindow.trim());
	if (contextWindow > 0) model.contextWindow = contextWindow;
	const maxTokens = Number(form.maxTokens.trim());
	if (maxTokens > 0) model.maxTokens = maxTokens;
	return model;
}
