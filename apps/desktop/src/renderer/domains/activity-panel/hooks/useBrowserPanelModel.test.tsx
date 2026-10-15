// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { browserUrlByWorkspaceAtom } from "@shared/store/atoms";
import { OVERLAY_DRAG_EVENT } from "@vetta-org/theme-ui/layout";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopBrowserViewState } from "@/shared/browser-view-ipc";
import { ActivityTabActivationContextProvider } from "../registry/activation-context";
import { ActivityPanelContextProvider } from "../registry/context";
import type { BrowserPanelModel } from "./useBrowserPanelModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./useBrowserElementPicker", () => ({
	useBrowserElementPicker: () => ({
		pickerEnabled: false,
		selection: null,
		selectionRef: null,
		onTogglePicker: vi.fn(),
		confirmSelection: vi.fn(),
		discardSelection: vi.fn(),
	}),
}));
vi.mock("./useBrowserLiveEdit", () => ({
	useBrowserLiveEdit: () => ({ edits: [], busy: false, hasElement: false, error: null }),
}));

const { useBrowserPanelModel } = await import("./useBrowserPanelModel.js");

function viewState(overrides: Partial<DesktopBrowserViewState> = {}): DesktopBrowserViewState {
	return {
		workspaceId: "ws-1",
		url: "https://example.com",
		title: "Example",
		loading: false,
		canBack: true,
		canForward: false,
		failed: false,
		...overrides,
	};
}

interface Harness {
	model: { current: BrowserPanelModel | null };
}

function Probe({ harness }: { harness: Harness }): JSX.Element {
	const model = useBrowserPanelModel();
	harness.model.current = model;
	// 模拟 BrowserPanelView 的占位挂载：把 model.hostRef 绑到真实 DOM 节点。
	return <div ref={model.hostRef} data-browser-view-host="" />;
}

function renderPanel(harness: Harness, { workspaceId = "ws-1", active = true }: { workspaceId?: string; active?: boolean } = {}) {
	return render(
		<ActivityPanelContextProvider
			value={{ workspace: { id: workspaceId, cwd: null, runtimeIds: [] }, knowledgeHistory: false }}
		>
			<ActivityTabActivationContextProvider value={active}>
				<Probe harness={harness} />
			</ActivityTabActivationContextProvider>
		</ActivityPanelContextProvider>,
	);
}

