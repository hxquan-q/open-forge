import "./providers/register-builtins.js";
import "./utils/http-proxy.js";

import { getApiProvider, getApiProviderSource } from "./api-registry.js";
import { withProviderFetch } from "./provider-fetch.js";
import { streamWithProviderRetry, withoutDerivedOutputLimit } from "./provider-kit/provider-retry.js";
import { projectLanguageModelAdapter, projectLanguageModelSimpleAdapter } from "./providers/legacy-adapter-stream.js";
import { getDefaultAdapterRegistry } from "./runtime/default-adapter-registry.js";
import type {
	Api,
	AssistantMessage,
	Context,
	Model,
	ProviderStreamOptions,
	SimpleStreamOptions,
	StreamOptions,
} from "./types.js";
import type { AssistantMessageEventStream } from "./utils/event-stream.js";

export { getEnvApiKey } from "./env-api-keys.js";

function resolveApiProvider(api: Api) {
	const provider = getApiProvider(api);
	if (!provider) {
		throw new Error(`No API provider registered for api: ${api}`);
	}
	return provider;
}

function resolveNativeAdapter(api: Api) {
	return getDefaultAdapterRegistry().get(api);
}

function shouldUseNativeAdapter(api: Api): boolean {
	const nativeAdapter = resolveNativeAdapter(api);
	if (!nativeAdapter) return false;
	const legacySource = getApiProviderSource(api);
	return legacySource === undefined || legacySource === "built-in";
}

function shouldUseNativeSimpleAdapter(api: Api): boolean {
	const nativeAdapter = resolveNativeAdapter(api);
	if (!nativeAdapter?.streamSimple) return false;
	const legacySource = getApiProviderSource(api);
	return legacySource === undefined || legacySource === "built-in";
}

function providerRetryConfig<TApi extends Api>(model: Model<TApi>, resolved?: StreamOptions) {
	return {
		model,
		signal: resolved?.signal,
		maxRetries: resolved?.providerRetry?.maxRetries,
		streamIdleTimeoutMs: resolved?.streamIdleTimeoutMs,
		maxRetryDelayMs: resolved?.maxRetryDelayMs,
		// The repair only strips auto-derived output limits; a caller-set
		// maxTokens is user intent and is never removed.
		outputLimitRepair: resolved?.maxTokens === undefined && resolved?.providerRetry?.outputLimitRepair !== false,
	};
}

export function stream<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: ProviderStreamOptions,
): AssistantMessageEventStream {
	const resolved = withProviderFetch(model, options as StreamOptions | undefined);
	return streamWithProviderRetry(
		(attemptSignal, mode) => {
			// The unified retry layer owns retry policy for this call, so transport-local
			// retries stay disabled to keep backoff single-owned.
			const attemptOptions = { ...resolved, signal: attemptSignal, maxRetries: 0 } as ProviderStreamOptions;
			if (mode === "output_limit_repair") {
				const repaired = withoutDerivedOutputLimit(attemptOptions);
				attemptOptions.onPayload = repaired.onPayload;
			}
			const nativeAdapter = resolveNativeAdapter(model.api);
			if (nativeAdapter && shouldUseNativeAdapter(model.api)) {
				return projectLanguageModelAdapter(nativeAdapter, model, context, attemptOptions);
			}
			const provider = resolveApiProvider(model.api);
			return provider.stream(model, context, attemptOptions);
		},
		providerRetryConfig(model, resolved),
	);
}

export async function complete<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: ProviderStreamOptions,
): Promise<AssistantMessage> {
	const s = stream(model, context, options);
	return s.result();
}

export function streamSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const resolved = withProviderFetch(model, options);
	return streamWithProviderRetry(
		(attemptSignal, mode) => {
			const attemptOptions = { ...resolved, signal: attemptSignal, maxRetries: 0 } as SimpleStreamOptions;
			if (mode === "output_limit_repair") {
				const repaired = withoutDerivedOutputLimit(attemptOptions);
				attemptOptions.onPayload = repaired.onPayload;
			}
			const nativeAdapter = resolveNativeAdapter(model.api);
			if (nativeAdapter?.streamSimple && shouldUseNativeSimpleAdapter(model.api)) {
				return projectLanguageModelSimpleAdapter(nativeAdapter, model, context, attemptOptions);
			}
			const provider = resolveApiProvider(model.api);
			return provider.streamSimple(model, context, attemptOptions);
		},
		providerRetryConfig(model, resolved),
	);
}

export async function completeSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	const s = streamSimple(model, context, options);
	return s.result();
}
