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

function renderSwitcher(store = createStore()) {
	const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
	return { store, ...render(<WorkspaceModeSwitcher />, { wrapper }) };
}

beforeEach(() => {
	vi.stubGlobal("localStorage", memoryStorage());
	routeParams = {};
	routeSearch = {};
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
});
