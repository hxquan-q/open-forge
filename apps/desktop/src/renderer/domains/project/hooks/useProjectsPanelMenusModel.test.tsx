// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import { confirmDialogAtom } from "@shared/store/atoms";
import { toastsAtom } from "@shared/store/toast-atoms";
import { createStore, getDefaultStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectsPanelModel } from "../components/sidebar/projects/panel/types";
import { useProjectsPanelMenusModel } from "./useProjectsPanelMenusModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

// 删除确认后还要摘掉该会话的标签标注与归档标记，走 preload 的 conversationTags / archivedSessions 通道；
// 项目会话导出走 sessionArchive.exportProject，迁移包导出走 sessionArchive.exportMigration。
const forgetConversations = vi.fn();
const forgetArchivedSessions = vi.fn();
type ExportProjectResult = { saved: boolean; sessionCount?: number; reason?: "no-sessions" };
const exportProject = vi.fn(async (): Promise<ExportProjectResult> => ({ saved: true, sessionCount: 2 }));
type ExportMigrationResult = {
	saved: boolean;
	path?: string;
	sessionCount?: number;
	workspaceFileCount?: number;
	reason?: "no-sessions" | "remote-unsupported" | "workspace-too-large";
	detail?: string;
};
const exportMigration = vi.fn(async (): Promise<ExportMigrationResult> => ({
	saved: true,
	sessionCount: 2,
	workspaceFileCount: 7,
}));
vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			conversationTags: { forgetConversations },
			archivedSessions: { forget: forgetArchivedSessions },
			sessionArchive: { exportProject, exportMigration },
		},
	}),
);

const teamSession = {
	kind: "agent-team" as const,
	id: "team-session",
	path: "C:/sessions/team.jsonl",
	cwd: "C:/team-workspaces/team-session",
	firstMessage: "Team task",
	modifiedAt: 1,
	teamId: "team",
	teamSessionId: "team-session",
	sessionTitle: "Team task",
	memberAvatarUrls: [],
};

function model(deleteSession: ReturnType<typeof vi.fn>): ProjectsPanelModel {
	return {
		defaultConversationFilter: "conversation",
		imCwd: "C:/im",
		projectSessions: () => [],
		actions: { deleteSession },
	} as unknown as ProjectsPanelModel;
}

