// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

// 展示层依赖：Markdown 管线与 Radix Select 在 jsdom 下需要替身（沿用同域既有测试的做法）。
vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));
vi.mock("@shared/components/ui/select", () => ({
	Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <div data-value={value}>{children}</div>,
	SelectTrigger: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
	SelectValue: () => <span />,
}));

import { WeKnoraPage } from "./components/WeKnoraPage";
import { useWeKnoraModel } from "./hooks/useWeKnoraModel";

type WeKnoraApi = DesktopApi["weknora"];

const UNCONFIGURED = { baseUrl: "", defaultAgentId: "A", pageSize: 50, hasApiKey: false };

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

function installApi(overrides: Partial<WeKnoraApi> = {}): WeKnoraApi {
	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => UNCONFIGURED),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A")]),
		listSessions: vi.fn(async () => []),
		loadMessages: vi.fn(async () => []),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
		getFile: vi.fn(async () => ({ dataUrl: "data:image/png;base64,", contentType: "image/png" })),
		ask: vi.fn(async () => ({ requestId: "r1", sessionId: "s1" })),
		cancel: vi.fn(async () => undefined),
		onStreamEvent: vi.fn(() => () => undefined),
		...overrides,
	};
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: api } as unknown as DesktopApi,
	});
	return api;
}

function renderPage(): void {
	render(
		<Provider store={createStore()}>
			<WeKnoraPage />
		</Provider>,
	);
}

function wrapperFor(store: ReturnType<typeof createStore>) {
	return function TestProvider({ children }: { children: ReactNode }): JSX.Element {
		return <Provider store={store}>{children}</Provider>;
	};
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

/** ④：`saveSetup` 原先只有 try/finally —— 失败会变成未处理的 rejection，且界面无任何反馈。 */
describe("保存配置的失败反馈（④）", () => {
	it("服务地址为空时点保存 → 有用户可见的失败反馈，且不静默失败", async () => {
		const api = installApi();
		renderPage();
		await waitFor(() => expect(screen.getByText("尚未配置智能客服")).toBeTruthy());

		await userEvent.click(screen.getByRole("button", { name: "保存" }));

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toBe("保存失败,请检查服务地址与 API Key 后重试。");
		// 空地址在渲染层就拦住，不该把请求发下去。
		expect(api.setConfig).not.toHaveBeenCalled();
	});

	it("服务端拒绝保存（setConfig reject）→ 有用户可见的失败反馈", async () => {
		installApi({
			setConfig: vi.fn(async () => {
				throw new Error("boom");
			}),
		});
		renderPage();
		await waitFor(() => expect(screen.getByText("尚未配置智能客服")).toBeTruthy());

		await userEvent.type(screen.getByPlaceholderText("http://host:port"), "http://host:8083");
		await userEvent.click(screen.getByRole("button", { name: "保存" }));

		expect(await screen.findByRole("alert")).toBeTruthy();
	});

	it("saveSetup 自身收敛失败，不产生未处理的 rejection（④）", async () => {
		installApi({
			setConfig: vi.fn(async () => {
				throw new Error("boom");
			}),
		});
		const store = createStore();
		const { result } = renderHook(() => useWeKnoraModel(), { wrapper: wrapperFor(store) });
		await waitFor(() => expect(result.current.config).not.toBeNull());

		// 修复前：setConfig reject 会逃逸成未处理的 Promise rejection；修复后 saveSetup 自身 resolve。
		await act(async () => {
			await expect(result.current.actions.saveSetup({ baseUrl: "http://host:8083" })).resolves.toBeUndefined();
		});
	});
});
