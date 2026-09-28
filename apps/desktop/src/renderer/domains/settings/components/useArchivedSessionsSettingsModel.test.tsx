// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { confirmDialogAtom } from "@shared/store/atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 已归档会话的管理合同：列表来自归档仓库快照（新→旧），取消归档把行放回侧边栏，
 * 「删除」是永久删除——先确认，再删会话文件并清掉归档标记。
 */

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, unknown>) =>
			values ? `${key}:${JSON.stringify(values)}` : key,
		i18n: { language: "zh-CN" },
	}),
}));

const list = vi.fn();
const unarchive = vi.fn(async () => ({ sessions: [] }));
const forget = vi.fn(async () => ({ sessions: [] }));
const deleteSession = vi.fn(async () => undefined);
vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: { archivedSessions: { list, unarchive, forget }, session: { delete: deleteSession } },
	}),
);

const { useArchivedSessionsSettingsModel } = await import("./useArchivedSessionsSettingsModel.js");

const RECENT = {
	path: "C:/sessions/login-fix.jsonl",
	label: "修复登录",
	cwd: "C:/repo",
	archivedAt: Date.UTC(2026, 0, 15),
};
const OLDER = { path: "C:/sessions/refactor.jsonl", label: "", cwd: "C:/repo", archivedAt: Date.UTC(2025, 5, 1) };

function renderModel() {
	const store = createStore();
	const wrapper = ({ children }: { children: ReactNode }): JSX.Element => <Provider store={store}>{children}</Provider>;
	const { result } = renderHook(() => useArchivedSessionsSettingsModel(), { wrapper });
	return { result, store };
}

beforeEach(() => {
	vi.clearAllMocks();
	list.mockResolvedValue({ sessions: [RECENT, OLDER] });
});

describe("useArchivedSessionsSettingsModel", () => {
	it("lists the archived sessions newest-first with a formatted archive date", async () => {
		const { result } = renderModel();

		await waitFor(() => expect(result.current.sessions).toHaveLength(2));
		expect(result.current.sessions.map((item) => item.path)).toEqual([RECENT.path, OLDER.path]);
		// 未命名会话回落到文件名，行内不会只剩一个日期。
		expect(result.current.sessions.map((item) => item.name)).toEqual(["修复登录", "refactor.jsonl"]);
		expect(result.current.sessions[0]?.archivedAtLabel).toContain("archivedAt");
		expect(result.current.sessions[0]?.archivedAtLabel).toContain("2026");
	});

	it("unarchives one session without disturbing the others", async () => {
		const { result } = renderModel();
		await waitFor(() => expect(result.current.sessions).toHaveLength(2));

		await act(() => result.current.actions.unarchive(RECENT.path));

		expect(unarchive).toHaveBeenCalledWith(RECENT.path);
		expect(result.current.sessions.map((item) => item.path)).toEqual([OLDER.path]);
	});

	it("deletes a session permanently only after confirmation, clearing its archive flag", async () => {
		const { result, store } = renderModel();
		await waitFor(() => expect(result.current.sessions).toHaveLength(2));

		act(() => result.current.actions.delete(RECENT.path));

		const confirmation = store.get(confirmDialogAtom);
		expect(deleteSession).not.toHaveBeenCalled();
		expect(confirmation).toMatchObject({
			title: "deleteArchivedSessionConfirm",
			confirmLabel: "archiveDelete",
			variant: "danger",
		});
		expect(confirmation?.message).toContain("修复登录");

		act(() => confirmation?.onConfirm(false));
		await waitFor(() => expect(result.current.sessions.map((item) => item.path)).toEqual([OLDER.path]));
		expect(deleteSession).toHaveBeenCalledWith(RECENT.path);
		expect(forget).toHaveBeenCalledWith([RECENT.path]);
	});
});