describe("useBrowserPanelModel（WebContentsView 占位宿主）", () => {
	const store = getDefaultStore();
	let viewListener: ((envelope: { workspaceId: string; state: DesktopBrowserViewState }) => void) | undefined;
	let api: {
		attach: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		detach: ReturnType<typeof vi.fn>;
		navigate: ReturnType<typeof vi.fn>;
		control: ReturnType<typeof vi.fn>;
		setInputPassthrough: ReturnType<typeof vi.fn>;
		onEvent: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		viewListener = undefined;
		api = {
			attach: vi.fn(async () => ({ ok: true, state: viewState() })),
			update: vi.fn(async () => undefined),
			detach: vi.fn(async () => undefined),
			navigate: vi.fn(async () => ({ ok: true })),
			control: vi.fn(async () => undefined),
			setInputPassthrough: vi.fn(async () => undefined),
			onEvent: vi.fn((next: typeof viewListener) => {
				viewListener = next;
				return () => {
					viewListener = undefined;
				};
			}),
		};
		window.vetta = { browserView: api } as unknown as Window["vetta"];
		store.set(browserUrlByWorkspaceAtom, new Map());
	});

	afterEach(cleanup);

	it("挂载时按 workspace 建 view 并上报占位 bounds，应用 attach 返回的页面状态", async () => {
		const harness: Harness = { model: { current: null } };
		renderPanel(harness);
		await waitFor(() => expect(api.attach).toHaveBeenCalledTimes(1));
		expect(api.attach).toHaveBeenCalledWith({
			workspaceId: "ws-1",
			bounds: expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
			url: undefined,
			// 尚无页面：view 挂载即保持隐藏，避免原生层闪帧盖过空态覆盖层。
			visible: false,
		});
		await waitFor(() => expect(harness.model.current?.currentUrl).toBe("https://example.com"));
		expect(harness.model.current?.canBack).toBe(true);
		expect(harness.model.current?.hasPage).toBe(true);
	});

	it("主进程事件驱动地址/前进后退/加载态同步，并把页面 URL 记回 workspace", async () => {
		const harness: Harness = { model: { current: null } };
		renderPanel(harness);
		await waitFor(() => expect(viewListener).toBeTypeOf("function"));

		act(() => {
			viewListener?.({
				workspaceId: "ws-1",
				state: viewState({ url: "https://a.dev/x", loading: true, canForward: true }),
			});
		});
		await waitFor(() => expect(harness.model.current?.address).toBe("https://a.dev/x"));
		expect(harness.model.current?.loading).toBe(true);
		expect(harness.model.current?.canForward).toBe(true);
		expect(store.get(browserUrlByWorkspaceAtom).get("ws-1")).toBe("https://a.dev/x");

		// 其它 workspace 的事件不串台
		act(() => {
			viewListener?.({ workspaceId: "ws-2", state: viewState({ url: "https://other.dev" }) });
		});
		expect(harness.model.current?.address).toBe("https://a.dev/x");
	});

	it("地址栏提交经 workspace URL 回写触发 navigate；回退/前进/重载/停止走 control", async () => {
		const harness: Harness = { model: { current: null } };
		renderPanel(harness);
		await waitFor(() => expect(api.attach).toHaveBeenCalledTimes(1));

		const model = () => harness.model.current as BrowserPanelModel;
		act(() => model().onAddressChange("vetta.dev/docs"));
		act(() => model().onAddressSubmit({ preventDefault: () => undefined } as never));
		await waitFor(() =>
			expect(api.navigate).toHaveBeenCalledWith({ workspaceId: "ws-1", url: "https://vetta.dev/docs" }),
		);

		model().onBack();
		model().onForward();
		model().onReload();
		model().onStop();
		for (const action of ["back", "forward", "reload", "stop"]) {
			expect(api.control).toHaveBeenCalledWith({ workspaceId: "ws-1", action });
		}
	});

	it("tab 失活或页面失败时把原生 view 藏起，活动且有页时显示", async () => {
		const harness: Harness = { model: { current: null } };
		const panel = renderPanel(harness, { active: true });
		await waitFor(() => expect(harness.model.current?.hasPage).toBe(true));
		await waitFor(() => expect(api.update).toHaveBeenCalledWith({ workspaceId: "ws-1", visible: true }));

		api.update.mockClear();
		panel.rerender(
			<ActivityPanelContextProvider
				value={{ workspace: { id: "ws-1", cwd: null, runtimeIds: [] }, knowledgeHistory: false }}
			>
				<ActivityTabActivationContextProvider value={false}>
					<Probe harness={harness} />
				</ActivityTabActivationContextProvider>
			</ActivityPanelContextProvider>,
		);
		await waitFor(() => expect(api.update).toHaveBeenCalledWith({ workspaceId: "ws-1", visible: false }));

		api.update.mockClear();
		panel.rerender(
			<ActivityPanelContextProvider
				value={{ workspace: { id: "ws-1", cwd: null, runtimeIds: [] }, knowledgeHistory: false }}
			>
				<ActivityTabActivationContextProvider value={true}>
					<Probe harness={harness} />
				</ActivityTabActivationContextProvider>
			</ActivityPanelContextProvider>,
		);
		await waitFor(() => expect(api.update).toHaveBeenCalledWith({ workspaceId: "ws-1", visible: true }));

		act(() => {
			viewListener?.({ workspaceId: "ws-1", state: viewState({ failed: true }) });
		});
		await waitFor(() => expect(harness.model.current?.failed).toBe(true));
		await waitFor(() => expect(api.update).toHaveBeenCalledWith({ workspaceId: "ws-1", visible: false }));
	});

	it("DOM 拖拽 overlay 广播时让原生 view 穿透指针事件，结束后恢复", async () => {
		const harness: Harness = { model: { current: null } };
		renderPanel(harness);
		await waitFor(() => expect(api.attach).toHaveBeenCalledTimes(1));

		act(() => {
			window.dispatchEvent(new CustomEvent(OVERLAY_DRAG_EVENT, { detail: { active: true } }));
		});
		await waitFor(() =>
			expect(api.setInputPassthrough).toHaveBeenCalledWith({ workspaceId: "ws-1", passthrough: true }),
		);

		act(() => {
			window.dispatchEvent(new CustomEvent(OVERLAY_DRAG_EVENT, { detail: { active: false } }));
		});
		await waitFor(() =>
			expect(api.setInputPassthrough).toHaveBeenCalledWith({ workspaceId: "ws-1", passthrough: false }),
		);
	});

	it("attach 带地址时不重复导航（首载不会被自身补发的 navigate 中止）", async () => {
		const harness: Harness = { model: { current: null } };
		store.set(browserUrlByWorkspaceAtom, new Map([["ws-1", "https://a.dev"]]));
		// attach 提交前 getURL() 仍是 about:blank：旧实现据此判定「地址不一致」又发一次导航。
		api.attach.mockResolvedValueOnce({ ok: true, state: viewState({ url: "about:blank" }) });
		renderPanel(harness);
		await waitFor(() => expect(api.attach).toHaveBeenCalledWith(expect.objectContaining({ url: "https://a.dev" })));

		await waitFor(() => expect(harness.model.current?.failed).toBe(false));
		expect(api.navigate).not.toHaveBeenCalled();
	});

	it("attach 往返期间目标地址被改才补一次导航", async () => {
		const harness: Harness = { model: { current: null } };
		store.set(browserUrlByWorkspaceAtom, new Map([["ws-1", "https://a.dev"]]));
		let resolveAttach: ((result: unknown) => void) | undefined;
		api.attach.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveAttach = resolve;
				}),
		);
		renderPanel(harness);
		await waitFor(() => expect(api.attach).toHaveBeenCalledTimes(1));

		act(() => {
			store.set(browserUrlByWorkspaceAtom, new Map([["ws-1", "https://b.dev"]]));
		});
		expect(api.navigate).not.toHaveBeenCalled();

		act(() => {
			resolveAttach?.({ ok: true, state: viewState({ url: "about:blank" }) });
		});
		await waitFor(() => expect(api.navigate).toHaveBeenCalledTimes(1));
		expect(api.navigate).toHaveBeenCalledWith({ workspaceId: "ws-1", url: "https://b.dev" });
	});

	it("attach 被主进程处理器拒绝/抛错时不静默：进入失败态，重试重走 attach 而非 reload", async () => {
		const harness: Harness = { model: { current: null } };
		const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
		// 历史故障形态：主进程处理器抛「Cannot find module」→ invoke 直接拒绝。
		api.attach.mockRejectedValueOnce(new Error("Cannot find module '../window-manager.js'"));
		renderPanel(harness);

		await waitFor(() => expect(harness.model.current?.failed).toBe(true));
		expect(harness.model.current?.hasPage).toBe(false);
		expect(errors).toHaveBeenCalledWith("[browser-panel] attach failed", expect.objectContaining({ workspaceId: "ws-1" }));

		act(() => harness.model.current?.onRetry());
		await waitFor(() => expect(api.attach).toHaveBeenCalledTimes(2));
		expect(api.control).not.toHaveBeenCalled();
		// 第二次 attach 成功即恢复可用态
		await waitFor(() => expect(harness.model.current?.failed).toBe(false));
		errors.mockRestore();
	});

	it("attach 回 no_window 同样进入失败态", async () => {
		const harness: Harness = { model: { current: null } };
		const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
		api.attach.mockResolvedValueOnce({ ok: false, code: "no_window" });
		renderPanel(harness);
		await waitFor(() => expect(harness.model.current?.failed).toBe(true));
		errors.mockRestore();
	});

	it("卸载时摘下 view（view 本体在主进程保活供 agent 复用）", async () => {
		const harness: Harness = { model: { current: null } };
		const panel = renderPanel(harness);
		await waitFor(() => expect(api.attach).toHaveBeenCalledTimes(1));
		panel.unmount();
		expect(api.detach).toHaveBeenCalledWith({ workspaceId: "ws-1" });
	});
});
