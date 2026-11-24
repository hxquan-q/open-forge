// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import type { SessionContextMenuSession } from "@shared/store/atoms";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * BUG-0195：数据文件缺失的团队会话在会话右键菜单里只保留「删除」——打开/改名/
 * 归档/置顶/打开所在文件夹/标签 submenu 全部隐藏，删除走已有降级链路（BUG-0087）。
 */

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const { useSessionContextMenuModel } = await import("./useSessionContextMenuModel.js");

const TEAM_SESSION: SessionContextMenuSession = {
	id: "C:/sessions/team.jsonl",
	path: "C:/sessions/team.jsonl",
	cwd: "C:/repo",
	firstMessage: "团队任务",
	modifiedAt: 1,
	kind: "agent-team",
	teamId: "team",
	teamSessionId: "team-session",
	sessionTitle: "Team task",
	memberAvatarUrls: [],
};

function renderModel(session: SessionContextMenuSession) {
	const { result } = renderHook(() =>
		useSessionContextMenuModel(session, true, true, vi.fn(), vi.fn()),
	);
	return result.current;
}

describe("useSessionContextMenuModel（BUG-0195 数据文件缺失门控）", () => {
	it("缺失条目只保留删除：置顶/归档/重命名/打开文件夹与标签 submenu 全部收起", () => {
		const menu = renderModel({ ...TEAM_SESSION, dataFileMissing: true });
		expect(menu.canPin).toBe(false);
		expect(menu.canArchive).toBe(false);
		expect(menu.canRename).toBe(false);
		expect(menu.canOpenInFolder).toBe(false);
		expect(menu.canDelete).toBe(true);
		expect(menu.extraItems).toBeUndefined();
	});

	it("文件在的团队会话菜单能力不变（对照）", () => {
		const menu = renderModel(TEAM_SESSION);
		expect(menu.canPin).toBe(true);
		expect(menu.canArchive).toBe(true);
		expect(menu.canRename).toBe(true);
		expect(menu.canOpenInFolder).toBe(true);
		expect(menu.canDelete).toBe(true);
	});
});
