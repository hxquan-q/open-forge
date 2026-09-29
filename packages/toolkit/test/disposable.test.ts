import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type Disposable,
	DisposableMap,
	DisposableStore,
	disposeAll,
	disposeIfDisposable,
	isDisposable,
	MutableDisposable,
	toDisposable,
} from "../src/disposable.js";
import {
	disableDisposableLeakTracking,
	enableDisposableLeakTracking,
	readDisposableLeakReport,
} from "../src/disposable-leak-tracker.js";

function disposable(onDispose: () => void): Disposable {
	return { dispose: onDispose };
}

afterEach(() => {
	disableDisposableLeakTracking();
});

describe("toDisposable / disposeIfDisposable", () => {
	it("only runs the cleanup once", () => {
		const cleanup = vi.fn();
		const value = toDisposable(cleanup);

		value.dispose();
		value.dispose();

		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it("disposes objects, calls functions and ignores empty values", () => {
		const onDispose = vi.fn();
		const onCleanup = vi.fn();

		disposeIfDisposable(disposable(onDispose));
		disposeIfDisposable(onCleanup);
		disposeIfDisposable(undefined);
		disposeIfDisposable(null);

		expect(onDispose).toHaveBeenCalledTimes(1);
		expect(onCleanup).toHaveBeenCalledTimes(1);
		expect(isDisposable(disposable(() => {}))).toBe(true);
		expect(isDisposable(() => {})).toBe(false);
	});
});

describe("DisposableStore", () => {
	it("disposes the registered resources once and stays idempotent", () => {
		const store = new DisposableStore();
		const first = vi.fn();
		const second = vi.fn();
		store.add(disposable(first));
		store.add(toDisposable(second));

		store.dispose();
		store.dispose();

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		expect(store.isDisposed).toBe(true);
		expect(store.size).toBe(0);
	});

	it("disposes resources added after the store was disposed", () => {
		const store = new DisposableStore();
		store.dispose();

		const late = vi.fn();
		store.add(disposable(late));

		expect(late).toHaveBeenCalledTimes(1);
		expect(store.size).toBe(0);
	});

	it("keeps releasing the remaining resources when one cleanup fails", () => {
		const store = new DisposableStore();
		const survivor = vi.fn();
		store.add(
			disposable(() => {
				throw new Error("boom");
			}),
		);
		store.add(disposable(survivor));

		expect(() => store.dispose()).toThrow(AggregateError);
		expect(survivor).toHaveBeenCalledTimes(1);
	});

	it("delete removes ownership without disposing", () => {
		const store = new DisposableStore();
		const onDispose = vi.fn();
		const value = disposable(onDispose);
		store.add(value);

		expect(store.delete(value)).toBe(true);
		expect(onDispose).not.toHaveBeenCalled();

		store.dispose();
		expect(onDispose).not.toHaveBeenCalled();
	});
});

describe("MutableDisposable", () => {
	it("disposes the previous value when replaced and when cleared", () => {
		const holder = new MutableDisposable<Disposable>();
		const first = vi.fn();
		const second = vi.fn();

		holder.value = disposable(first);
		holder.value = disposable(second);
		expect(first).toHaveBeenCalledTimes(1);

		holder.clear();
		expect(second).toHaveBeenCalledTimes(1);
		expect(holder.value).toBeUndefined();
	});
});

describe("DisposableMap", () => {
	it("deleteAndDispose removes the entry before disposing it", () => {
		const map = new DisposableMap<string, Disposable>();
		const disposedKeys: (string | undefined)[] = [];
		map.set("dir", {
			dispose: () => {
				disposedKeys.push(map.get("dir") === undefined ? "gone" : "still-there");
			},
		});

		expect(map.deleteAndDispose("dir")).toBe(true);
		expect(map.deleteAndDispose("dir")).toBe(false);
		expect(map.size).toBe(0);
		expect(disposedKeys).toEqual(["gone"]);
	});

	it("disposes every value on dispose and rejects later writes", () => {
		const map = new DisposableMap<string, Disposable>();
		const first = vi.fn();
		const late = vi.fn();
		map.set("a", disposable(first));

		map.dispose();
		map.set("b", disposable(late));

		expect(first).toHaveBeenCalledTimes(1);
		expect(late).toHaveBeenCalledTimes(1);
		expect(map.isDisposed).toBe(true);
	});
});

describe("disposeAll", () => {
	it("releases everything and aggregates failures", () => {
		const survivor = vi.fn();
		expect(() =>
			disposeAll([
				disposable(() => {
					throw new Error("first");
				}),
				disposable(survivor),
			]),
		).toThrow(AggregateError);
		expect(survivor).toHaveBeenCalledTimes(1);
	});
});

describe("disposable leak tracking", () => {
	it("is inert until it is enabled", () => {
		expect(enableDisposableLeakTracking()).toBe(true);
		expect(enableDisposableLeakTracking()).toBe(false);
		expect(readDisposableLeakReport()).toEqual({ enabled: true, tracked: 0, disposed: 0, leaked: [] });
	});

	it("counts tracked and disposed resources through DisposableStore", () => {
		enableDisposableLeakTracking();
		const store = new DisposableStore();
		const value = disposable(() => {});
		store.add(value);
		store.delete(value);

		const report = readDisposableLeakReport();
		expect(report.enabled).toBe(true);
		expect(report.tracked).toBe(1);
		expect(report.disposed).toBe(1);
		expect(report.leaked).toEqual([]);
	});

	it("stops counting once tracking is disabled", () => {
		enableDisposableLeakTracking();
		disableDisposableLeakTracking();
		const store = new DisposableStore();
		store.add(disposable(() => {}));

		expect(readDisposableLeakReport()).toEqual({ enabled: false, tracked: 0, disposed: 0, leaked: [] });
	});
});
