// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 侧栏「Allstar自主开发」入口高亮合同（BUG-0187）：高亮口径复用 root-layout 的
 * useCodingLayoutState——团队会话路由（含成员子路由）命中高亮；code 会话与
 * /allstar 的既有高亮不回归；普通路由不高亮。旧实现的三子句判定不含团队路由，
 * 「团队路由高亮」必红。
 */
import { renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ current: { pathname: "/" } }));

vi.mock("@tanstack/react-router", () => ({
	useMatches: () => [{ pathname: routeState.current.pathname }],
	useSearch: () => ({}),
	useNavigate: () => vi.fn(async () => undefined),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { activeSessionAtom } from "@shared/store/atoms";
import { ALLSTAR_DEV_NAV_KEY } from "./sidebar-nav-layout";
import { useSidebarModel } from "./useSidebarModel";

const store = getDefaultStore();

function setRoute(pathname: string): void {
	routeState.current = { pathname };
}

function allstarActive(): boolean {
	const { result } = renderHook(() => useSidebarModel({ onCollapse: () => undefined }));
	const item = result.current.navItems.find((candidate) => candidate.key === ALLSTAR_DEV_NAV_KEY);
	if (!item) throw new Error("allstar nav item missing");
	return Boolean(item.active);
}

beforeEach(() => {
	localStorage.clear();
	store.set(activeSessionAtom, null);
	setRoute("/");
});

describe("侧栏 Allstar 入口高亮（团队路由复用版块态判定）", () => {
	it("团队会话路由与成员子路由都高亮（旧实现必红点）", () => {
		setRoute("/agent-teams/team-1/sessions/ts-1");
		expect(allstarActive()).toBe(true);
		setRoute("/agent-teams/team-1/sessions/ts-1/members/m-1");
		expect(allstarActive()).toBe(true);
	});

	it("/allstar 与 code 会话的既有高亮不回归", () => {
		setRoute("/allstar");
		expect(allstarActive()).toBe(true);
		setRoute("/");
		store.set(activeSessionAtom, {
			cwd: "/proj/a",
			runtimeId: "rt-1",
			sessionPath: "/proj/a/s.jsonl",
			capabilityProfile: "coding",
		} as never);
		expect(allstarActive()).toBe(true);
	});

	it("普通路由与 work 会话不高亮", () => {
		setRoute("/knowledge");
		expect(allstarActive()).toBe(false);
		setRoute("/");
		store.set(activeSessionAtom, {
			cwd: "/proj/a",
			runtimeId: "rt-1",
			sessionPath: "/proj/a/s.jsonl",
			capabilityProfile: "chat",
		} as never);
		expect(allstarActive()).toBe(false);
	});
});
