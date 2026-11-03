// Modified by The Open Forge contributors.
import type { GitRepoStatusResult } from "@preload/api-types/git";
import { useCallback, useEffect, useRef, useState } from "react";

/** 结果缓存 TTL：同一 cwd 在窗口内复用，避免输入栏 chip 与 Git 页签重复拉取。 */
const CACHE_TTL_MS = 4000;
const DEFAULT_POLL_MS = 5000;

interface CacheEntry {
	at: number;
	data: GitRepoStatusResult;
	promise?: Promise<GitRepoStatusResult>;
}

const cache = new Map<string, CacheEntry>();

async function loadRepoStatus(cwd: string): Promise<GitRepoStatusResult> {
	const cached = cache.get(cwd);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
	if (cached?.promise) return cached.promise;
	const promise = window.vetta.git
		.getRepoStatus(cwd)
		.catch(() => null)
		.then((data) => {
			cache.set(cwd, { at: Date.now(), data });
			return data;
		});
	cache.set(cwd, { at: Date.now(), data: cached?.data ?? null, promise });
	return promise;
}

export interface GitRepoStatusState {
	/** null = 非 git 仓库 / git 不可用；undefined = 尚未加载。 */
	status: GitRepoStatusResult | undefined;
	loading: boolean;
	refresh: () => void;
}

/**
 * 只读 git 仓库状态（演示级）：TTL 缓存 + 可选轮询。多个消费者（输入栏分支标签、
 * 活动面板 Git 页签）共用同一份缓存，同一 cwd 窗口内只发一次 IPC。
 */
export function useGitRepoStatus(
	cwd: string | undefined | null,
	options: { pollMs?: number } = {},
): GitRepoStatusState {
	const { pollMs = DEFAULT_POLL_MS } = options;
	const [state, setState] = useState<GitRepoStatusResult | undefined>(cwd ? undefined : null);
	const [tick, setTick] = useState(0);
	const cwdRef = useRef(cwd);
	cwdRef.current = cwd;

	/** 手动刷新绕过 TTL 缓存（页签刷新按钮语义）。 */
	const refresh = useCallback(() => {
		const current = cwdRef.current;
		if (current) cache.delete(current);
		setTick((value) => value + 1);
	}, []);

	useEffect(() => {
		// tick 是手动刷新的重触发哨兵，本身不参与逻辑。
		void tick;
		if (!cwd) {
			setState(null);
			return;
		}
		let cancelled = false;
		void loadRepoStatus(cwd).then((data) => {
			if (!cancelled) setState(data);
		});
		const timer = window.setInterval(() => {
			void loadRepoStatus(cwd).then((data) => {
				if (!cancelled) setState(data);
			});
		}, pollMs);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [cwd, pollMs, tick]);

	return { status: state, loading: cwd !== undefined && state === undefined, refresh };
}
