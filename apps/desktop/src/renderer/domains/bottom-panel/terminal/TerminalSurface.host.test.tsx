// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { type JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme } from "../../../shared/theme/apply";
import { saveFontPreferences } from "../../../shared/theme/fonts";
import type { TerminalEventEnvelope } from "../../../../shared/terminal-ipc";
import type { TerminalSurfaceHandle } from "./terminal-surface-handle";

const terminals: FakeTerminal[] = [];
const disposeLog: string[] = [];
const terminalControl = { disposeThrows: false };
let rendererChoice: "canvas" | "webgl" = "canvas";

class FakeTerminal {
	readonly writes: string[] = [];
	cols = 80;
	rows = 24;
	options: { theme?: unknown; fontFamily?: string } = {};
	unicode = { activeVersion: "" };

	constructor(options: { theme?: unknown; fontFamily?: string }) {
		this.options = options;
		terminals.push(this);
	}

	loadAddon(): void {}
	open(): void {}
	write(data: string): void {
		this.writes.push(data);
	}
	writeln(data: string): void {
		this.write(`${data}\n`);
	}
	dispose(): void {
		disposeLog.push("terminal");
		if (terminalControl.disposeThrows) {
			throw new TypeError("Cannot read properties of undefined (reading 'onShowLinkUnderline')");
		}
	}
	focus(): void {}
	onData(): { dispose(): void } {
		return { dispose() {} };
	}
}

vi.mock("@xterm/xterm", () => ({ Terminal: FakeTerminal }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("@xterm/addon-fit", () => ({
	FitAddon: class {
		fit(): void {}
	},
}));
vi.mock("@xterm/addon-serialize", () => ({
	SerializeAddon: class {
		serialize(): string {
			return "snapshot";
		}
	},
}));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));
vi.mock("@xterm/addon-webgl", () => ({
	WebglAddon: class {
		onContextLoss(): void {}
		dispose(): void {
			disposeLog.push("webgl");
		}
	},
}));
vi.mock("@xterm/addon-canvas", () => ({
	CanvasAddon: class {
		dispose(): void {
			disposeLog.push("canvas");
		}
	},
}));
vi.mock("./select-terminal-renderer", () => ({
	detectWebgl2Support: () => false,
	selectTerminalRenderer: () => rendererChoice,
}));
vi.mock("./terminal-theme", () => ({
	createDocumentCssVariableReader: () => () => "",
	buildTerminalTheme: () => ({}),
}));
vi.mock("react-i18next", () => {
	// t 身份必须稳定：真实 i18next 的 t 不变，effect 才不会因依赖抖动反复重建终端。
	const t = (key: string, opts?: { code?: number }) => `${key}:${opts?.code ?? ""}`;
	return { useTranslation: () => ({ t }) };
});

const { TerminalSurface } = await import("./TerminalSurface.js");

function createTerminalIpc() {
	const listeners = new Set<(envelope: TerminalEventEnvelope) => void>();
	let seq = 0;
	return {
		open: vi.fn(async ({ cwd }: { cwd: string }) => {
			seq += 1;
			return {
				terminalId: `pty-${seq}`,
				backend: "local" as const,
				replay: `ready:${cwd}`,
				replayTruncated: false,
			};
		}),
		write: vi.fn(async () => undefined),
		resize: vi.fn(async () => undefined),
		close: vi.fn(async () => undefined),
		foregroundProcess: vi.fn(async () => null),
		saveSnapshot: vi.fn(async () => undefined),
		loadSnapshot: vi.fn(async (tabId: string) => `snap:${tabId}`),
		onEvent: vi.fn((listener: (envelope: TerminalEventEnvelope) => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}),
		emit(envelope: TerminalEventEnvelope): void {
			for (const listener of listeners) listener(envelope);
		},
	};
}

function handle(partial: Partial<TerminalSurfaceHandle> & Pick<TerminalSurfaceHandle, "tabId">): TerminalSurfaceHandle {
	return {
		cwd: "/repo",
		active: true,
		payload: undefined,
		setMeta: vi.fn(),
		setPayload: vi.fn(),
		setCloseGuard: vi.fn(),
		...partial,
	};
}