describe("useProjectsPanelMenusModel", () => {
	beforeEach(() => {
		forgetConversations.mockClear();
		forgetArchivedSessions.mockClear();
		exportProject.mockReset();
		exportProject.mockResolvedValue({ saved: true, sessionCount: 2 });
		exportMigration.mockReset();
		exportMigration.mockResolvedValue({ saved: true, sessionCount: 2, workspaceFileCount: 7 });
		getDefaultStore().set(toastsAtom, []);
	});

	it("asks for confirmation before deleting a Team session and deletes only after confirmation", () => {
		const store = createStore();
		const deleteSession = vi.fn();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(deleteSession)), { wrapper });

		act(() => result.current.actions.deleteSession(teamSession));

		const confirmation = store.get(confirmDialogAtom);
		expect(deleteSession).not.toHaveBeenCalled();
		expect(confirmation).toMatchObject({
			title: "sidebar.dialogs.deleteSessionTitle",
			message: "sidebar.dialogs.deleteSessionMessage",
			confirmLabel: "sidebar.dialogs.deleteConfirm",
			variant: "danger",
		});

		act(() => confirmation?.onConfirm(false));
		expect(deleteSession).toHaveBeenCalledWith(teamSession);
	});

	it("clears the deleted session's tag and archive flags", () => {
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(vi.fn())), { wrapper });

		act(() => result.current.actions.deleteSession(teamSession));
		act(() => store.get(confirmDialogAtom)?.onConfirm(false));

		expect(forgetConversations).toHaveBeenCalledWith([teamSession.path]);
		expect(forgetArchivedSessions).toHaveBeenCalledWith([teamSession.path]);
	});

	it("asks for the archive passphrase before exporting project sessions, then reports the count via toast", async () => {
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(vi.fn())), { wrapper });

		act(() => result.current.actions.exportProjectSessions("C:/repo", "My Repo"));

		const confirmation = store.get(confirmDialogAtom);
		expect(exportProject).not.toHaveBeenCalled();
		expect(confirmation).toMatchObject({
			title: "contextMenu.exportSessions",
			message: "projectExport.passphrasePrompt",
			input: { password: true },
		});

		await act(async () => confirmation?.onConfirm(false, "pw"));

		expect(exportProject).toHaveBeenCalledWith({
			cwd: "C:/repo",
			passphrase: "pw",
			defaultFileName: "My Repo",
		});
		expect(getDefaultStore().get(toastsAtom)).toEqual([
			expect.objectContaining({ variant: "success", message: "projectExport.done" }),
		]);
	});

	it("omits the default file name when the project has no stored name", async () => {
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(vi.fn())), { wrapper });

		act(() => result.current.actions.exportProjectSessions("C:/repo"));
		await act(async () => store.get(confirmDialogAtom)?.onConfirm(false, ""));

		expect(exportProject).toHaveBeenCalledWith({ cwd: "C:/repo", passphrase: "", defaultFileName: undefined });
	});

	it("informs instead of failing when the project has no sessions to export", async () => {
		exportProject.mockResolvedValueOnce({ saved: false, reason: "no-sessions" });
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(vi.fn())), { wrapper });

		act(() => result.current.actions.exportProjectSessions("C:/empty"));
		await act(async () => store.get(confirmDialogAtom)?.onConfirm(false, ""));

		expect(getDefaultStore().get(toastsAtom)).toEqual([
			expect.objectContaining({ variant: "info", message: "projectExport.noSessions" }),
		]);
	});

	it("reports export failures as an error toast", async () => {
		exportProject.mockRejectedValueOnce(new Error("disk full"));
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(vi.fn())), { wrapper });

		act(() => result.current.actions.exportProjectSessions("C:/repo"));
		await act(async () => store.get(confirmDialogAtom)?.onConfirm(false, ""));

		expect(getDefaultStore().get(toastsAtom)).toEqual([
			expect.objectContaining({ variant: "error", message: "projectExport.failed" }),
		]);
	});

	it("asks for the migration passphrase with the include-workspace checkbox (default on), then reports counts via toast", async () => {
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(vi.fn())), { wrapper });

		act(() => result.current.actions.exportMigrationPackage("C:/repo", "My Repo"));

		const confirmation = store.get(confirmDialogAtom);
		expect(exportMigration).not.toHaveBeenCalled();
		expect(confirmation).toMatchObject({
			title: "contextMenu.exportMigration",
			input: { password: true },
			checkbox: { label: "migrationExport.includeWorkspace", checked: true },
		});

		await act(async () => confirmation?.onConfirm(true, "pw"));

		expect(exportMigration).toHaveBeenCalledWith({
			cwd: "C:/repo",
			passphrase: "pw",
			includeWorkspace: true,
			defaultFileName: "My Repo",
		});
		expect(getDefaultStore().get(toastsAtom)).toEqual([
			expect.objectContaining({ variant: "success", message: "migrationExport.done" }),
		]);
	});

	it("forwards an unchecked include-workspace checkbox as false", async () => {
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(vi.fn())), { wrapper });

		act(() => result.current.actions.exportMigrationPackage("C:/repo"));
		await act(async () => store.get(confirmDialogAtom)?.onConfirm(false, ""));

		expect(exportMigration).toHaveBeenCalledWith({
			cwd: "C:/repo",
			passphrase: "",
			includeWorkspace: false,
			defaultFileName: undefined,
		});
	});

	it("distinguishes no-sessions / remote / too-large migration export outcomes in toasts", async () => {
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(vi.fn())), { wrapper });

		exportMigration.mockResolvedValueOnce({ saved: false, reason: "no-sessions" });
		act(() => result.current.actions.exportMigrationPackage("C:/empty"));
		await act(async () => store.get(confirmDialogAtom)?.onConfirm(false, ""));
		expect(getDefaultStore().get(toastsAtom)).toEqual([
			expect.objectContaining({ variant: "info", message: "migrationExport.noSessions" }),
		]);

		getDefaultStore().set(toastsAtom, []);
		exportMigration.mockResolvedValueOnce({ saved: false, reason: "remote-unsupported" });
		act(() => result.current.actions.exportMigrationPackage("ssh://h/p"));
		await act(async () => store.get(confirmDialogAtom)?.onConfirm(false, ""));
		expect(getDefaultStore().get(toastsAtom)).toEqual([
			expect.objectContaining({ variant: "warning", message: "migrationExport.remoteUnsupported" }),
		]);

		getDefaultStore().set(toastsAtom, []);
		exportMigration.mockResolvedValueOnce({ saved: false, reason: "workspace-too-large", detail: "big.bin" });
		act(() => result.current.actions.exportMigrationPackage("C:/huge"));
		await act(async () => store.get(confirmDialogAtom)?.onConfirm(false, ""));
		expect(getDefaultStore().get(toastsAtom)).toEqual([
			expect.objectContaining({ variant: "warning", message: "migrationExport.tooLarge" }),
		]);
	});

	it("reports migration export failures as an error toast", async () => {
		exportMigration.mockRejectedValueOnce(new Error("disk full"));
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(vi.fn())), { wrapper });

		act(() => result.current.actions.exportMigrationPackage("C:/repo"));
		await act(async () => store.get(confirmDialogAtom)?.onConfirm(false, ""));

		expect(getDefaultStore().get(toastsAtom)).toEqual([
			expect.objectContaining({ variant: "error", message: "migrationExport.failed" }),
		]);
	});
});
