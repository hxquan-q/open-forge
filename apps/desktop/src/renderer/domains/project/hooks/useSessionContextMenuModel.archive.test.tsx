// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import type { SessionContextMenuSession } from "@shared/store/atoms";
import { runningSessionPathsAtom } from "@shared/store/atoms";
import { toastsAtom } from "@shared/store/toast-atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, getDefaultStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * 归档入口的交互合同：普通会话与团队会话右键即可归档（可逆，不弹确认框），归档后
 * 菜单关闭、toast 给出去设置页恢复的入口；只有只读来源看不到这一项；运行中的会话
 * 置灰——归档会藏掉它唯一的进度指示。
 */

const navigateSpy = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateSpy,
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const archive = vi.fn(async () => ({ sessions: [] }));
vi.stubGlobal("window", Object.assign(globalThis.window, { vetta: { archivedSessions: { archive } } }));

const { useSessionContextMenuModel } = await import("./useSessionContextMenuModel.js");

const SESSION: SessionContextMenuSession = {
	id: "C:/sessions/login-fix.jsonl",
	path: "C:/sessions/login-fix.jsonl",
	cwd: "C:/repo",
	firstMessage: "修复登录",
	modifiedAt: 1,
};

const TEAM_SESSION: SessionContextMenuSession = {
	...SESSION,
	kind: "agent-team",
	teamId: "team",
	teamSessionId: "team-session",
	sessionTitle: "Team task",
	memberAvatarUrls: [],
};

function renderModel(options: { session?: SessionContextMenuSession; allowMutations?: boolean; running?: boolean } = {}) {
	const session = options.session ?? SESSION;
	const store = createStore();
	if (options.running) store.set(runningSessionPathsAtom, new Set([session.path]));
	const onClose = vi.fn();
	const wrapper = ({ children }: { children: ReactNode }): JSX.Element => <Provider store={store}>{children}</Provider>;
	const { result } = renderHook(
		() => useSessionContextMenuModel(session, options.allowMutations ?? true, true, onClose, vi.fn()),
		{ wrapper },
	);
	return { result, onClose };
}

describe("useSessionContextMenuModel archiving", () => {
	it("archives an idle conversation under its display name and closes the menu", () => {
		const { result, onClose } = renderModel();

		act(() => result.current.onArchive());

		expect(archive).toHaveBeenCalledWith({ path: SESSION.path, cwd: SESSION.cwd, label: "修复登录" });
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("offers a jump to the archived settings page from the toast", () => {
		const toastsStore = getDefaultStore();
		toastsStore.set(toastsAtom, []);
		const { result } = renderModel();

		act(() => result.current.onArchive());

		const toast = toastsStore.get(toastsAtom).at(-1);
		expect(toast).toMatchObject({ variant: "success", message: "contextMenu.archiveToast" });
		expect(toast?.action?.label).toBe("contextMenu.archiveToastAction");
		toast?.action?.onClick();
		expect(navigateSpy).toHaveBeenCalledWith({ to: "/settings/$tab", params: { tab: "archive" } });
	});

	it("archives an idle agent-team conversation under its team title, keeping its team identity", () => {
		const { result, onClose } = renderModel({ session: TEAM_SESSION });

		expect(result.current.canArchive).toBe(true);
		act(() => result.current.onArchive());

		// 团队身份随快照一起存：设置页删除时据此走团队级删除，而不是普通会话删除。
		expect(archive).toHaveBeenCalledWith({
			path: TEAM_SESSION.path,
			cwd: TEAM_SESSION.cwd,
			label: "Team task",
			teamId: "team",
			teamSessionId: "team-session",
		});
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("falls back to the untitled-team name when archiving a nameless team conversation", () => {
		const { result } = renderModel({ session: { ...TEAM_SESSION, sessionTitle: "" } as SessionContextMenuSession });

		act(() => result.current.onArchive());

		// 与侧栏行同名：未命名团队会话在设置页里也是团队占位名，而不是「未命名会话」。
		expect(archive).toHaveBeenCalledWith(expect.objectContaining({ label: "sidebar.session.untitledTeam" }));
	});

	it("hides archiving only for read-only sources", () => {
		expect(renderModel().result.current.canArchive).toBe(true);
		expect(renderModel({ session: TEAM_SESSION }).result.current.canArchive).toBe(true);
		expect(renderModel({ allowMutations: false }).result.current.canArchive).toBe(false);
	});

	it("disables archiving while the session is running, with the reason as its label", () => {
		const { result } = renderModel({ running: true });
		const team = renderModel({ session: TEAM_SESSION, running: true });

		expect(result.current.canArchive).toBe(true);
		expect(result.current.archiveDisabled).toBe(true);
		expect(result.current.labels.archiveDisabled).toBe("contextMenu.archiveDisabled");
		// 团队会话同样先停再归档：藏掉行会丢掉它唯一的运行指示。
		expect(team.result.current.archiveDisabled).toBe(true);
	});
});
