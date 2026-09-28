// @vitest-environment jsdom
/**
 * 空态主 CTA 是调用方下发的行为合同：过滤中 →「清除筛选」（宿主持有过滤态时回调
 * onClearFilter，否则退化为关闭面板）；列表本来就没有可用项 →「去能力市场」
 * （先关面板再路由跳转）。SkillListEmpty 只负责渲染按钮，分支选择在这里。
 */

import { initI18n } from "@shared/i18n";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSkillPickerModel } from "./useSkillPickerModel";

vi.mock("./useSkillList", () => ({ useSkillList: () => ({ items: [] }) }));
vi.mock("@shared/shortcuts", () => ({ useShortcutScope: vi.fn() }));
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

initI18n();

describe("useSkillPickerModel 空态 CTA 合同", () => {
	beforeEach(() => {
		navigate.mockClear();
	});

	it("过滤中且宿主持有过滤态：清除筛选回调 onClearFilter，不关面板也不导航", () => {
		const onClearFilter = vi.fn();
		const onClose = vi.fn();
		const { result } = renderHook(() =>
			useSkillPickerModel({
				open: true,
				onClose,
				onSelect: vi.fn(),
				filter: "/zz",
				onClearFilter,
			}),
		);

		expect(result.current.viewProps.emptyAction.kind).toBe("clearFilter");
		act(() => result.current.viewProps.emptyAction.onAction());

		expect(onClearFilter).toHaveBeenCalledOnce();
		expect(onClose).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it("过滤中但宿主不持有过滤态：清除筛选退化为关闭面板", () => {
		const onClose = vi.fn();
		const { result } = renderHook(() =>
			useSkillPickerModel({ open: true, onClose, onSelect: vi.fn(), filter: "/zz" }),
		);

		expect(result.current.viewProps.emptyAction.kind).toBe("clearFilter");
		act(() => result.current.viewProps.emptyAction.onAction());

		expect(onClose).toHaveBeenCalledOnce();
	});

	it("无过滤且列表为空：先关面板再路由去能力市场", () => {
		const calls: string[] = [];
		const onClose = vi.fn(() => calls.push("close"));
		navigate.mockImplementation(() => calls.push("navigate"));
		const { result } = renderHook(() => useSkillPickerModel({ open: true, onClose, onSelect: vi.fn(), filter: "/" }));

		expect(result.current.viewProps.emptyAction.kind).toBe("openMarket");
		act(() => result.current.viewProps.emptyAction.onAction());

		expect(calls).toEqual(["close", "navigate"]);
		expect(navigate).toHaveBeenCalledWith({ to: "/abilities" });
	});
});
