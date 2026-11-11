// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, initI18n } from "@shared/i18n";
import { activeSessionAtom } from "@shared/store/atoms";
import type { ComputerUseApi, ComputerUseState, ComputerWindow } from "@/shared/computer-use";
import { ComputerUseController } from "../../../main/computer-use/controller.js";
import type { ComputerBackend } from "../../../main/computer-use/contracts.js";
import { ComputerUsePage } from "./ComputerUsePage.js";

const { navigate, paint } = vi.hoisted(() => ({ navigate: vi.fn(), paint: vi.fn<() => Promise<void>>(async () => {}) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@shared/lib/committed-paint", () => ({ waitForCommittedPaint: paint }));

const target: ComputerWindow = { id: "target-1", hwnd: "123", pid: 4, started: "567", instance: "42", className: "Editor", exe: "C:/editor.exe", title: "Example document", hidden: false, showCommand: 3 };
function fixture(active = true, ownerName?: string) {
	const present = (state: ComputerUseState): ComputerUseState => ({ ...state, sessionName: state.sessionId === "session-old" ? ownerName : undefined });
	const listeners = new Set<Parameters<ComputerUseApi["onChanged"]>[0]>();
	let hidden = false;
	let display = { hidden: false, topmost: false };
	let content = "original";
	const backend: ComputerBackend = {
		async invoke(command) {
			if (command.op === "windows" || command.op === "related") return { ok: true, windows: [{ ...target, hidden }] };
			if (command.op === "hide") hidden = true;
			if (command.op === "restore") hidden = false;
			if (command.op === "execute" && command.input.action === "fill") content = command.input.text;
			return { ok: true, text: content };
		}, interrupt: async () => {}, dispose: async () => {},
	};
	const service = new ComputerUseController({
		supported: true, backend, ledger: { load: async () => [], save: async () => {} },
		display: { read: () => display, update: (next) => { display = { ...display, ...next }; }, yield: () => () => {} },
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

async function enableAndChoose() {
	await waitFor(() => expect((screen.getByRole("switch", { name: "开启电脑操作" }) as HTMLButtonElement).disabled).toBe(false));
	await userEvent.click(screen.getByRole("switch", { name: "开启电脑操作" }));
	await waitFor(() => expect((screen.getByRole("combobox", { name: "选择应用窗口" }) as HTMLButtonElement).disabled).toBe(false));
	await userEvent.click(screen.getByRole("combobox", { name: "选择应用窗口" }));
	await userEvent.click(await screen.findByRole("option", { name: "Example document" }));
}

describe("computer use normal user workflow", () => {
	it("enters from the page, grants observation then input, controls display, hides/restores and stops", async () => {
		const f = fixture();
		render(<Provider store={f.store}><ComputerUsePage /></Provider>);
		await enableAndChoose();
		await userEvent.click(screen.getByRole("button", { name: "授权此对话" }));
		await waitFor(async () => expect((await f.service.state()).permission).toBe("observe"));
		const request = { sessionId: "session-1", input: { action: "observe" as const } };
		await act(async () => { expect((await f.service.execute(request, new AbortController().signal)).isError).not.toBe(true); });
		await act(async () => { expect((await f.service.execute({ ...request, input: { action: "fill", element: "ref-1", text: "changed" } }, new AbortController().signal)).isError).toBe(true); });
		await userEvent.click(screen.getByRole("combobox", { name: "允许 AI 做什么" }));
		await userEvent.click(await screen.findByRole("option", { name: "协作：仅后台操作" }));
		await userEvent.click(screen.getByRole("button", { name: "授权此对话" }));
		await waitFor(async () => expect((await f.service.state()).permission).toBe("background"));
		await act(async () => { await f.service.execute({ sessionId: "session-1", input: { action: "fill", element: "ref-1", text: "changed" } }, new AbortController().signal); });
		expect(f.content()).toBe("changed");
		await userEvent.click(screen.getByRole("switch", { name: "主窗口置顶" }));
		await waitFor(async () => expect((await f.service.state()).topmost).toBe(true));
		await userEvent.click(screen.getByRole("button", { name: "隐藏主窗口" }));
		await screen.findByRole("button", { name: "唤回主窗口" });
		await userEvent.click(screen.getByRole("button", { name: "隐藏目标窗口" }));
		const hidden = screen.getByRole("region", { name: "由本功能隐藏的窗口" });
		await userEvent.click(await within(hidden).findByRole("button", { name: "恢复查看: Example document" }));
		expect((await f.service.state()).sessionId).toBe("session-1");
		await userEvent.click(screen.getByRole("button", { name: "我来接管" }));
		await screen.findByText("由你接管，AI 不会继续操作。");
		await userEvent.click(screen.getByRole("button", { name: "结束并恢复窗口" }));
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
		await f.service.control({ action: "grant", sessionId: "session-old", targetId: target.id, permission: "observe" });
		render(<Provider store={f.store}><ComputerUsePage /></Provider>);
		await screen.findByText("已授权，等待对话中的 AI 操作。");
		expect((screen.getByRole("button", { name: "授权此对话" }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText(/控制权仍属于另一个对话/)).toBeTruthy();
		expect(screen.getByText(/已授权对话：Earlier task/)).toBeTruthy();
		await userEvent.click(screen.getByRole("button", { name: "结束并恢复窗口" }));
		await waitFor(() => expect((screen.getByRole("button", { name: "授权此对话" }) as HTMLButtonElement).disabled).toBe(false));
	});

	it("identifies an unnamed previous owner by its stable identifier", async () => {
		const f = fixture();
		await f.service.control({ action: "enable", enabled: true });
		await f.service.control({ action: "grant", sessionId: "session-old", targetId: target.id, permission: "observe" });
		render(<Provider store={f.store}><ComputerUsePage /></Provider>);
		expect(await screen.findByText(/未命名的已授权对话（标识：session-old）/)).toBeTruthy();
	});

	it("requires a current conversation rather than exposing raw session identifiers", async () => {
		const f = fixture(false);
		render(<Provider store={f.store}><ComputerUsePage /></Provider>);
		await enableAndChoose();
		expect((screen.getByRole("button", { name: "授权此对话" }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText(/请先在侧栏新建或打开一个对话/)).toBeTruthy();
	});
});
