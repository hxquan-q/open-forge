// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	activeInputDraftKeyAtom,
	currentScenarioAtom,
	activeSessionAtom,
	bottomPanelStateAtom,
	collectBottomPanelLeaves,
	dispatchBottomPanelAtom,
	pluginBottomPanelsAtom,
	type RegisteredBottomPanel,
} from "@shared/store/atoms";
import { createStore, Provider, useSetAtom } from "jotai";
import { type JSX, useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTerminalCapabilitiesCacheForTests } from "../hooks/useTerminalCapabilities";
import { useBottomPanelInstance } from "../registry/instance-context";
import { readTerminalLaunchPayload } from "../terminal/terminal-launch";
import { BottomPanelHost } from "./BottomPanelHost";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { exists: () => true } }),
}));

/**
 * xterm 与 PTY 是真实的外部边界，jsdom 里跑不起来；这里换成只报出「这个终端要在哪敲什么」的替身。
 * 真正的「只敲一次」由 `claimTerminalLaunch` 的单测覆盖。
 */
vi.mock("../terminal/TerminalSurface", () => ({
	TerminalSurface: function FakeTerminal(): JSX.Element {
		const handle = useBottomPanelInstance();
		const launch = readTerminalLaunchPayload(handle.payload, handle.cwd);
		useEffect(() => {
			if (launch?.label) handle.setMeta({ label: launch.label });
		}, [handle, launch?.label]);
		return <p>{launch ? `terminal:${launch.command}@${launch.cwd ?? handle.cwd}` : "terminal:plain"}</p>;
	},
}));

const SCOPE = { key: "/session.json", cwd: "/workspace", scenario: "project" as const };

function ScriptsPanel(): JSX.Element {
	const handle = useBottomPanelInstance();
	const [launched, setLaunched] = useState<string | null>(null);
	const [message, setMessage] = useState("");
	const attempt = (action: () => void): void => {
		try {
			action();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
	};
	return (
		<div>
			<button
				type="button"
				onClick={() =>
					attempt(() =>
						setLaunched(
							handle.openTerminal({ command: "bun run dev", cwd: "/workspace/apps/web", label: "web: dev" }),
						),
					)
				}
			>
				run-dev
			</button>
			<button type="button" onClick={() => setMessage(String(launched ? handle.revealTab(launched) : false))}>
				reveal
			</button>
			<button type="button" onClick={() => attempt(() => handle.openTerminal({ command: "ls", cwd: "/etc" }))}>
				run-outside
			</button>
			<p>message:{message}</p>
		</div>
	);
}

const scriptsPanel: RegisteredBottomPanel = {
	pluginId: "scripts",
	pluginName: "Scripts",
	panelId: "scripts",
	label: "脚本",
	component: ScriptsPanel,
	scope_use: ["project"],
};

function Harness(): JSX.Element {
	const dispatch = useSetAtom(dispatchBottomPanelAtom);
	return (
		<>
			<button
				type="button"
				onClick={() =>
					dispatch({ type: "open-tab", tabId: "scripts-tab", componentId: "plugin:scripts:scripts", newLeafId: "leaf-1" })
				}
			>
				open-scripts
			</button>
			<BottomPanelHost />
		</>
	);
}

function setup(localPty: boolean) {
	const capabilities = vi.fn(async () => ({ localPty }));
	Object.assign(window, { vetta: { terminal: { capabilities } } });
	const store = createStore();
	store.set(activeInputDraftKeyAtom, SCOPE.key);
	store.set(currentScenarioAtom, SCOPE.scenario);
	store.set(activeSessionAtom, { cwd: SCOPE.cwd, sessionPath: SCOPE.key, runtimeId: "s1" });
	store.set(pluginBottomPanelsAtom, [scriptsPanel]);
	render(
		<Provider store={store}>
			<Harness />
		</Provider>,
	);
	return { store, user: userEvent.setup(), capabilities };
}

function leaves(store: ReturnType<typeof createStore>) {
	return collectBottomPanelLeaves(store.get(bottomPanelStateAtom).root);
}

beforeEach(() => {
	resetTerminalCapabilitiesCacheForTests();
	const storage = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		clear: () => storage.clear(),
		getItem: (key: string) => storage.get(key) ?? null,
		removeItem: (key: string) => void storage.delete(key),
		setItem: (key: string, value: string) => void storage.set(key, value),
	});
});

describe("面板替用户开终端跑命令", () => {
	it("openTerminal 在同格开出带载荷的终端 tab，revealTab 命中已开 tab", async () => {
		const { store, user } = setup(true);
		await user.click(await screen.findByRole("button", { name: "open-scripts" }));
		await user.click(await screen.findByRole("button", { name: "run-dev" }));

		// 布局层验证：脚本所在格新增了终端 tab，载荷带命令与子目录。
		await waitFor(() => {
			const leaf = leaves(store)[0];
			const terminal = leaf?.tabs.find((tab) => tab.componentId === "terminal");
			expect(terminal).toMatchObject({
				payload: { command: "bun run dev", cwd: "/workspace/apps/web", label: "web: dev" },
			});
		});
		// reveal：切回脚本页后一键回到终端——activate 回脚本 tab 使面板内容可访问。
		await user.click(screen.getByRole("tab", { name: "脚本" }));
		await user.click(await screen.findByRole("button", { name: "reveal" }));
		await waitFor(() => {
			const leaf = leaves(store)[0];
			expect(leaf?.activeTabId).toBe(leaf?.tabs.find((tab) => tab.componentId === "terminal")?.tabId);
		});
	});

	it("目录越出会话 cwd 时拒绝，不开任何终端", async () => {
		const { store, user } = setup(true);
		await user.click(screen.getByRole("button", { name: "open-scripts" }));

		await user.click(await screen.findByRole("button", { name: "run-outside" }));

		expect(screen.getByText(/message:openTerminal: cwd must be/)).not.toBeNull();
		expect(leaves(store)[0]?.tabs).toHaveLength(1);
	});

	it("本机没有 PTY 的本地会话里拒绝开终端", async () => {
		const { store, user, capabilities } = setup(false);
		await user.click(screen.getByRole("button", { name: "open-scripts" }));
		// 能力探测默认乐观；等它回来、终端从可用组件里退场之后再点。
		await waitFor(() => expect(capabilities).toHaveBeenCalled());
		await act(async () => {});

		await user.click(await screen.findByRole("button", { name: "run-dev" }));

		expect(screen.getByText(/message:openTerminal: terminals are not available/)).not.toBeNull();
		expect(leaves(store)[0]?.tabs).toHaveLength(1);
	});
});
