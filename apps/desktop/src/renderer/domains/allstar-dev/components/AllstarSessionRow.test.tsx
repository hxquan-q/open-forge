// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块会话行的 BUG-0195 合同：数据文件缺失的团队会话置灰、打开按钮禁用、
 * 「···」菜单只剩「删除」；团队标题为空时落到与侧栏一致的兜底名；正常行的
 * 重命名连续操作路径（菜单 → 重命名 → 输入 → Enter → onRename 回调）不回归。
 *
 * radix 浮层原语在 jsdom 下依赖布局 API，沿用 AllstarDevHomePageView.test.tsx 的
 * 轻量等价实现：被测的是菜单树裁剪与回调路由，开合定位交给 radix 自己的测试。
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AllstarDevCardSession, AllstarDevHomePageModel } from "../hooks/useAllstarDevHomePageModel";
import { AllstarSessionRow } from "./AllstarSessionRow";

vi.mock("@shared/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
	DropdownMenuItem: ({ children, onSelect }: { children?: ReactNode; onSelect?: (event: Event) => void }) => (
		<div
			role="menuitem"
			tabIndex={0}
			onClick={() => onSelect?.({} as Event)}
			onKeyDown={(event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				onSelect?.({} as Event);
			}}
		>
			{children}
		</div>
	),
	DropdownMenuSeparator: () => <hr />,
}));

const LABELS = {
	sessionActions: "会话操作",
	renameSession: "重命名",
	revealSessionInFolder: "打开会话数据目录",
	deleteSession: "删除",
	untitledTeamSession: "新团队会话",
} as const satisfies Pick<
	AllstarDevHomePageModel["labels"],
	"sessionActions" | "renameSession" | "revealSessionInFolder" | "deleteSession" | "untitledTeamSession"
>;

const TEAM_SESSION: AllstarDevCardSession = {
	kind: "team",
	path: "C:/sessions/team.jsonl",
	title: "团队彩排",
	modifiedAt: 1,
	teamId: "team-1",
	teamSessionId: "ts-1",
};

function renderRow(session: AllstarDevCardSession, overrides: Partial<Parameters<typeof AllstarSessionRow>[0]> = {}) {
	const onOpen = vi.fn();
	const onRename = vi.fn();
	const onDelete = vi.fn();
	const onReveal = vi.fn();
	render(
		<AllstarSessionRow
			cwd="/proj/a"
			session={session}
			// 行测试只关心会话行的键；其余 labels 键与本组件无关，用缺省占位即可。
			labels={LABELS as unknown as AllstarDevHomePageModel["labels"]}
			onOpen={onOpen}
			onRename={onRename}
			onDelete={onDelete}
			onReveal={onReveal}
			{...overrides}
		/>,
	);
	return { onOpen, onRename, onDelete, onReveal };
}

describe("AllstarSessionRow（BUG-0195）", () => {
	it("数据文件缺失的团队会话：打开按钮禁用、菜单只剩「删除」", async () => {
		const handlers = renderRow({ ...TEAM_SESSION, dataFileMissing: true });
		const openButton = screen.getByRole("button", { name: "团队彩排" });
		expect(openButton).toHaveProperty("disabled", true);
		fireEvent.click(openButton);
		expect(handlers.onOpen).not.toHaveBeenCalled();

		await userEvent.click(screen.getByRole("button", { name: "会话操作" }));
		const items = screen.getAllByRole("menuitem");
		expect(items).toHaveLength(1);
		expect(items[0]?.textContent).toContain("删除");
	});

	it("团队标题为空时显示与侧栏一致的兜底名", () => {
		renderRow({ ...TEAM_SESSION, title: "" });
		expect(screen.getByRole("button", { name: "新团队会话" }).textContent).toContain("新团队会话");
	});

	it("正常会话：菜单三项齐全，重命名 → 输入 → Enter 走 onRename 连续路径", async () => {
		const handlers = renderRow(TEAM_SESSION);
		await userEvent.click(screen.getByRole("button", { name: "会话操作" }));
		expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
			"重命名",
			"打开会话数据目录",
			"删除",
		]);

		await userEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
		const input = screen.getByRole("textbox", { name: "重命名" });
		await userEvent.clear(input);
		await userEvent.type(input, "新会话名{Enter}");
		expect(handlers.onRename).toHaveBeenCalledWith("/proj/a", expect.objectContaining({ kind: "team" }), "新会话名");
	});
});
