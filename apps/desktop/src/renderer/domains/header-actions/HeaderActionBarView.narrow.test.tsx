// Modified by The Open Forge contributors.
// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HeaderActionBarItem, HeaderActionBarLabels } from "@vetta-org/theme-ui/chat";
import { HeaderActionBarView } from "@vetta-org/theme-ui/chat";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const labels: HeaderActionBarLabels = {
	customize: "自定义顶栏",
	moveToTop: "放到顶栏",
	topFull: "顶栏已满",
	moveToTray: "收纳",
	adjust: "调整",
	done: "完成",
	more: "更多操作",
	close: "关闭",
};

function action(
	key: string,
	title: string,
	onClick: () => void,
	extra: Partial<HeaderActionBarItem> = {},
): HeaderActionBarItem {
	return {
		key,
		title,
		icon: <span aria-hidden="true">{title}</span>,
		behavior: { type: "click", onClick },
		...extra,
	};
}

function renderBar(
	crowded: boolean,
	top: readonly HeaderActionBarItem[],
	tray: readonly HeaderActionBarItem[] = [],
): void {
	render(
		<HeaderActionBarView
			crowded={crowded}
			top={top}
			tray={tray}
			maxTop={7}
			labels={labels}
			onMove={() => undefined}
			pinned={<button type="button">活动面板</button>}
		/>,
	);
}

describe("会话顶栏在极窄时收成下拉菜单", () => {
	it("把置顶和活动面板留在外面，其余动作收进更多菜单，点选后仍会执行", async () => {
		const user = userEvent.setup();
		const selected: string[] = [];
		const select = (id: string) => () => {
			selected.push(id);
		};
		renderBar(
			true,
			[
				action("builtin:export", "导出", select("export")),
				action("builtin:pin", "窗口置顶", select("pin"), { retainWhenNarrow: true, active: true }),
				action("builtin:terminal", "终端", select("terminal")),
			],
			[action("builtin:bottom-panel", "底部面板", select("bottom-panel"))],
		);

		expect(screen.getByRole("button", { name: "窗口置顶" }).getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByRole("button", { name: "活动面板" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "导出" })).toBeNull();
		expect(screen.queryByRole("button", { name: "终端" })).toBeNull();
		expect(screen.queryByRole("button", { name: "自定义顶栏" })).toBeNull();

		await user.click(screen.getByRole("button", { name: "更多操作" }));
		expect(screen.queryByRole("menuitem", { name: "窗口置顶" })).toBeNull();
		await user.click(screen.getByRole("menuitem", { name: "导出" }));
		expect(selected).toEqual(["export"]);

		await user.click(screen.getByRole("button", { name: "更多操作" }));
		await user.click(screen.getByRole("menuitem", { name: "底部面板" }));
		expect(selected).toEqual(["export", "bottom-panel"]);
	});

	it("窗口够宽时仍把每个动作摊开，不出现更多菜单", () => {
		renderBar(false, [
			action("builtin:export", "导出", vi.fn()),
			action("builtin:pin", "窗口置顶", vi.fn(), { retainWhenNarrow: true }),
		]);
		expect(screen.getByRole("button", { name: "导出" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "窗口置顶" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "更多操作" })).toBeNull();
	});

	it.each(["top", "tray", "overflow"])("keeps the dialog host when the action is in %s", async (placement) => {
		const user = userEvent.setup();
		const item = action("plugin:demo:settings", "设置", vi.fn(), {
			behavior: {
				type: "popover",
				host: "dialog",
				size: "lg",
				dialogTitle: "自定义设置",
				render: ({ close }) => (
					<button type="button" onClick={close}>
						保存
					</button>
				),
			},
		});
		const base = action("builtin:export", "导出", vi.fn());
		renderBar(placement === "overflow", placement === "tray" ? [base] : [item], placement === "tray" ? [item] : []);

		if (placement === "overflow") {
			await user.click(screen.getByRole("button", { name: labels.more }));
			await user.click(screen.getByRole("menuitem", { name: "设置" }));
		} else {
			if (placement === "tray") await user.click(screen.getByRole("button", { name: labels.customize }));
			await user.click(screen.getByRole("button", { name: "设置" }));
		}
		const dialog = await screen.findByRole("dialog", { name: "自定义设置" });
		expect(dialog.classList.contains("max-w-[min(92vw,32rem)]")).toBe(true);
		expect(screen.getByRole("button", { name: labels.close })).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "保存" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		if (placement === "overflow") {
			await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: labels.more })));
		}
	});

	it("置顶被收进托盘时，挤窄后仍然露在活动面板旁边", () => {
		renderBar(
			true,
			[action("builtin:export", "导出", vi.fn())],
			[action("builtin:pin", "窗口置顶", vi.fn(), { retainWhenNarrow: true })],
		);
		expect(screen.getByRole("button", { name: "窗口置顶" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "导出" })).toBeNull();
	});
});
