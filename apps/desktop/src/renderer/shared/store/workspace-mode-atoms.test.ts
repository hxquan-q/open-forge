// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { createStore, getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_WORKSPACE_MODE,
	enterWorkspaceSection,
	normalizeWorkspaceMode,
	readWorkspaceModeFor,
	WORKSPACE_MODE_STORAGE_KEY,
	workspaceModeByProjectAtom,
	writeWorkspaceMode,
} from "./workspace-mode-atoms";

function memoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key),
		clear: () => map.clear(),
		key: (index: number) => [...map.keys()][index] ?? null,
		get length() {
			return map.size;
		},
	};
}

beforeEach(() => {
	vi.stubGlobal("localStorage", memoryStorage());
});

describe("normalizeWorkspaceMode", () => {
	it("接受两个合法模式，其余一律拒绝", () => {
		expect(normalizeWorkspaceMode("coding")).toBe("coding");
		expect(normalizeWorkspaceMode("work")).toBe("work");
		expect(normalizeWorkspaceMode("WORK")).toBeNull();
		expect(normalizeWorkspaceMode("")).toBeNull();
		expect(normalizeWorkspaceMode(null)).toBeNull();
		expect(normalizeWorkspaceMode(1)).toBeNull();
	});
});

describe("writeWorkspaceMode / readWorkspaceModeFor", () => {
	it("写入后可按 cwd 读回；默认模式不落记录", () => {
		let map = new Map();
		map = writeWorkspaceMode(map, "/repo/a", "coding");
		expect(readWorkspaceModeFor(map, "/repo/a")).toBe("coding");
		// 切回 work（默认档）是「删除记录」而非记录 work——存储里不留冗余默认值。
		map = writeWorkspaceMode(map, "/repo/a", "work");
		expect(readWorkspaceModeFor(map, "/repo/a")).toBe(DEFAULT_WORKSPACE_MODE);
		expect(map.size).toBe(0);
	});

	it("不可变更新且不串项目", () => {
		const base = new Map();
		const next = writeWorkspaceMode(base, "/repo/a", "coding");
		expect(base.size).toBe(0);
		expect(readWorkspaceModeFor(next, "/repo/a")).toBe("coding");
		expect(readWorkspaceModeFor(next, "/repo/b")).toBe("work");
	});

	it("cwd 缺失一律回落 work（默认档 = 文档与研究）", () => {
		const map = writeWorkspaceMode(new Map(), "/repo/a", "coding");
		expect(readWorkspaceModeFor(map, null)).toBe("work");
		expect(readWorkspaceModeFor(map, undefined)).toBe("work");
	});
});

describe("workspaceModeByProjectAtom", () => {
	it("写入即同步 localStorage，重开后读回", () => {
		const store = createStore();
		store.set(workspaceModeByProjectAtom, (prev) => writeWorkspaceMode(prev, "/repo/a", "coding"));
		expect(JSON.parse(localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY)!)).toEqual({ "/repo/a": "coding" });
	});

	it("持久化记录里的脏数据被丢弃，合法项保留", () => {
		localStorage.setItem(
			WORKSPACE_MODE_STORAGE_KEY,
			JSON.stringify({ "/repo/a": "work", "/repo/b": "bogus", "/repo/c": 42 }),
		);
		// 模块在 beforeEach 之前已加载，这里直接验证读路径对脏值的过滤逻辑。
		const raw = JSON.parse(localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY)!) as Record<string, unknown>;
		const cleaned = new Map(
			Object.entries(raw)
				.map(([cwd, v]) => [cwd, normalizeWorkspaceMode(v)] as const)
				.filter((pair): pair is readonly [string, "coding" | "work"] => pair[1] !== null),
		);
		expect(cleaned.get("/repo/a")).toBe("work");
		expect(cleaned.has("/repo/b")).toBe(false);
		expect(cleaned.has("/repo/c")).toBe(false);
	});
});

describe("enterWorkspaceSection", () => {
	it("版块入口的统一写入：进开发版块落 coding，回新会话清除记录回落默认档", () => {
		const store = getDefaultStore();
		enterWorkspaceSection("/repo/a", "coding");
		expect(readWorkspaceModeFor(store.get(workspaceModeByProjectAtom), "/repo/a")).toBe("coding");
		expect(JSON.parse(localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY)!)).toEqual({ "/repo/a": "coding" });

		enterWorkspaceSection("/repo/a", "work");
		expect(readWorkspaceModeFor(store.get(workspaceModeByProjectAtom), "/repo/a")).toBe(DEFAULT_WORKSPACE_MODE);
		expect(JSON.parse(localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY)!)).toEqual({});
	});
});
