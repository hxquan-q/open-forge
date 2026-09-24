import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { installVettaBridge } from "./vetta-bridge.js";

/**
 * Node 22 自带一个未启用的 `globalThis.localStorage`（需要 --localstorage-file 才可用），
 * vitest 的 jsdom 环境不会覆盖这个已存在的全局，于是 renderer 模块在 DOM 测试里读到 undefined。
 * 这里在 DOM 环境下补一个内存实现；node 环境的测试不受影响。
 */
function createMemoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		get length(): number {
			return map.size;
		},
		clear: () => map.clear(),
		getItem: (key: string) => map.get(key) ?? null,
		key: (index: number) => [...map.keys()][index] ?? null,
		removeItem: (key: string) => void map.delete(key),
		setItem: (key: string, value: string) => void map.set(key, String(value)),
	};
}

if (typeof window !== "undefined" && typeof globalThis.localStorage === "undefined") {
	const storage = window.localStorage ?? createMemoryStorage();
	Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
	if (globalThis.window !== undefined && window.localStorage === undefined) {
		Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
	}
}

/**
 * 渲染层模块普遍经 useShortcuts/loadShortcutBindings 触达 window.vetta.config；
 * 测试环境没有 preload 桥，提供一个可被各测试文件 defineProperty 整体覆盖的最小桥面。
 */
if (typeof window !== "undefined" && window.vetta === undefined) {
	installVettaBridge();
}

afterEach(() => cleanup());
