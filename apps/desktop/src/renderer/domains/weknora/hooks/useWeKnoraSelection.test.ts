// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWeKnoraSelection } from "./useWeKnoraSelection";

/**
 * 多选选择状态机（AC-8）：进入 / 退出 / 勾选 / 全选 / prune。
 * 集合语义与「模式开关」的联动（enter/exit 清空）是这里的核心不变量。
 */

describe("useWeKnoraSelection", () => {
	it("初始未激活、无选择", () => {
		const { result } = renderHook(() => useWeKnoraSelection());
		expect(result.current.active).toBe(false);
		expect(result.current.count).toBe(0);
	});

	it("enter 进入并清空既有选择；exit 退出并清空", () => {
		const { result } = renderHook(() => useWeKnoraSelection());
		act(() => result.current.enter());
		expect(result.current.active).toBe(true);

		act(() => result.current.toggle("a"));
		expect(result.current.count).toBe(1);

		act(() => result.current.exit());
		expect(result.current.active).toBe(false);
		expect(result.current.count).toBe(0);

		// 再次进入不应残留上一次的选择。
		act(() => result.current.enter());
		expect(result.current.count).toBe(0);
	});

	it("toggle 勾选 / 取消勾选单个会话", () => {
		const { result } = renderHook(() => useWeKnoraSelection());
		act(() => result.current.enter());

		act(() => result.current.toggle("a"));
		act(() => result.current.toggle("b"));
		expect(result.current.count).toBe(2);
		expect(result.current.isSelected("a")).toBe(true);
		expect(result.current.isSelected("b")).toBe(true);

		act(() => result.current.toggle("a"));
		expect(result.current.isSelected("a")).toBe(false);
		expect(result.current.count).toBe(1);
	});

	it("selectAll 用给定集合替换选择", () => {
		const { result } = renderHook(() => useWeKnoraSelection());
		act(() => result.current.enter());
		act(() => result.current.toggle("stale"));

		act(() => result.current.selectAll(["a", "b", "c"]));
		expect(result.current.count).toBe(3);
		expect(result.current.isSelected("stale")).toBe(false);
		expect(result.current.isSelected("c")).toBe(true);
	});

	it("prune 剔除不在集合中的勾选项（列表刷新 / 转流式后收敛）", () => {
		const { result } = renderHook(() => useWeKnoraSelection());
		act(() => result.current.enter());
		act(() => result.current.selectAll(["a", "b", "c"]));

		act(() => result.current.prune(new Set(["a", "c"])));
		expect(result.current.count).toBe(2);
		expect(result.current.isSelected("b")).toBe(false);
		expect(result.current.isSelected("a")).toBe(true);
	});
});
