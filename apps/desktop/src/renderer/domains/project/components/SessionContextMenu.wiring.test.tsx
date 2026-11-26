// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import type { AgentTeamSessionInfo, SessionInfo } from "@shared/store/atoms";
import { INITIAL_SPACES, spacesAtom } from "@shared/store/spaces";
import { render } from "@testing-library/react";
import type { ContextMenuNode } from "@vetta-org/theme-ui/shared";
import { createStore, Provider } from "jotai";
import type { JSX, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionContextMenu } from "./SessionContextMenu";

/**
 * 「移动到工作空间」入口的接线门控（ADR-0156）：
 * - 默认区独立普通会话有移动入口（生产形状：投影后带 kind: "conversation"，
 *   见 services/sidebar-conversation-projection.ts；门控若按「存在 kind」判会把
 *   普通会话整批误判成不可移动，这是本文件必须钉住的回归）；
 * - 团队会话归属键不存在（归属统一按会话路径），不可移动；
 * - 项目内会话（independent=false）随项目走，不可移动。
 * 会话编辑模型替换成 fake——这里只测「组件怎么把模型输出与移动菜单拼给 View」，
 * 模型本身的条目逻辑在 useSessionContextMenuModel 自己的测试里。
 */

const captured = vi.hoisted(() => ({ props: null as null | { extraItems?: readonly ContextMenuNode[] } }));
const baseItems = vi.hoisted(() => [{ kind: "item", id: "rename", label: "rename", onSelect: () => {} } as ContextMenuNode]);

vi.mock("../hooks/useSessionContextMenuModel", () => ({
	useSessionContextMenuModel: () => ({
		extraItems: baseItems,
	}),
}));

vi.mock("@vetta-org/theme-ui/project", () => ({
	SessionContextMenuView: (props: { extraItems?: readonly ContextMenuNode[] }): null => {
		captured.props = props;
		return null;
	},
}));

vi.mock("@tanstack/react-router", () => ({
	useLocation: (options?: { select?: (location: { pathname: string }) => unknown }) => {
		const location = { pathname: "/" };
		return options?.select ? options.select(location) : location;
	},
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const PLAIN_SESSION: SessionInfo = {
	id: "s-1",
	path: "/conv/s-1.jsonl",
	cwd: "/conv",
	firstMessage: "hello",
	modifiedAt: 1,
};
// 生产形状：默认区投影后的普通会话带 kind: "conversation"
//（SessionInfo 未声明该键，用交叉类型表达投影形状，同 default-session-list-tag-filter.test.tsx）。
const PROJECTED_SESSION: SessionInfo & { readonly kind: "conversation" } = { ...PLAIN_SESSION, kind: "conversation" };
const TEAM_SESSION: AgentTeamSessionInfo = {
	...PLAIN_SESSION,
	kind: "agent-team",
	teamId: "team-1",
	teamSessionId: "ts-1",
	sessionTitle: "团队甲",
	memberAvatarUrls: [],
};

function renderMenu(session: SessionInfo | AgentTeamSessionInfo, independent: boolean) {
	const store = createStore();
	store.set(spacesAtom, INITIAL_SPACES);
	const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
		<Provider store={store}>{children}</Provider>
	);
	return render(
		<SessionContextMenu
			x={10}
			y={10}
			session={session}
			allowMutations
			canTag
			independent={independent}
			onClose={() => {}}
			onDelete={() => {}}
		/>,
		{ wrapper },
	);
}

function moveNode() {
	return captured.props?.extraItems?.find((item) => item.kind === "submenu" && item.id === "move-space");
}

describe("SessionContextMenu 的移动入口接线", () => {
	beforeEach(() => {
		captured.props = null;
	});

	it("默认区独立普通会话：移动子菜单追加在模型 extraItems 末尾", () => {
		renderMenu(PROJECTED_SESSION, true);
		const items = captured.props?.extraItems ?? [];
		expect(items.map((item) => item.id)).toEqual(["rename", "move-space"]);
		expect(moveNode()).toMatchObject({ label: "spaces.move" });
	});

	it("团队会话不可移动：即使独立也没有移动入口", () => {
		renderMenu(TEAM_SESSION, true);
		expect(captured.props?.extraItems?.map((item) => item.id)).toEqual(["rename"]);
		expect(moveNode()).toBeUndefined();
	});

	it("项目内会话（independent=false）没有移动入口", () => {
		renderMenu(PROJECTED_SESSION, false);
		expect(captured.props?.extraItems?.map((item) => item.id)).toEqual(["rename"]);
		expect(moveNode()).toBeUndefined();
	});
});
