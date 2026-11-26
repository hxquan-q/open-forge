// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import type { SessionContextMenuSession } from "@shared/store/atoms";
import { automationCreateRequestAtom, batchProjectsAtom, defaultConversationCwdAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * 「基于此会话创建自动化」的入口合同（TASK-0521，参照上游 f940900be）：只有能续写的
 * 普通会话才有这一项——团队会话由团队编排、批量任务会话由批量项目编排，绑定过去没有
 * 意义。选中后把预填写进 automationCreateRequestAtom（same-session 绑定该会话、prompt
 * 取首条消息）并跳到自动化页，新建分屏的消费在 useAutomationPageModel。
 */

const navigateCalls: unknown[] = [];
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => (options: unknown) => {
		navigateCalls.push(options);
		return Promise.resolve();
	},
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const { useSessionContextMenuModel } = await import("./useSessionContextMenuModel.js");

const SESSION: SessionContextMenuSession = {
	id: "C:/sessions/login-fix.jsonl",
	path: "C:/sessions/login-fix.jsonl",
	cwd: "C:/repo",
	firstMessage: "每天把失败的登录测试重跑一遍",
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

function automationItemOf(items: ReturnType<typeof useSessionContextMenuModel>["extraItems"]) {
	const node = items?.find((item) => item.id === "create-automation");
	return node?.kind === "item" ? node : undefined;
}

function renderModel(
	options: {
		session?: SessionContextMenuSession;
		allowMutations?: boolean;
		prepareStore?: (store: ReturnType<typeof createStore>) => void;
	} = {},
) {
	const session = options.session ?? SESSION;
	const store = createStore();
	options.prepareStore?.(store);
	navigateCalls.length = 0;
	const onClose = vi.fn();
	const wrapper = ({ children }: { children: ReactNode }): JSX.Element => <Provider store={store}>{children}</Provider>;
	const { result } = renderHook(
		() => useSessionContextMenuModel(session, options.allowMutations ?? true, true, onClose, vi.fn()),
		{ wrapper },
	);
	return { result, store, onClose };
}

describe("useSessionContextMenuModel（创建自动化入口）", () => {
	it("普通会话有此菜单项；选中后预填 same-session 绑定并跳到自动化页", () => {
		const { result, store, onClose } = renderModel();
		const item = automationItemOf(result.current.extraItems);
		expect(item).toMatchObject({ id: "create-automation", label: "contextMenu.createAutomation" });

		act(() => item?.onSelect?.());

		expect(store.get(automationCreateRequestAtom)).toEqual({
			name: "每天把失败的登录测试重跑一遍",
			prompt: "每天把失败的登录测试重跑一遍",
			cwd: "C:/repo",
			runMode: "same-session",
			sessionPath: SESSION.path,
		});
		expect(navigateCalls).toEqual([{ to: "/automation" }]);
		expect(onClose.mock.calls).toHaveLength(1);
	});

	it("默认项目下的会话 cwd 归一到项目根（bucket），不落到 per-session 子目录", () => {
		const { result, store } = renderModel({
			session: { ...SESSION, cwd: "C:/default/sessions/s-1" },
			prepareStore: (store) => store.set(defaultConversationCwdAtom, "C:/default"),
		});

		act(() => automationItemOf(result.current.extraItems)?.onSelect?.());

		expect(store.get(automationCreateRequestAtom)?.cwd).toBe("C:/default");
	});

	it("首条消息是无消息占位或空白时 prompt 留空，只预填会话名与绑定", () => {
		const { result, store } = renderModel({ session: { ...SESSION, firstMessage: "(no messages)" } });

		act(() => automationItemOf(result.current.extraItems)?.onSelect?.());

		expect(store.get(automationCreateRequestAtom)?.prompt).toBe("");
	});

	it("团队会话没有这一项：团队会话由团队编排，不接受外部投递", () => {
		const { result } = renderModel({ session: TEAM_SESSION });
		expect(automationItemOf(result.current.extraItems)).toBeUndefined();
	});

	it("批量任务占有的会话没有这一项：它由批量项目编排", () => {
		const { result } = renderModel({
			prepareStore: (store) =>
				store.set(batchProjectsAtom, [
					{ id: "batch-1", tasks: [{ id: "task-1", sessionPath: SESSION.path }] },
				] as never),
		});
		expect(automationItemOf(result.current.extraItems)).toBeUndefined();
	});

	it("只读来源与禁止续写的会话都没有这一项", () => {
		expect(automationItemOf(renderModel({ allowMutations: false }).result.current.extraItems)).toBeUndefined();
		const readonly = renderModel({ session: { ...SESSION, access: { resume: false } } as SessionContextMenuSession });
		expect(automationItemOf(readonly.result.current.extraItems)).toBeUndefined();
	});
});
