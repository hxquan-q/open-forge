// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeSessionAtom } from "@shared/store/atoms";
import type { ChatConversationItem } from "@shared/store/atoms";
import { messageQueueBySessionAtom } from "@shared/store/message-queue-atoms";
import { SessionMessageList } from "./SessionMessageList";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			if (key === "messageList.resumeBar.action") return "继续";
			if (key === "messageList.resumeBar.title") return "上次回复未完成";
			if (key === "messageList.resumeBar.failed") return "继续失败，请稍后重试";
			return key;
		},
	}),
}));
// jsdom has no layout: the virtualizer is replaced like the sibling stability test does,
// but additionally renders the Footer slot — MessageFeed.Footer portals into the host the
// real Virtuoso mounts via components.Footer; without it the footer (and the resume bar)
// never renders in jsdom.
vi.mock("react-virtuoso", async () => {
	const { useEffect } = await import("react");
	return {
		Virtuoso: ({
			components,
			data,
			itemContent,
		}: {
			components?: { Footer?: ComponentType };
			data: readonly ChatConversationItem[];
			itemContent: (index: number, item: ChatConversationItem) => ReactNode;
		}) => {
			useEffect(() => {}, []);
			const Footer = components?.Footer;
			return (
				<div>
					{data.map((item, index) => (
						<div key={item.id}>{itemContent(index, item)}</div>
					))}
					{Footer ? <Footer /> : null}
				</div>
			);
		},
	};
});

const session = { cwd: "/project", sessionPath: "/history/session.jsonl", runtimeId: "runtime-1" };
const interruptedReply = {
	id: "reply",
	entryId: "reply",
	turnId: "turn",
	authorId: "assistant",
	kind: "agent" as const,
	role: "assistant" as const,
	phase: "completed" as const,
	text: "回复到一半断了",
	blocks: [{ type: "error" as const, id: "e1", kind: "network" as const, text: "网络连接中断" }],
};

describe("SessionMessageList 续跑条把 runtime id 交给宿主", () => {
	let retryMock: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		retryMock = vi.fn(async () => {});
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				unobserve() {}
				disconnect() {}
			},
		);
		Object.assign(window, {
			vetta: {
				session: { retry: retryMock, listSandboxGrants: async () => [] },
				messageAnnotations: {
					list: vi.fn(async () => []),
					ask: vi.fn(async () => {}),
					cancel: vi.fn(async () => {}),
					onChanged: () => () => {},
				},
				models: { get: async () => ({ providers: {} }), fetchRemote: async () => ({ providers: {} }) },
			},
		});
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	// 回归：feed 身份是持久会话路径（ChatView → SessionMessageList 传的就是它），
	// 而 session.retry 需要 canonical runtime id。旧实现把路径直接交给宿主，
	// 每次点击都抛 SESSION_NOT_FOUND 并弹「继续失败，请稍后重试」（BUG-0109）。
	it("点击继续时传 runtime id，而不是 feed 用的持久会话路径", async () => {
		const store = createStore();
		render(
			<Provider store={store}>
				<SessionMessageList
					messages={[interruptedReply]}
					isStreaming={false}
					sessionId={session.sessionPath}
					workspace={{ id: session.cwd, cwd: session.cwd, runtimeIds: [session.runtimeId] }}
				/>
			</Provider>,
		);
		await act(async () => {
			store.set(activeSessionAtom, session);
		});

		screen.getByRole("button", { name: "继续" }).click();

		expect(retryMock).toHaveBeenCalledWith(session.runtimeId);
		expect(retryMock).not.toHaveBeenCalledWith(session.sessionPath);
	});

	it("会话尚未成为 active session 时不显示继续条", async () => {
		const store = createStore();
		render(
			<Provider store={store}>
				<SessionMessageList
					messages={[interruptedReply]}
					isStreaming={false}
					sessionId={session.sessionPath}
					workspace={{ id: session.cwd, cwd: session.cwd, runtimeIds: [session.runtimeId] }}
				/>
			</Provider>,
		);

		expect(screen.queryByRole("button", { name: "继续" })).toBeNull();
	});

	// 回归：feed 挂着会话 A 而 active 已切到会话 B（切换在途的中间态）时，
	// 旧实现把 B 的 runtimeId 交给续跑条，点「继续」会重启 B 的回合而不是保持无操作。
	it("active session 是别的会话时不显示继续条", async () => {
		const store = createStore();
		const otherSession = { cwd: "/other", sessionPath: "/history/other.jsonl", runtimeId: "runtime-other" };
		render(
			<Provider store={store}>
				<SessionMessageList
					messages={[interruptedReply]}
					isStreaming={false}
					sessionId={session.sessionPath}
					workspace={{ id: session.cwd, cwd: session.cwd, runtimeIds: [session.runtimeId] }}
				/>
			</Provider>,
		);
		await act(async () => {
			store.set(activeSessionAtom, otherSession);
		});

		expect(screen.queryByRole("button", { name: "继续" })).toBeNull();
		expect(retryMock).not.toHaveBeenCalled();
	});

	// 回归（BUG-0122）：排队输入派发发生在 agent_end 与下一轮 agent_start 之间，该窗口
	// 不在主进程运行集内，渲染端的 streaming 信念会短暂为假。此时内核仍会拒绝续跑，
	// 因此据队列镜像（主进程真值）在排队期间不提供续跑入口；清空后必须恢复。
	it("会话仍有待派发排队输入时不显示继续条，清空后恢复", async () => {
		const store = createStore();
		render(
			<Provider store={store}>
				<SessionMessageList
					messages={[interruptedReply]}
					isStreaming={false}
					sessionId={session.sessionPath}
					workspace={{ id: session.cwd, cwd: session.cwd, runtimeIds: [session.runtimeId] }}
				/>
			</Provider>,
		);
		await act(async () => {
			store.set(activeSessionAtom, session);
		});
		expect(screen.getByRole("button", { name: "继续" })).toBeTruthy();

		await act(async () => {
			store.set(
				messageQueueBySessionAtom,
				new Map([
					[
						session.runtimeId,
						[{ id: "q-1", displayText: "排队消息", behavior: "followUp" as const, kind: "message" as const }],
					],
				]),
			);
		});
		expect(screen.queryByRole("button", { name: "继续" })).toBeNull();

		await act(async () => {
			store.set(messageQueueBySessionAtom, new Map());
		});
		expect(screen.getByRole("button", { name: "继续" })).toBeTruthy();
	});
});
