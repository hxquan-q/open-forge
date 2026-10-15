// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import type { Project, SessionInfo } from "@shared/store/atoms";
import { archivedSessionsAtom } from "@shared/store/atoms";
import { renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SidebarConversationInfo } from "../services/sidebar-conversation-projection";

/**
 * 归档在侧边栏两个列表里的可见性合同：直连对话（默认对话区）与项目分组都
 * 不再显示已归档会话，折叠计数按剩下的行重算，未归档的行分毫不动。
 */

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: "zh" } }),
}));

const { useDefaultSessionListModel } = await import("./useDefaultSessionListModel.js");
const { useProjectGroupModel } = await import("./useProjectGroupModel.js");

const CWD = "/home/user/.vetta/desktop-app/conversation";

function session(path: string, modifiedAt = 1): SidebarConversationInfo {
	return {
		kind: "conversation",
		id: path,
		path,
		cwd: CWD,
		firstMessage: path,
		modifiedAt,
	} satisfies { kind: "conversation" } & SessionInfo;
}

function archivedSnapshot(paths: readonly string[]) {
	return { sessions: paths.map((path) => ({ path, label: path, cwd: CWD, archivedAt: 1 })) };
}

function wrapperWith(store: ReturnType<typeof createStore>) {
	return ({ children }: { children: ReactNode }): JSX.Element => <Provider store={store}>{children}</Provider>;
}

const ARCHIVED = session(`${CWD}/archived.jsonl`, 3);
const KEPT = session(`${CWD}/kept.jsonl`, 2);
const ARCHIVED_TEAM: SidebarConversationInfo = {
	kind: "agent-team",
	id: "team-session",
	path: `${CWD}/team.jsonl`,
	cwd: CWD,
	firstMessage: "Team task",
	modifiedAt: 4,
	teamId: "team",
	teamSessionId: "team-session",
	memberAvatarUrls: [],
	sessionTitle: "Team task",
};

function renderDefaultList(archivedPaths: readonly string[], sessions: SidebarConversationInfo[] = [ARCHIVED, KEPT]) {
	const store = createStore();
	store.set(archivedSessionsAtom, archivedSnapshot(archivedPaths));
	return renderHook(
		() =>
			useDefaultSessionListModel({
				activeSessionPath: "",
				activeTeamSessionId: "",
				cwd: CWD,
				filter: "conversation",
				onNewSession: () => {},
				onRenameSession: () => {},
				onSelectSession: () => {},
				sessions,
			}),
		{ wrapper: wrapperWith(store) },
	);
}

const PROJECT: Project = { cwd: "C:/repo", name: "repo", sessionCount: 6, type: "normal" };

function renderProjectGroup(archivedPaths: readonly string[]) {
	const store = createStore();
	store.set(archivedSessionsAtom, archivedSnapshot(archivedPaths));
	// 6 条会话、折叠档为 5：归档一条后正好收回折叠态，计数可见地变化。
	const sessions = Array.from({ length: 6 }, (_, index) => session(`C:/repo/s${index}.jsonl`, 100 - index));
	return renderHook(
		() =>
			useProjectGroupModel({
				activeSessionPath: "",
				activeTeamSessionId: "",
				isExpanded: true,
				onCollapse: () => {},
				onExpand: () => {},
				onNavigateProject: () => {},
				onNewSession: () => {},
				onRenameSession: () => {},
				onSelectSession: () => {},
				project: PROJECT,
				sessions,
			}),
		{ wrapper: wrapperWith(store) },
	);
}

describe("archived sessions in the direct conversation list", () => {
	it("hides the archived conversation and keeps the rest", () => {
		const { result } = renderDefaultList([ARCHIVED.path]);

		expect(result.current.sessions.map((view) => view.path)).toEqual([KEPT.path]);
		expect(result.current.totalCount).toBe(1);
	});

	it("shows every conversation when nothing is archived", () => {
		const { result } = renderDefaultList([]);

		expect(result.current.sessions.map((view) => view.path)).toEqual([ARCHIVED.path, KEPT.path]);
	});

	it("hides an archived agent-team conversation the same way as an ordinary one", () => {
		const { result } = renderDefaultList([ARCHIVED_TEAM.path], [ARCHIVED_TEAM, KEPT]);

		// 团队会话走同一条过滤管线：归档后行消失，其余行原样保留。
		expect(result.current.sessions.map((view) => view.path)).toEqual([KEPT.path]);
		expect(result.current.sessions[0]?.session.kind).toBe("conversation");
	});
});

describe("archived sessions in a project group", () => {
	it("hides the archived session and recomputes the collapsed count", () => {
		const archived = renderProjectGroup(["C:/repo/s5.jsonl"]);
		expect(archived.result.current.sessionViews.map((view) => view.path)).toEqual([
			"C:/repo/s0.jsonl",
			"C:/repo/s1.jsonl",
			"C:/repo/s2.jsonl",
			"C:/repo/s3.jsonl",
			"C:/repo/s4.jsonl",
		]);
		expect(archived.result.current.hiddenCount).toBe(0);
		expect(archived.result.current.hasMoreSessions).toBe(false);
	});

	it("still collapses the group when archiving does not empty the overflow", () => {
		const { result } = renderProjectGroup([]);

		expect(result.current.sessionViews).toHaveLength(5);
		expect(result.current.hiddenCount).toBe(1);
		expect(result.current.hasMoreSessions).toBe(true);
	});
});
