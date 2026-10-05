// Copyright The Open Forge contributors.
import { createRequire } from "node:module";
import { app } from "electron";
import type * as Koffi from "koffi";
import { getAppLogger } from "../logger.js";

/**
 * 系统电源事件入口。生产接线传入 Electron 的 `powerMonitor`；测试注入可驱动的事件源。
 * 只依赖 `on` / `off` 两个方法，不把 electron 类型拉进被测单元。
 */
export interface PowerEventSource {
	on(event: PowerTrimEventName, listener: () => void): unknown;
	off(event: PowerTrimEventName, listener: () => void): unknown;
}

export type PowerTrimEventName = "suspend" | "lock-screen" | "resume" | "unlock-screen";

export interface PowerTrimLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	debug(message: string, data?: Record<string, unknown>): void;
}

export interface PowerTrimOptions {
	/** 默认 `process.platform`；测试用它覆盖平台分支。 */
	readonly platform?: string;
	/** 读取主进程自身 working-set（KB）。默认经 `app.getAppMetrics()` 取 `Browser` 进程。 */
	readonly readMainWorkingSetKb?: () => number | undefined;
	/** 裁剪自身工作集。默认在 win32 上经 koffi 调 `EmptyWorkingSet`，其余平台为空。 */
	readonly trimWorkingSet?: () => void;
	readonly log?: PowerTrimLogger;
}

export interface PowerTrimService {
	dispose(): void;
	readonly disposed: boolean;
}

const TRIM_EVENTS = ["suspend", "lock-screen"] as const;
const OBSERVE_EVENTS = ["resume", "unlock-screen"] as const;

const log = (() => {
	try {
		return getAppLogger("power-trim");
	} catch {
		return {
			info: () => undefined,
			warn: () => undefined,
			debug: () => undefined,
		};
	}
})();

/** 同一事件源只挂一轮监听，防止重复 start 叠加回调。 */
const startedSources = new WeakSet<object>();

let windowsTrim: (() => void) | null | undefined;

/**
 * 懒加载 win32 的自身工作集裁剪；失败（缺 DLL/FFI 不可用）缓存为 null，
 * 让每个电源事件点最多告警一次，不在 suspend 路径反复尝试加载。
 */
function resolveWindowsTrim(): (() => void) | null {
	if (windowsTrim !== undefined) return windowsTrim;
	windowsTrim = null;
	try {
		const koffi = createRequire(import.meta.url)("koffi") as typeof Koffi;
		const psapi = koffi.load("psapi.dll");
		const kernel32 = koffi.load("kernel32.dll");
		const emptyWorkingSet = psapi.func("int __stdcall EmptyWorkingSet(void *)");
		const getCurrentProcess = kernel32.func("void * __stdcall GetCurrentProcess()");
		windowsTrim = () => {
			if (emptyWorkingSet(getCurrentProcess()) === 0) {
				throw new Error("EmptyWorkingSet returned 0");
			}
		};
	} catch {
		windowsTrim = null;
	}
	return windowsTrim;
}

function defaultReadMainWorkingSetKb(): number | undefined {
	try {
		const metrics = app.getAppMetrics?.();
		const main = metrics?.find((sample) => sample.type === "Browser");
		return main?.memory?.workingSetSize;
	} catch {
		return undefined;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * 电源事件收缩（RESEARCH-0004 P1-8）：
 * - `suspend` / `lock-screen` 是唯二被认可的对自身进程做一次性 working-set
 *   trim 的时机（用户必然无感）；其余时机一律不做，避免伪优化。
 * - `resume` / `unlock-screen` 只观测不重建，回填交给既有懒加载路径。
 * 整个服务是纯旁路：任何失败只告警，不影响其他电源订阅方。
 */
export function startPowerTrimService(source: PowerEventSource, options?: PowerTrimOptions): PowerTrimService {
	if (startedSources.has(source)) {
		return { dispose: () => undefined, disposed: true };
	}
	startedSources.add(source);

	const platform = options?.platform ?? process.platform;
	const readMainWorkingSetKb = options?.readMainWorkingSetKb ?? defaultReadMainWorkingSetKb;
	const logger = options?.log ?? log;
	const customTrim = options?.trimWorkingSet;
	let trimUnavailableWarned = false;
	let disposed = false;

	function readKb(): number | undefined {
		try {
			return readMainWorkingSetKb();
		} catch {
			return undefined;
		}
	}

	function handleTrimPoint(reason: "suspend" | "lock-screen"): void {
		const beforeKb = readKb();
		let trimmed = false;
		if (platform !== "win32") {
			logger.debug("power trim skipped", { reason, platform });
		} else {
			const trim = customTrim ?? resolveWindowsTrim();
			if (trim) {
				try {
					trim();
					trimmed = true;
				} catch (error) {
					logger.warn("power working-set trim failed", { reason, error: errorMessage(error) });
				}
			} else if (!trimUnavailableWarned) {
				trimUnavailableWarned = true;
				logger.warn("power working-set trim unavailable", { reason, platform });
			}
		}
		const afterKb = readKb();
		logger.info("power working-set trim", {
			reason,
			trimmed,
			...(beforeKb !== undefined && { beforeKb }),
			...(afterKb !== undefined && { afterKb }),
			...(beforeKb !== undefined && afterKb !== undefined && { deltaKb: afterKb - beforeKb }),
		});
	}

	function handleObservePoint(reason: "resume" | "unlock-screen"): void {
		const workingSetKb = readKb();
		logger.info("power event observed", {
			reason,
			...(workingSetKb !== undefined && { workingSetKb }),
		});
	}

	const listeners = new Map<PowerTrimEventName, () => void>();
	for (const event of TRIM_EVENTS) {
		const listener = () => handleTrimPoint(event);
		listeners.set(event, listener);
		source.on(event, listener);
	}
	for (const event of OBSERVE_EVENTS) {
		const listener = () => handleObservePoint(event);
		listeners.set(event, listener);
		source.on(event, listener);
	}

	return {
		get disposed() {
			return disposed;
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			startedSources.delete(source);
			for (const [event, listener] of listeners) source.off(event, listener);
			listeners.clear();
		},
	};
}