function Surface({ value }: { value: TerminalSurfaceHandle }): JSX.Element {
	return <TerminalSurface handle={value} />;
}

describe("TerminalSurface host adapters", () => {
	const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

	beforeEach(() => {
		terminals.length = 0;
		localStorage.clear();
		document.documentElement.removeAttribute("style");
		HTMLElement.prototype.getBoundingClientRect = () =>
			({ width: 400, height: 240, top: 0, left: 0, bottom: 240, right: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe(): void {}
				disconnect(): void {}
				unobserve(): void {}
			},
		);
	});

	afterEach(() => {
		cleanup();
		HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
		vi.unstubAllGlobals();
	});

	it("changing the code font refits the existing PTY without losing output", async () => {
		const ipc = createTerminalIpc();
		vi.stubGlobal("window", Object.assign(window, { vetta: { terminal: ipc } }));
		applyTheme("dark", "mono");
		const view = render(
			<Provider store={createStore()}>
				<Surface value={handle({ tabId: "font-terminal" })} />
			</Provider>,
		);
		await waitFor(() => expect(ipc.open).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(terminals[0].writes.join("")).toContain("ready:/repo"));
		const output = [...terminals[0].writes];
		const resizes = ipc.resize.mock.calls.length;
		act(() => {
			saveFontPreferences({ ui: "", code: "Test Mono" });
			applyTheme("light", "sand");
		});
		await waitFor(() => expect(terminals[0].options.fontFamily).toContain('"Test Mono"'));
		expect(ipc.resize.mock.calls.length).toBeGreaterThan(resizes);
		expect(terminals).toHaveLength(1);
		expect(terminals[0].writes).toEqual(output);
		expect(ipc.open).toHaveBeenCalledTimes(1);
		expect(ipc.close).not.toHaveBeenCalled();
		act(() => {
			saveFontPreferences({ ui: "", code: "" });
			applyTheme("dark", "mono");
		});
		await waitFor(() => expect(terminals[0].options.fontFamily).not.toContain("Test Mono"));
		view.unmount();
		expect(ipc.close).toHaveBeenCalledTimes(1);
	});

	it("右栏与底部面板各开一个 PTY：快照键和输出互不串台", async () => {
		const ipc = createTerminalIpc();
		vi.stubGlobal("window", Object.assign(window, { vetta: { terminal: ipc } }));
		const store = createStore();
		const bottom = handle({ tabId: "tab-bottom-1", cwd: "/repo" });
		const activity = handle({ tabId: "activity-terminal:ws-1", cwd: "/repo" });

		const view = render(
			<Provider store={store}>
				<Surface value={bottom} />
				<Surface value={activity} />
			</Provider>,
		);

		await vi.waitFor(() => {
			expect(ipc.loadSnapshot).toHaveBeenCalledWith("tab-bottom-1");
			expect(ipc.loadSnapshot).toHaveBeenCalledWith("activity-terminal:ws-1");
			expect(ipc.open.mock.calls.length).toBeGreaterThanOrEqual(2);
		});
		const opened = await Promise.all(
			ipc.open.mock.results.filter((result) => result.type === "return").map((result) => result.value),
		);
		const bottomPty = opened.at(-2) as { terminalId: string };
		const activityPty = opened.at(-1) as { terminalId: string };
		expect(bottomPty.terminalId).not.toBe(activityPty.terminalId);
		expect(terminals.length).toBeGreaterThanOrEqual(2);
		const bottomTerm = terminals.at(-2);
		const activityTerm = terminals.at(-1);

		ipc.emit({ terminalId: bottomPty.terminalId, event: { kind: "data", data: "from-bottom" } });
		ipc.emit({ terminalId: activityPty.terminalId, event: { kind: "data", data: "from-activity" } });

		expect(bottomTerm?.writes).toEqual(expect.arrayContaining(["from-bottom"]));
		expect(activityTerm?.writes).toEqual(expect.arrayContaining(["from-activity"]));
		expect(bottomTerm?.writes).not.toEqual(expect.arrayContaining(["from-activity"]));
		expect(activityTerm?.writes).not.toEqual(expect.arrayContaining(["from-bottom"]));

		view.unmount();
		await vi.waitFor(() => expect(ipc.close).toHaveBeenCalled());
		expect(ipc.close).toHaveBeenCalledWith(bottomPty.terminalId);
		expect(ipc.close).toHaveBeenCalledWith(activityPty.terminalId);
	});

	it("卸载时先摘除渲染 addon 再销毁终端（canvas 路径）", async () => {
		const ipc = createTerminalIpc();
		vi.stubGlobal("window", Object.assign(window, { vetta: { terminal: ipc } }));
		const view = render(
			<Provider store={createStore()}>
				<Surface value={handle({ tabId: "tab-order-canvas", cwd: "/repo" })} />
			</Provider>,
		);
		await vi.waitFor(() => expect(ipc.open).toHaveBeenCalled());

		disposeLog.length = 0;
		view.unmount();

		// xterm 6 的销毁顺序先清 linkifier 再轮 addon：canvas addon 的收尾回调要用活着的
		// linkifier 重建 DOM renderer，顺序反过来必抛 TypeError 并击穿路由错误边界（BUG-0041）。
		expect(disposeLog.indexOf("canvas")).toBeGreaterThanOrEqual(0);
		expect(disposeLog.indexOf("canvas")).toBeLessThan(disposeLog.indexOf("terminal"));
	});

	it("卸载时先摘除渲染 addon 再销毁终端（webgl 路径）", async () => {
		rendererChoice = "webgl";
		try {
			const ipc = createTerminalIpc();
			vi.stubGlobal("window", Object.assign(window, { vetta: { terminal: ipc } }));
			const view = render(
				<Provider store={createStore()}>
					<Surface value={handle({ tabId: "tab-order-webgl", cwd: "/repo" })} />
				</Provider>,
			);
			await vi.waitFor(() => expect(ipc.open).toHaveBeenCalled());

			disposeLog.length = 0;
			view.unmount();

			expect(disposeLog.indexOf("webgl")).toBeGreaterThanOrEqual(0);
			expect(disposeLog.indexOf("webgl")).toBeLessThan(disposeLog.indexOf("terminal"));
		} finally {
			rendererChoice = "canvas";
		}
	});

	it("反复挂载/卸载后每个 WebGL addon 都被释放，context 不累积", async () => {
		rendererChoice = "webgl";
		try {
			const ipc = createTerminalIpc();
			vi.stubGlobal("window", Object.assign(window, { vetta: { terminal: ipc } }));

			disposeLog.length = 0;
			for (let cycle = 0; cycle < 3; cycle += 1) {
				const view = render(
					<Provider store={createStore()}>
						<Surface value={handle({ tabId: `tab-cycle-${cycle}`, cwd: "/repo" })} />
					</Provider>,
				);
				await vi.waitFor(() => expect(ipc.open.mock.calls.length).toBeGreaterThanOrEqual(cycle + 1));
				view.unmount();
			}

			// BUG-0034：分屏/收起重开每轮都新建 xterm + WebglAddon，卸载必须成对释放，
			// 否则 Chromium 的 WebGL context 上限被耗尽、最旧终端黑屏。
			expect(disposeLog.filter((entry) => entry === "webgl")).toHaveLength(3);
			expect(disposeLog.filter((entry) => entry === "terminal")).toHaveLength(3);
		} finally {
			rendererChoice = "canvas";
		}
	});

	it("terminal.dispose 抛错时卸载不升级为整页渲染错误", async () => {
		const ipc = createTerminalIpc();
		vi.stubGlobal("window", Object.assign(window, { vetta: { terminal: ipc } }));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const view = render(
			<Provider store={createStore()}>
				<Surface value={handle({ tabId: "tab-throw", cwd: "/repo" })} />
			</Provider>,
		);
		await vi.waitFor(() => expect(ipc.open).toHaveBeenCalled());

		terminalControl.disposeThrows = true;
		try {
			expect(() => view.unmount()).not.toThrow();
		} finally {
			terminalControl.disposeThrows = false;
			warn.mockRestore();
		}
	});
});
