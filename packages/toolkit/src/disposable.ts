// Modified by The Open Forge contributors.
/**
 * 轻量 Disposable 工具集与开发期泄漏追踪（对应 VS Code `base/common/lifecycle.ts` 的
 * `DisposableStore` / `MutableDisposable` / `DisposableMap` 与 `GCBasedDisposableTracker`）。
 *
 * 约定（见 `apps/desktop/AGENTS.md`）：长期持有、需要显式释放的资源——watcher、IPC 订阅、
 * worker、计时器、webview 挂载点——都通过 `DisposableStore`/`DisposableMap` 持有所有权，
 * 由拥有者在生命周期结束时统一 `dispose()`；不再需要时用 `deleteAndDispose()` 立刻释放，
 * 而不是只从集合里删掉引用。
 *
 * 追踪器默认关闭（`enabled` 为 false 时 `trackDisposable`/`markDisposableDisposed` 是
 * 常量级 no-op），只有开发期显式调用 `enableDisposableLeakTracking()` 才生效，
 * 生产构建可以整段被摇掉。
 */
import { markDisposableDisposed, trackDisposable } from "./disposable-leak-tracker.js";

export interface Disposable {
	dispose(): void;
}

export type DisposableLike = Disposable | (() => void) | null | undefined;

export function isDisposable(value: unknown): value is Disposable {
	return typeof (value as Disposable | undefined)?.dispose === "function";
}

/** 把清理函数包装成 Disposable，便于和既有回调式清理互操作。 */
export function toDisposable(cleanup: () => void): Disposable {
	let disposed = false;
	return {
		dispose() {
			if (disposed) return;
			disposed = true;
			cleanup();
		},
	};
}

/** 对可能为空的资源做「能释放就释放」，用于可选依赖或已释放对象。 */
export function disposeIfDisposable(value: DisposableLike): void {
	if (typeof value === "function") {
		value();
		return;
	}
	if (isDisposable(value)) value.dispose();
}

/** 依次释放并吞掉单个失败，保证一个资源的清理失败不阻断其余资源。 */
export function disposeAll(disposables: Iterable<DisposableLike>): void {
	const failures: unknown[] = [];
	for (const disposable of disposables) {
		try {
			disposeIfDisposable(disposable);
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length > 0) {
		throw new AggregateError(failures, `${failures.length} disposable(s) failed to dispose`);
	}
}

/**
 * 资源容器：`add` 接管所有权，`dispose` 幂等释放全部资源；释放后再 `add` 会立刻释放新资源，
 * 避免「容器已经销毁、但后来者仍被登记」的悬挂引用。
 */
export class DisposableStore implements Disposable {
	private readonly items = new Set<Disposable>();
	private disposed = false;

	get isDisposed(): boolean {
		return this.disposed;
	}

	get size(): number {
		return this.items.size;
	}

	add<T extends Disposable>(disposable: T): T {
		if (this.disposed) {
			disposeIfDisposable(disposable);
			return disposable;
		}
		if (!this.items.has(disposable)) {
			this.items.add(disposable);
			trackDisposable(disposable, "DisposableStore");
		}
		return disposable;
	}

	delete(disposable: Disposable): boolean {
		const removed = this.items.delete(disposable);
		if (removed) markDisposableDisposed(disposable);
		return removed;
	}

	clear(): void {
		const snapshot = [...this.items];
		this.items.clear();
		for (const disposable of snapshot) markDisposableDisposed(disposable);
		disposeAll(snapshot);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.clear();
	}
}

/** 持有「当前这一个」资源：`value` 赋值即释放旧值，`clear()` 释放当前值。 */
export class MutableDisposable<T extends Disposable> implements Disposable {
	private current: T | undefined;

	get value(): T | undefined {
		return this.current;
	}

	set value(next: T | undefined) {
		if (this.current === next) return;
		this.clear();
		this.current = next;
		if (next) trackDisposable(next, "MutableDisposable");
	}

	clear(): void {
		const previous = this.current;
		this.current = undefined;
		if (previous) {
			markDisposableDisposed(previous);
			disposeIfDisposable(previous);
		}
	}

	dispose(): void {
		this.clear();
	}
}

/** 键值资源表：`deleteAndDispose(key)` 同时移除并释放，避免「只删引用不释放」。 */
export class DisposableMap<K, V extends Disposable> implements Disposable {
	private readonly entries = new Map<K, V>();
	private disposed = false;

	get isDisposed(): boolean {
		return this.disposed;
	}

	get size(): number {
		return this.entries.size;
	}

	set(key: K, value: V): V {
		if (this.disposed) {
			disposeIfDisposable(value);
			return value;
		}
		const previous = this.entries.get(key);
		if (previous === value) return value;
		if (previous) {
			markDisposableDisposed(previous);
			disposeIfDisposable(previous);
		}
		this.entries.set(key, value);
		trackDisposable(value, "DisposableMap");
		return value;
	}

	get(key: K): V | undefined {
		return this.entries.get(key);
	}

	keys(): IterableIterator<K> {
		return this.entries.keys();
	}

	values(): IterableIterator<V> {
		return this.entries.values();
	}

	/** 先删除再释放：释放过程回读同一 key 时不会再看到旧值。 */
	deleteAndDispose(key: K): boolean {
		const value = this.entries.get(key);
		if (value === undefined) return false;
		this.entries.delete(key);
		markDisposableDisposed(value);
		disposeIfDisposable(value);
		return true;
	}

	clear(): void {
		const snapshot = [...this.entries.values()];
		this.entries.clear();
		for (const value of snapshot) markDisposableDisposed(value);
		disposeAll(snapshot);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.clear();
	}
}
