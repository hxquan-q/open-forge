// @vitest-environment jsdom
/**
 * 指引浮条里「不再提示」曾嵌在正文按钮内部，命中 axe `nested-interactive`
 * （BUG-0039）：嵌套的可聚焦控件会让键盘与读屏语义混乱。两者现在是并列控件。
 */
import { cleanup, render, screen } from "@testing-library/react";
import { GuideBadgeSwiperView } from "@vetta-org/theme-ui/chat";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

function renderBadge(dismissible: boolean) {
	const onClick = vi.fn();
	const onDismiss = vi.fn();
	render(
		<GuideBadgeSwiperView
			mounted
			current={{
				id: "quick-panel",
				icon: "icon-[solar--magnifer-linear]",
				text: "开启快捷面板",
				dismissible,
				onClick,
			}}
			labels={{ dismissTooltip: "不再提示" }}
			onDismiss={onDismiss}
		/>,
	);
	return { onClick, onDismiss };
}

describe("GuideBadgeSwiperView 的控件边界", () => {
	it("正文动作里没有嵌套的可聚焦控件，点击走自己的回调", async () => {
		const { onClick, onDismiss } = renderBadge(true);

		const action = screen.getByRole("button", { name: "开启快捷面板" });
		expect(action.querySelector("button,[role='button']")).toBeNull();

		await userEvent.setup().click(action);
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(onDismiss).not.toHaveBeenCalled();
	});

	it("「不再提示」是并列按钮，只触发 dismiss，不触发正文动作", async () => {
		const { onClick, onDismiss } = renderBadge(true);

		await userEvent.setup().click(screen.getByRole("button", { name: "不再提示" }));

		expect(onDismiss).toHaveBeenCalledExactlyOnceWith("quick-panel");
		expect(onClick).not.toHaveBeenCalled();
	});

	it("「不再提示」可经键盘 Tab 聚焦：独立控件不再藏在负 tabindex 里", () => {
		renderBadge(true);
		expect(screen.getByRole("button", { name: "不再提示" }).tabIndex).toBe(0);
	});

	it("不可关闭的浮条没有「不再提示」控件", () => {
		renderBadge(false);
		expect(screen.queryByRole("button", { name: "不再提示" })).toBeNull();
	});
});
