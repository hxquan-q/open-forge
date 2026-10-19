// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeKnoraSessionContextMenu, type WeKnoraSessionMenuItem } from "./WeKnoraSessionContextMenu";

/**
 * 右键菜单组件的行为合同（AC-6）：portal 渲染、菜单语义、项点击回调、
 * 点外部 / Escape 关闭、禁用项不可触发。文案由调用方注入（本组件零硬编码文案）。
 */

function items(overrides: Partial<WeKnoraSessionMenuItem> = {}): WeKnoraSessionMenuItem[] {
	return [
		{
			id: "delete",
			label: "删除会话",
			iconClassName: "icon-[solar--trash-bin-trash-linear]",
			danger: true,
			onSelect: vi.fn(),
			...overrides,
		},
	];
}

/** 等外点监听挂载（组件延后一拍挂 mousedown，避免右键那一拍立刻自关）。 */
async function waitForOutsideListener(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

describe("WeKnoraSessionContextMenu", () => {
	it("portal 渲染到 body，带 menu/menuitem 语义与坐标定位", () => {
		const onClose = vi.fn();
		render(<WeKnoraSessionContextMenu items={items()} onClose={onClose} x={120} y={40} />);

		const menu = screen.getByRole("menu");
		// createPortal 的落点是 document.body（与 project/SessionContextMenu 同一先例）。
		expect(menu.parentElement).toBe(document.body);
		expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
		expect(within(menu).getByRole("menuitem", { name: "删除会话" })).toBeTruthy();
		expect(menu.style.left).toBe("120px");
		expect(menu.style.top).toBe("40px");
	});

	it("点击菜单项：先回调 onSelect，再关闭菜单", () => {
		const onSelect = vi.fn();
		const onClose = vi.fn();
		render(<WeKnoraSessionContextMenu items={items({ onSelect })} onClose={onClose} x={0} y={0} />);

		fireEvent.click(screen.getByRole("menuitem", { name: "删除会话" }));

		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("菜单内 mousedown 不关闭；菜单外 mousedown 关闭", async () => {
		const onClose = vi.fn();
		render(<WeKnoraSessionContextMenu items={items()} onClose={onClose} x={0} y={0} />);
		await waitForOutsideListener();

		fireEvent.mouseDown(screen.getByRole("menu"));
		expect(onClose).not.toHaveBeenCalled();

		fireEvent.mouseDown(document.body);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("Escape 关闭（走统一快捷键作用域栈）", () => {
		const onClose = vi.fn();
		render(<WeKnoraSessionContextMenu items={items()} onClose={onClose} x={0} y={0} />);

		fireEvent.keyDown(document.body, { key: "Escape" });

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("禁用项置灰不可点：点击不触发 onSelect（AC-10 的载体）", () => {
		const onSelect = vi.fn();
		const onClose = vi.fn();
		render(
			<WeKnoraSessionContextMenu
				items={items({ label: "回答生成中,暂不能删除", disabled: true, onSelect })}
				onClose={onClose}
				x={0}
				y={0}
			/>,
		);

		const item = screen.getByRole("menuitem", { name: "回答生成中,暂不能删除" }) as HTMLButtonElement;
		expect(item.disabled).toBe(true);
		fireEvent.click(item);
		expect(onSelect).not.toHaveBeenCalled();
		// 禁用项点不动，菜单也不因这一拍关闭（用户还需要看见原因）。
		expect(onClose).not.toHaveBeenCalled();
	});
});
