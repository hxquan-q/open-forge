// Modified by The Open Forge contributors.
/**
 * 开发期 Disposable 泄漏追踪（对应 VS Code `GCBasedDisposableTracker`）。
 *
 * 只在显式打开时生效：追踪器用 `WeakMap` + `FinalizationRegistry` 记录「谁创建了资源」，
 * 并且**不持有强引用**，因此对象被 GC 掉却从未 `dispose()` 时会出现在报告里 —— 那正是
 * 泄漏的样子。默认关闭时 `trackDisposable` / `markDisposableDisposed` 都是首行返回的
 * 空操作，生产构建里这套代码不会产生运行时开销。
 */
import type { Disposable } from "./disposable.js";

export interface DisposableLeakRecord {
	name: string;
	/** 创建（登记）时的调用栈，用来定位是谁没释放。 */
	createdStack: string;
}

export interface CollectedDisposableLeakRecord extends DisposableLeakRecord {
	collectedAt: string;
}

export interface DisposableLeakReport {
	enabled: boolean;
	tracked: number;
	disposed: number;
	leaked: CollectedDisposableLeakRecord[];
}

interface TrackerState {
	readonly infos: WeakMap<object, DisposableLeakRecord>;
	readonly registry: FinalizationRegistry<DisposableLeakRecord>;
	tracked: number;
	disposed: number;
	leaked: CollectedDisposableLeakRecord[];
}

let state: TrackerState | undefined;

export function isDisposableLeakTrackingEnabled(): boolean {
	return state !== undefined;
}

/** 幂等启用；已启用时返回 false，方便调用方决定是否打日志。 */
export function enableDisposableLeakTracking(): boolean {
	if (state) return false;
	if (typeof FinalizationRegistry !== "function") return false;
	const tracker: TrackerState = {
		infos: new WeakMap(),
		registry: new FinalizationRegistry<DisposableLeakRecord>((record) => {
			tracker.leaked.push({ ...record, collectedAt: new Date().toISOString() });
		}),
		tracked: 0,
		disposed: 0,
		leaked: [],
	};
	state = tracker;
	return true;
}

export function disableDisposableLeakTracking(): void {
	state = undefined;
}

/** 只登记元数据，不持有对象引用，否则被追踪对象永远等不到 GC。 */
export function trackDisposable(disposable: Disposable, name: string): void {
	if (!state) return;
	const record: DisposableLeakRecord = { name, createdStack: captureCreationStack(name) };
	state.infos.set(disposable, record);
	state.registry.register(disposable, record, record);
	state.tracked += 1;
}

export function markDisposableDisposed(disposable: Disposable): void {
	if (!state) return;
	const record = state.infos.get(disposable);
	if (!record) return;
	state.registry.unregister(record);
	state.infos.delete(disposable);
	state.disposed += 1;
}

export function readDisposableLeakReport(): DisposableLeakReport {
	if (!state) return { enabled: false, tracked: 0, disposed: 0, leaked: [] };
	return {
		enabled: true,
		tracked: state.tracked,
		disposed: state.disposed,
		leaked: [...state.leaked],
	};
}

function captureCreationStack(name: string): string {
	const stack = new Error(`disposable created: ${name}`).stack ?? "";
	// 丢掉前两帧（Error 自身 + 追踪器），否则报告首行永远是这里。
	return stack.split("\n").slice(2).join("\n");
}
