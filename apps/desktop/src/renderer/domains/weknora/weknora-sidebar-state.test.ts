// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { afterEach, describe, expect, it } from "vitest";
import {
	parseWeKnoraSidebarState,
	persistWeKnoraSidebarCollapsed,
	readPersistedWeKnoraSidebarCollapsed,
	sanitizeWeKnoraSidebarState,
	serializeWeKnoraSidebarState,
	WEKNORA_SIDEBAR_STORAGE_KEY,
} from "./weknora-sidebar-state";

afterEach(() => {
	localStorage.clear();
});

describe("weknora sidebar state · 纯函数", () => {
	it("合法值往返:serialize → parse 保真（collapsed true / false）", () => {
		expect(parseWeKnoraSidebarState(serializeWeKnoraSidebarState(true))).toBe(true);
		expect(parseWeKnoraSidebarState(serializeWeKnoraSidebarState(false))).toBe(false);
	});

	it("无记录（null / 空串）回落展开", () => {
		expect(parseWeKnoraSidebarState(null)).toBe(false);
		expect(parseWeKnoraSidebarState("")).toBe(false);
	});

	it("畸形 JSON 回落展开", () => {
		expect(parseWeKnoraSidebarState("{not json")).toBe(false);
		expect(parseWeKnoraSidebarState("undefined")).toBe(false);
	});

	it("缺 collapsed 字段回落展开", () => {
		expect(parseWeKnoraSidebarState('{"version":1}')).toBe(false);
	});

	it("版本不符回落展开", () => {
		expect(parseWeKnoraSidebarState('{"version":2,"collapsed":true}')).toBe(false);
		expect(parseWeKnoraSidebarState('{"version":"1","collapsed":true}')).toBe(false);
	});

	it("collapsed 非布尔回落展开", () => {
		expect(parseWeKnoraSidebarState('{"version":1,"collapsed":"true"}')).toBe(false);
		expect(parseWeKnoraSidebarState('{"version":1,"collapsed":1}')).toBe(false);
	});

	it("顶层不是对象（数组 / 字符串 / 数字）sanitize 返回 null，parse 回落展开", () => {
		expect(sanitizeWeKnoraSidebarState([true])).toBeNull();
		expect(sanitizeWeKnoraSidebarState("yes")).toBeNull();
		expect(sanitizeWeKnoraSidebarState(1)).toBeNull();
		expect(sanitizeWeKnoraSidebarState(null)).toBeNull();
		expect(parseWeKnoraSidebarState('[{"version":1,"collapsed":true}]')).toBe(false);
		expect(parseWeKnoraSidebarState('"true"')).toBe(false);
	});
});

describe("weknora sidebar state · localStorage 读写", () => {
	it("persist 写入约定 key，read 读回；未写时 read 回落展开", () => {
		expect(readPersistedWeKnoraSidebarCollapsed()).toBe(false);

		persistWeKnoraSidebarCollapsed(true);
		expect(localStorage.getItem(WEKNORA_SIDEBAR_STORAGE_KEY)).toBe('{"version":1,"collapsed":true}');
		expect(readPersistedWeKnoraSidebarCollapsed()).toBe(true);

		persistWeKnoraSidebarCollapsed(false);
		expect(readPersistedWeKnoraSidebarCollapsed()).toBe(false);
	});

	it("落盘原文被外部写坏时 read 安全回落展开", () => {
		localStorage.setItem(WEKNORA_SIDEBAR_STORAGE_KEY, "]]garbage[[");
		expect(readPersistedWeKnoraSidebarCollapsed()).toBe(false);
	});
});
