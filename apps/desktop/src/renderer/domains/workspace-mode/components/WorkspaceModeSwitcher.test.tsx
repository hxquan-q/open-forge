// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	workspaceModeByProjectAtom,
	WORKSPACE_MODE_STORAGE_KEY,
	type WorkspaceMode,
} from "@shared/store/atoms";
import { WorkspaceModeSwitcher } from "./WorkspaceModeSwitcher";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// 透传真实实现，只记「探针在什么状态下被拉开」：切换耗时基线靠这一段把窗口开在
// setMode 之前，否则被测的那次提交已经跑完，marks / commits 全是空的。
const perfProbe = vi.hoisted(() => ({
	begin: vi.fn(),
	persistedModeAtBegin: null as string | null,
}));
vi.mock("@shared/lib/perf-send", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@shared/lib/perf-send")>();
	return {
		...actual,
		perfSendBegin: (trigger: string) => {
			perfProbe.begin(trigger);
			perfProbe.persistedModeAtBegin = localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY);
			return actual.perfSendBegin(trigger);
		},
	};
});

vi.mock("@shared/components/ui/segmented-control", () => ({
	SegmentedControl: ({
		items,
		value,
		onChange,
	}: {
		items: ReadonlyArray<{ key: string; label: string; icon?: string }>;
		value: string;
		onChange: (key: string) => void;
	}) => (
		<div>
			{items.map((item) => (
				<button
					key={item.key}
					type="button"
					aria-pressed={item.key === value}
					data-icon={item.icon}
					onClick={() => onChange(item.key)}
				>
					{item.label}
				</button>
			))}
		</div>
	),
}));

vi.mock("@shared/components/ui/tooltip", () => ({
	Tooltip: ({ children }: PropsWithChildren) => <>{children}</>,
	TooltipTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
	TooltipContent: ({ children }: PropsWithChildren) => <span data-testid="workspace-mode-hint">{children}</span>,
}));

let routeParams: { cwd?: string } = {};
let routeSearch: { cwd?: string } = {};

vi.mock("@tanstack/react-router", () => ({
	useParams: () => routeParams,
	useSearch: () => routeSearch,
}));

function memoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key),
		clear: () => map.clear(),
		key: (index: number) => [...map.keys()][index] ?? null,
		get length() {
			return map.size;
		},
	};
}

function renderSwitcher(store = createStore(), cwdOverride?: string) {
	const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
	return { store, ...render(<WorkspaceModeSwitcher cwdOverride={cwdOverride} />, { wrapper }) };
}

beforeEach(() => {
	vi.stubGlobal("localStorage", memoryStorage());
	routeParams = {};
	routeSearch = {};
	perfProbe.begin.mockReset();
	perfProbe.persistedModeAtBegin = null;
});

afterEach(cleanup);

describe("WorkspaceModeSwitcher", () => {
	it("默认 coding；点击 work 后按项目 cwd 持久化", async () => {
		routeParams = { cwd: encodeURIComponent("/repo/a") };
		const { store } = renderSwitcher();
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: /workspace\.mode\.work/ }));

		expect(store.get(workspaceModeByProjectAtom).get("/repo/a")).toBe("work");
		expect(JSON.parse(localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY)!)).toEqual({ "/repo/a": "work" });
		// 另一个项目不受本次切换影响。
		const other = new Map(store.get(workspaceModeByProjectAtom));
		expect(other.get("/repo/b")).toBeUndefined();
	});

	it("项目无 cwd 可归属时不渲染，避免切换无处持久化", () => {
		const { container } = renderSwitcher();
		expect(container.firstChild).toBeNull();
	});

	it("已有持久化模式的项目直接呈现该模式", () => {
		routeParams = { cwd: encodeURIComponent("/repo/a") };
		const store = createStore();
		store.set(workspaceModeByProjectAtom, new Map<string, WorkspaceMode>([["/repo/a", "work"]]));
		renderSwitcher(store);
		expect(screen.getByRole("button", { name: /workspace\.mode\.work/ }).getAttribute("aria-pressed")).toBe(
			"true",
		);
		expect(screen.getByRole("button", { name: /workspace\.mode\.coding/ }).getAttribute("aria-pressed")).toBe(
			"false",
		);
	});

	it("显式 cwdOverride 时按该 cwd 读写，不跟随路由 cwd（新会话页选中项目后仍能切档）", async () => {
		routeParams = { cwd: encodeURIComponent("/repo/other") };
		const store = createStore();
		store.set(workspaceModeByProjectAtom, new Map<string, WorkspaceMode>([["/repo/session-cwd", "work"]]));
		renderSwitcher(store, "/repo/session-cwd");
		const user = userEvent.setup();

		// 读：呈现的是 override cwd 的档位，而不是路由 cwd 的默认档。
		expect(screen.getByRole("button", { name: /workspace\.mode\.work/ }).getAttribute("aria-pressed")).toBe(
			"true",
		);

		// 写：切回 coding 也落在 override cwd 上，路由 cwd 不受影响。
		await user.click(screen.getByRole("button", { name: /workspace\.mode\.coding/ }));

		expect(store.get(workspaceModeByProjectAtom).get("/repo/session-cwd")).toBeUndefined();
		expect(store.get(workspaceModeByProjectAtom).get("/repo/other")).toBeUndefined();
		expect(JSON.parse(localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY)!)).toEqual({});
	});

	it("文档与研究用文档图标，并说明切页头不改当前会话", () => {
		routeParams = { cwd: encodeURIComponent("/repo/a") };
		renderSwitcher();
		expect(screen.getByRole("button", { name: /workspace\.mode\.work/ }).getAttribute("data-icon")).toBe(
			"icon-[solar--document-text-linear]",
		);
		expect(screen.getByRole("group").getAttribute("aria-label")).toBe("workspace.mode.switch");
		expect(screen.getByTestId("workspace-mode-hint").textContent).toBe("workspace.mode.hint");
	});

	it("切换点击拉开既有交互探针，且窗口早于模式落盘", async () => {
		routeParams = { cwd: encodeURIComponent("/repo/a") };
		renderSwitcher();
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: /workspace\.mode\.work/ }));

		expect(perfProbe.begin).toHaveBeenCalledExactlyOnceWith("workspace-mode-switch");
		// 落盘发生在 setMode 内；窗口打开时还不该有新值，否则量到的是已经跑完的提交。
		expect(perfProbe.persistedModeAtBegin).toBeNull();
		expect(JSON.parse(localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY)!)).toEqual({ "/repo/a": "work" });
	});
});
