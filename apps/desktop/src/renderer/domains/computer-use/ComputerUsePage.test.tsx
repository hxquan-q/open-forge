// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, initI18n } from "@shared/i18n";
import { activeSessionAtom } from "@shared/store/atoms";
import type { ComputerUseApi, ComputerUseState } from "@/shared/computer-use";
import { ComputerUseController } from "../../../main/computer-use/controller.js";
import type { ComputerBackend } from "../../../main/computer-use/contracts.js";
import { ComputerUsePage } from "./ComputerUsePage.js";

const { navigate, paint } = vi.hoisted(() => ({ navigate: vi.fn(), paint: vi.fn<() => Promise<void>>(async () => {}) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@shared/lib/committed-paint", () => ({ waitForCommittedPaint: paint }));

function fixture(active = true, ownerName?: string) {
	const present = (state: ComputerUseState): ComputerUseState => ({ ...state, sessionName: state.sessionId === "session-old" ? ownerName : undefined });
	const listeners = new Set<Parameters<ComputerUseApi["onChanged"]>[0]>();
	let display = { hidden: false, topmost: false };
	let content = "original";
	const backend: ComputerBackend = {
		async invoke(command) {
												if (command.op === "execute" && command.input.action === "type") content = command.input.text;
			return {
					ok: true,
					text: content,
					...(command.op === "execute" && command.input.action === "observe"
						? { image: { data: "cG5n", mimeType: "image/png" as const } }
						: {}),
				};
		}, interrupt: async () => {}, dispose: async () => {},
	};
	const service = new ComputerUseController({
		supported: true, backend, ledger: { load: async () => [], save: async () => {} },
		display: {
			read: () => display,
			update: (next) => {
				display = { ...display, ...next };
			},
			yield: () => () => {},
			exclude: () => () => {},
		},
		validateSession: async (id) => id === "session-1" || id === "session-old",
		onChange: () => { void service.state().then((state) => { for (const listener of listeners) listener(present(state)); }); },
	});
	const api: ComputerUseApi = {
		state: vi.fn(async () => present(await service.state())), control: vi.fn(async (command) => present(await service.control(command))),
		onChanged: (handler) => { listeners.add(handler); return () => { listeners.delete(handler); }; },
	};
	Object.assign(window, { vetta: { computerUse: api, i18n: { initialState: { language: "zh" } } } });
	const store = createStore();
	if (active) store.set(activeSessionAtom, { runtimeId: "session-1", cwd: "D:/project", sessionPath: "D:/session.jsonl" });
	return { service, api, store, content: () => content, listeners };
}

beforeAll(async () => {
	Object.assign(window, { vetta: { i18n: { initialState: { language: "zh" }, onLanguageChanged: () => () => {} } } });
	await initI18n(); await i18n.changeLanguage("zh");
	if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
	if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = () => false;
	if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = () => {};
});
beforeEach(() => { paint.mockResolvedValue(undefined); navigate.mockClear(); });
afterEach(() => { cleanup(); });

async function enableAndAuthorize() {
	await waitFor(() => expect((screen.getByRole("switch", { name: "开启电脑操作" }) as HTMLButtonElement).disabled).toBe(false));
	await userEvent.click(screen.getByRole("switch", { name: "开启电脑操作" }));
	await waitFor(() => expect((screen.getByRole("button", { name: "授权此对话" }) as HTMLButtonElement).disabled).toBe(false));
}

describe("computer use normal user workflow", () => {
	it("authorizes the current conversation for global desktop operation", async () => {
		const f = fixture();
		render(<Provider store={f.store}><ComputerUsePage /></Provider>);
		await enableAndAuthorize();
		await userEvent.click(screen.getByRole("button", { name: "授权此对话" }));
		await waitFor(async () => expect((await f.service.state()).sessionId).toBe("session-1"));
		const signal = new AbortController().signal;
		await act(async () => {
			expect((await f.service.execute({ sessionId: "session-1", input: { action: "observe" } }, signal)).isError).not.toBe(true);
			expect((await f.service.execute({ sessionId: "session-1", input: { action: "press", keys: "win+r" } }, signal)).isError).not.toBe(true);
			expect((await f.service.execute({ sessionId: "session-1", input: { action: "type", text: "wsl.exe" } }, signal)).isError).not.toBe(true);
		});
		await userEvent.click(screen.getByRole("button", { name: "暂停" }));
		await waitFor(() => expect(screen.getByText("已暂停。")).toBeTruthy());
		expect((await f.service.execute({ sessionId: "session-1", input: { action: "press", keys: "enter" } }, signal)).isError).toBe(true);
		await userEvent.click(screen.getByRole("button", { name: "停止电脑操作" }));
		await waitFor(async () => expect((await f.service.state()).sessionId).toBeUndefined());
		await userEvent.click(screen.getByRole("button", { name: "返回对话下达任务" }));
		expect(navigate).toHaveBeenCalledWith({ to: "/" });
	});
	it("renders the page before requesting status, and unsubscribes when leaving", async () => {
		let painted!: () => void;
		const barrier = new Promise<void>((resolve) => { painted = resolve; });
		paint.mockReturnValueOnce(barrier);
		const f = fixture();
		const rendered = render(<Provider store={f.store}><ComputerUsePage /></Provider>);
		expect(screen.getByRole("heading", { name: "电脑操作", level: 1 })).toBeTruthy();
		expect(f.api.state).not.toHaveBeenCalled();
		await act(async () => { painted(); });
		await waitFor(() => expect(f.api.state).toHaveBeenCalledOnce());
		rendered.unmount(); expect(f.listeners.size).toBe(0);
	});
	it("distinguishes the active owner from the next conversation awaiting authorization", async () => {
		const f = fixture(true, "Earlier task");
		await f.service.control({ action: "enable", enabled: true });
		await f.service.control({ action: "grant", sessionId: "session-old" });
		render(<Provider store={f.store}><ComputerUsePage /></Provider>);
		await screen.findByText("已授权，AI 可以操作整个桌面。");
		expect((screen.getByRole("button", { name: "授权此对话" }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText(/控制权仍属于另一个对话/)).toBeTruthy();
		expect(screen.getByText(/已授权对话：Earlier task/)).toBeTruthy();
		await userEvent.click(screen.getByRole("button", { name: "停止电脑操作" }));
		await waitFor(() => expect((screen.getByRole("button", { name: "授权此对话" }) as HTMLButtonElement).disabled).toBe(false));
	});

	it("identifies an unnamed previous owner by its stable identifier", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.service.control({ action: "grant", sessionId: "session-old" });
		render(<Provider store={f.store}><ComputerUsePage /></Provider>);
		expect(await screen.findByText(/未命名的已授权对话（标识：session-old）/)).toBeTruthy();
	});

	it("requires a current conversation before grant", async () => {
		const f = fixture(false);
		render(<Provider store={f.store}><ComputerUsePage /></Provider>);
		await waitFor(() => expect((screen.getByRole("switch", { name: "开启电脑操作" }) as HTMLButtonElement).disabled).toBe(false));
		await userEvent.click(screen.getByRole("switch", { name: "开启电脑操作" }));
		expect((screen.getByRole("button", { name: "授权此对话" }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText(/请先在侧栏新建或打开一个对话/)).toBeTruthy();
	});
});
