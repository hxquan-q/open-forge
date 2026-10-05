// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeSessionAtom } from "@shared/store/atoms";
import type { ChatConversationItem } from "@shared/store/atoms";
import { SessionMessageList } from "./SessionMessageList";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// jsdom has no layout: replace only the external virtualizer and count how often the list mounts.
const virtualizer = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("react-virtuoso", async () => {
	const { useEffect } = await import("react");
	return {
		Virtuoso: ({
			data,
			itemContent,
		}: {
			data: readonly ChatConversationItem[];
			itemContent: (index: number, item: ChatConversationItem) => ReactNode;
		}) => {
			useEffect(() => {
				virtualizer.mounts += 1;
			}, []);
			return (
				<div>
					{data.map((item, index) => (
						<div key={item.id}>{itemContent(index, item)}</div>
					))}
				</div>
			);
		},
	};
});

const session = { cwd: "/project", sessionPath: "/history/session.jsonl", runtimeId: "runtime" };
const otherSession = { cwd: "/other", sessionPath: "/history/other.jsonl", runtimeId: "runtime-other" };
const reply = {
	id: "reply",
	entryId: "reply",
	turnId: "turn",
	authorId: "assistant",
	kind: "agent" as const,
	role: "assistant" as const,
	phase: "completed" as const,
	text: "A queue preserves order",
	blocks: [],
};

describe("SessionMessageList keeps its list mounted across session activation", () => {
	let listCalls: string[];
	beforeEach(() => {
		virtualizer.mounts = 0;
		listCalls = [];
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
				messageAnnotations: {
					list: vi.fn(async (runtimeId: string) => {
						listCalls.push(runtimeId);
						return [];
					}),
					ask: vi.fn(async () => {}),
					cancel: vi.fn(async () => {}),
					onChanged: () => () => {},
				},
				session: { listSandboxGrants: async () => [] },
				models: { get: async () => ({ providers: {} }), fetchRemote: async () => ({ providers: {} }) },
			},
		});
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	function mountFeed() {
		const store = createStore();
		render(
			<Provider store={store}>
				<SessionMessageList
					messages={[reply]}
					isStreaming={false}
					sessionId={session.sessionPath}
					workspace={{ id: session.cwd, cwd: session.cwd, runtimeIds: [session.runtimeId] }}
				/>
			</Provider>,
		);
		return store;
	}

	it("while the shown session becomes the active session", async () => {
		const store = mountFeed();
		const mountsBefore = virtualizer.mounts;
		const tail = screen.getByText(reply.text);
		expect(listCalls).toEqual([]);

		await act(async () => {
			store.set(activeSessionAtom, session);
		});
		// 会话就绪只应点亮批注面板，不应把已显示的消息列表卸载重建。
		expect(virtualizer.mounts).toBe(mountsBefore);
		expect(screen.getByText(reply.text)).toBe(tail);
		await vi.waitFor(() => expect(listCalls).toEqual([session.runtimeId]));
	});

	it("while a different session is active: the annotation panel stays inert", async () => {
		const store = mountFeed();
		const mountsBefore = virtualizer.mounts;

		await act(async () => {
			store.set(activeSessionAtom, otherSession);
		});
		expect(virtualizer.mounts).toBe(mountsBefore);
		expect(listCalls).toEqual([]);

		await act(async () => {
			store.set(activeSessionAtom, session);
		});
		expect(virtualizer.mounts).toBe(mountsBefore);
		const tail = screen.getByText(reply.text);
		await vi.waitFor(() => expect(listCalls).toEqual([session.runtimeId]));
		expect(screen.getByText(reply.text)).toBe(tail);
	});
});
