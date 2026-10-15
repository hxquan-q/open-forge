// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import { Provider, createStore } from "jotai";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type * as ThemeChat from "@vetta-org/theme-ui/chat";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, unknown>) => {
			if (key === "messageList.retryIndicator") return `正在重新连接（${values?.attempt}/${values?.maxAttempts}）`;
			if (key === "messageList.retryReason") return `上次请求失败：${values?.reason}`;
			if (key === "messageList.errorBlock.kinds.server.title") return "服务暂时出了点问题";
			if (key === "messageList.errorBlock.kinds.network.title") return "网络连接中断";
			if (key === "messageList.resumeBar.title") return `上次回复未完成：${values?.reason}`;
			if (key === "messageList.resumeBar.action") return "继续";
			if (key === "messageList.resumeBar.failed") return "继续失败，请稍后重试";
			return key;
		},
	}),
}));

vi.mock("@vetta-org/theme-ui/chat", async (importOriginal) => ({
	...(await importOriginal<typeof ThemeChat>()),
	MessageListFooter: {
		Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		Presence: ({ children }: { children: ReactNode }) => <>{children}</>,
		Pending: ({ label }: { label: string }) => <span>{label}</span>,
		Compacting: ({ label }: { label: string }) => <span>{label}</span>,
		Retry: ({ detail, label }: { detail?: string; label: string }) => (
			<div>
				<span>{label}</span>
				{detail ? <span>{detail}</span> : null}
			</div>
		),
		Waiting: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	},
}));
vi.mock("../../../plugins/components/PluginTurnCardHost", () => ({ PluginTurnCardHost: () => null }));
vi.mock("./AssistantMessage", () => ({ StreamingIndicator: () => null }));
vi.mock("./WorkflowFooterItems", () => ({ WorkflowFooterItems: () => null }));

import { getDefaultStore } from "jotai";
import { retryProgressAtom } from "@shared/store/atoms";
import { toastsAtom } from "@shared/store/toast-atoms";
import { MessageListFooter } from "./MessageListFooter";

describe("MessageListFooter retry progress", () => {
	const store = createStore();

	beforeEach(() => store.set(retryProgressAtom, null));

	it("shows the reconnect attempt and a user-friendly reason", () => {
		store.set(retryProgressAtom, {
			attempt: 1,
			maxAttempts: 3,
			errorMessage: "503 service unavailable",
		});

		render(
			<Provider store={store}>
				<MessageListFooter isCompacting={false} waiting />
			</Provider>,
		);

		expect(screen.getByText("正在重新连接（1/3）")).toBeTruthy();
		expect(screen.getByText("上次请求失败：服务暂时出了点问题")).toBeTruthy();
	});

	it("shows session startup status in the message list footer", () => {
		render(
			<Provider store={store}>
				<MessageListFooter isCompacting={false} pendingLabel="正在启动会话" waiting={false} />
			</Provider>,
		);

		expect(screen.getByText("正在启动会话")).toBeTruthy();
	});
});

describe("MessageListFooter 中断续跑条", () => {
	let store: ReturnType<typeof createStore>;
	const retryMock = vi.fn<(sessionId: string) => Promise<void>>();

	beforeEach(() => {
		retryMock.mockReset();
		retryMock.mockResolvedValue(undefined);
		store = createStore();
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: { session: { retry: retryMock } },
		});
	});

	it("末尾错误可恢复且会话空闲：显示原因与「继续」，点击调 session.retry", async () => {
		render(
			<Provider store={store}>
				<MessageListFooter isCompacting={false} waiting={false} runtimeSessionId="runtime-1" interruptedErrorKind="network" />
			</Provider>,
		);

		expect(screen.getByText("上次回复未完成：网络连接中断")).toBeTruthy();
		screen.getByRole("button", { name: "继续" }).click();
		expect(retryMock).toHaveBeenCalledWith("runtime-1");
	});

	it("没有 sessionId（会话未建立）时不显示继续条", () => {
		render(
			<Provider store={store}>
				<MessageListFooter isCompacting={false} waiting={false} interruptedErrorKind="network" />
			</Provider>,
		);

		expect(screen.queryByRole("button", { name: "继续" })).toBeNull();
	});

	it("自动重试进行中不显示继续条（重试指示优先）", () => {
		store.set(retryProgressAtom, {
			attempt: 1,
			maxAttempts: 3,
			errorMessage: "fetch failed",
		});

		render(
			<Provider store={store}>
				<MessageListFooter isCompacting={false} waiting={false} runtimeSessionId="runtime-1" interruptedErrorKind="network" />
			</Provider>,
		);

		expect(screen.queryByRole("button", { name: "继续" })).toBeNull();
	});

	it("retry IPC 被拒绝（会话已忙碌等）时提示失败，不静默吞掉", async () => {
		retryMock.mockRejectedValue(new Error("session_busy"));
		// showToast 走 jotai 全局默认 store（与真实运行时一致），断言同一来源。
		const toastsStore = getDefaultStore();
		toastsStore.set(toastsAtom, []);

		render(
			<Provider store={store}>
				<MessageListFooter isCompacting={false} waiting={false} runtimeSessionId="runtime-1" interruptedErrorKind="network" />
			</Provider>,
		);

		screen.getByRole("button", { name: "继续" }).click();
		await vi.waitFor(() => {
			const toasts = toastsStore.get(toastsAtom);
			expect(toasts.some((toast) => toast.message === "继续失败，请稍后重试")).toBe(true);
		});
	});
});
