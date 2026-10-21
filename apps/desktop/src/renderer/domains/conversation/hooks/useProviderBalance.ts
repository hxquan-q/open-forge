// Copyright The Open Forge contributors.
import { selectedModelAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** 主进程余额查询结果（经 preload 桥的类型推导，避免渲染层直连 preload 模块）。 */
type ProviderBalanceResult = Awaited<ReturnType<Window["vetta"]["models"]["getBalance"]>>;
type GetBalance = (providerId: string) => Promise<ProviderBalanceResult>;

/**
 * 60s 短缓存（D4）：余额不是秒级数据，选型面板反复开合、切回同一 provider 时命中缓存
 * 即不再打上游。模块级 Map 让同一 provider 的多个输入框共享一份结果。
 */
export const PROVIDER_BALANCE_CACHE_TTL_MS = 60_000;

interface BalanceCacheEntry {
	readonly result: ProviderBalanceResult;
	readonly fetchedAt: number;
}

const balanceCache = new Map<string, BalanceCacheEntry>();

/** 清空余额缓存（测试隔离与登出场景）。 */
export function clearProviderBalanceCache(): void {
	balanceCache.clear();
}

/** 供 UI 消费的归一化视图；`visible: false` 表示零渲染（unsupported / 失败 / 无选中模型）。 */
export interface ProviderBalanceView {
	readonly visible: boolean;
	readonly currency?: string;
	readonly available?: number;
	readonly isAvailable?: boolean;
}

export interface UseProviderBalanceOptions {
	/** 覆盖数据源；缺省读全局 `selectedModelAtom`。scoped 输入框传自己的 modelKey。 */
	readonly modelKey?: string | null;
	/** 值变化即触发一次「尊重缓存」的重取（选型面板打开时由宿主自增）。 */
	readonly refreshTick?: number;
}

export interface UseProviderBalanceResult {
	readonly view: ProviderBalanceView;
	/** 手动刷新：绕过 60s 缓存强制重取。 */
	readonly refresh: () => void;
}

const HIDDEN_VIEW: ProviderBalanceView = { visible: false };

/** 从 "provider/modelId" 解析 provider；无选中模型时返回 null。 */
export function parseProviderFromModelKey(modelKey: string | null | undefined): string | null {
	if (!modelKey) return null;
	const slash = modelKey.indexOf("/");
	const provider = slash > 0 ? modelKey.slice(0, slash) : modelKey;
	return provider.length > 0 ? provider : null;
}

/** 桥缺失（旧 bundle / 精简测试环境）时按「无能力」处理，不抛错。 */
function resolveGetBalance(): GetBalance | null {
	const models = window.vetta?.models as { getBalance?: GetBalance } | undefined;
	return typeof models?.getBalance === "function" ? models.getBalance : null;
}

function readFreshCache(provider: string): ProviderBalanceResult | null {
	const entry = balanceCache.get(provider);
	if (!entry) return null;
	return Date.now() - entry.fetchedAt < PROVIDER_BALANCE_CACHE_TTL_MS ? entry.result : null;
}

/** supported 且成功、且有可用金额才展示；其余一律零渲染（D5）。 */
function toView(result: ProviderBalanceResult | null): ProviderBalanceView {
	if (!result || !result.supported || result.errorCode || typeof result.available !== "number") {
		return HIDDEN_VIEW;
	}
	return {
		visible: true,
		currency: result.currency,
		available: result.available,
		isAvailable: result.isAvailable,
	};
}

/**
 * 当前所选模型 provider 的余额：由 `selectedModelAtom`（或 scoped 覆盖的 modelKey）解析
 * provider → IPC `getBalance`；60s 缓存；面板打开（refreshTick 自增）尊重缓存，手动刷新强制重取。
 * 未支持 / 失败 / 无选中模型一律落到零渲染视图。
 */
export function useProviderBalance(options: UseProviderBalanceOptions = {}): UseProviderBalanceResult {
	const { modelKey, refreshTick = 0 } = options;
	const globalSelectedModel = useAtomValue(selectedModelAtom);
	const effectiveModelKey = modelKey === undefined ? globalSelectedModel : modelKey;
	const provider = useMemo(() => parseProviderFromModelKey(effectiveModelKey), [effectiveModelKey]);

	const [result, setResult] = useState<ProviderBalanceResult | null>(() =>
		provider ? readFreshCache(provider) : null,
	);
	const activeProviderRef = useRef<string | null>(provider);
	const requestSeqRef = useRef(0);

	const fetchBalance = useCallback(async (targetProvider: string): Promise<void> => {
		const getBalance = resolveGetBalance();
		if (!getBalance) return;
		const seq = ++requestSeqRef.current;
		try {
			const next = await getBalance(targetProvider);
			balanceCache.set(targetProvider, { result: next, fetchedAt: Date.now() });
			if (seq === requestSeqRef.current && activeProviderRef.current === targetProvider) setResult(next);
		} catch {
			// 失败零渲染：不缓存、不回显错误，只清掉当前展示。
			if (seq === requestSeqRef.current && activeProviderRef.current === targetProvider) setResult(null);
		}
	}, []);

	// provider 变化（或无选中模型）时确保一次可用结果；先清掉上一 provider 的展示。
	useEffect(() => {
		activeProviderRef.current = provider;
		if (!provider) {
			requestSeqRef.current += 1;
			setResult(null);
			return;
		}
		const cached = readFreshCache(provider);
		setResult(cached);
		if (!cached) void fetchBalance(provider);
	}, [provider, fetchBalance]);

	// 选型面板打开（refreshTick 自增）时按缓存策略再取一次。只读 ref 而非 provider，
	// 避免 provider 变化时与上面的 effect 重复请求；缓存命中则不打上游（D4）。
	useEffect(() => {
		if (refreshTick === 0) return;
		const target = activeProviderRef.current;
		if (!target) return;
		const cached = readFreshCache(target);
		if (cached) {
			setResult(cached);
			return;
		}
		void fetchBalance(target);
	}, [refreshTick, fetchBalance]);

	const refresh = useCallback(() => {
		const target = activeProviderRef.current;
		if (target) void fetchBalance(target);
	}, [fetchBalance]);

	const view = useMemo(() => toView(result), [result]);
	return { view, refresh };
}
