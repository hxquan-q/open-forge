// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import { fireEvent } from "@testing-library/react";
import type { InstalledPlugin } from "@preload/api";
import { pluginHeaderActionsAtom } from "@shared/store/plugin-atoms";
import type { PluginPermission } from "@vetta-org/plugin-sdk";
import { Provider, createStore } from "jotai";
import { act, useContext } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationHeaderActions } from "@domains/header-actions/ConversationHeaderActions";
import { headerActionLayoutAtomFor, parseHeaderLayout } from "@domains/header-actions/layout-store";
import { publishHeaderActions } from "../components/plugin-header-action-publication";
import { PluginLocalContributions } from "./plugin-local-contributions";
import { createPluginUiApi } from "./plugin-ui-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// 真实的 i18n 作用域每次渲染都会换一个 context 值：探针因此会跟着父级重渲染，
// 这正是「发布 → 父级更新 → 探针重渲染 → 再发布」死循环的来源，所以 mock 也要这样做。
const { UnstableContext } = vi.hoisted(() => ({ UnstableContext: { current: null as null | React.Context<object> } }));

vi.mock("../runtime/plugin-i18n", async () => {
	const { createContext } = await import("react");
	UnstableContext.current = createContext<object>({});
	return {
		PluginInlineI18nBoundary: ({ children }: { children: React.ReactNode }) => {
			const Context = UnstableContext.current as React.Context<object>;
			return <Context.Provider value={{}}>{children}</Context.Provider>;
		},
		usePluginTextResolver: () => (_id: string, text: string) => text,
	};
});

const roots: Root[] = [];
afterEach(() => {
	act(() => {
		for (const root of roots.splice(0)) root.unmount();
	});
	document.body.replaceChildren();
	localStorage.clear();
	vi.restoreAllMocks();
});

function createUi(permissions: PluginPermission[], grantedPermissions = permissions, id = "demo-plugin") {
	const contributions = new PluginLocalContributions();
	const plugin = {
		id,
		name: "Demo",
		permissions,
		grantedPermissions,
	} as unknown as InstalledPlugin;
	const ui = createPluginUiApi({
		plugin,
		contributions,
		onChanged: () => {},
		disposers: [],
		agentContributions: { handlers: [] } as never,
		capabilitySessionId: "session-1",
	});
	return { contributions, ui, plugin };
}

describe("registerHeaderAction", () => {
	it("registers with the permission and removes on dispose", () => {
		const { contributions, ui } = createUi(["ui.slot.header-action"]);
		const disposable = ui.registerHeaderAction({ id: "open", order: 10, useAction: () => null });
		expect(contributions.headerActions).toHaveLength(1);
		disposable.dispose();
		expect(contributions.headerActions).toHaveLength(0);
	});

	it.each([false, true])("requires both a manifest declaration and a host grant (%s)", (declared) => {
		const grant: PluginPermission[] = ["ui.slot.header-action"];
		const { contributions, ui } = createUi(declared ? grant : [], declared ? [] : grant);
		ui.registerHeaderAction({ id: "open", useAction: () => null });
		expect(contributions.headerActions).toHaveLength(0);
	});

	it("rejects an empty id, a non-finite order, a missing hook and a duplicate id", () => {
		const { ui } = createUi(["ui.slot.header-action"]);
		expect(() => ui.registerHeaderAction({ id: " ", useAction: () => null })).toThrow();
		expect(() => ui.registerHeaderAction({ id: "x", order: Number.NaN, useAction: () => null })).toThrow();
		expect(() => ui.registerHeaderAction({ id: "y", useAction: undefined as never })).toThrow();
		ui.registerHeaderAction({ id: "dup", useAction: () => null });
		expect(() => ui.registerHeaderAction({ id: "dup", useAction: () => null })).toThrow();
	});
});

describe("ConversationHeaderActions", () => {
	const builtin = (name: string) => ({
		key: `builtin:${name}`,
		title: name,
		icon: <span />,
		behavior: { type: "click" as const, onClick: () => {} },
	});

	// 默认给一份空的已存布局：既有用例验证的是「有存档时」的排布规则；「从没调整过」的默认见下方专门的用例。
	async function render(
		actions: unknown[],
		builtins = [builtin("export"), builtin("pin")],
		saved: unknown = { top: [], tray: [] },
		surface?: "conversation" | "new-session",
	) {
		const store = createStore();
		store.set(pluginHeaderActionsAtom, actions as never);
		store.set(headerActionLayoutAtomFor(surface ?? "conversation"), saved as never);
		const app = document.createElement("div");
		document.body.append(app);
		const root = createRoot(app);
		roots.push(root);
		await act(async () => {
			root.render(
				<Provider store={store}>
					<ConversationHeaderActions
						builtins={builtins}
						cwd="/repo"
						pinned={<button type="button" data-testid="pinned" />}
						surface={surface}
					/>
				</Provider>,
			);
		});
		return { app, store };
	}

	const titles = (app: HTMLElement) =>
		[...app.querySelectorAll("[data-slot=button-group] button[title]")].map((button) => button.getAttribute("title"));

	const action = (id: string, useAction: () => unknown) => ({
		pluginId: "p",
		pluginName: "P",
		actionId: `p:${id}`,
		useAction,
	});

	it("hot reload: a re-registered action replaces the old one in place, and a removed one disappears", async () => {
		const { app, store } = await render([action("one", () => ({ title: "v1", icon: <i />, onClick: () => {} }))]);
		expect(titles(app)).toEqual(["v1", "export", "pin"]);
		// 热更新：同一个动作 id、换了一个 hook（旧探针不能被复用，否则前后 hook 序列不同会报错）。
		const errors: unknown[] = [];
		const error = vi.spyOn(console, "error").mockImplementation((message) => {
			errors.push(message);
		});
		await act(async () => {
			store.set(pluginHeaderActionsAtom, [
				action("one", () => ({
					title: "v2",
					icon: <i />,
					menuItems: [{ id: "a", label: "A", onSelect: () => {} }],
				})),
			] as never);
		});
		expect(titles(app)).toEqual(["v2", "export", "pin"]);
		expect(errors).toEqual([]);
		await act(async () => {
			store.set(pluginHeaderActionsAtom, [] as never);
		});
		expect(titles(app)).toEqual(["export", "pin"]);
		error.mockRestore();
	});

	it("does not loop when the plugin hook re-renders with its parent's context", async () => {
		const consume = () => {
			// 与真实插件里的 useTranslation() 一样吃 i18n 作用域的 context。
			useContext(UnstableContext.current as React.Context<object>);
			return { title: "ctx", icon: <i />, onClick: () => {} };
		};
		const errors: unknown[] = [];
		const error = vi.spyOn(console, "error").mockImplementation((message) => {
			errors.push(message);
		});
		const { app } = await render([action("ctx", consume)]);
		expect(errors).toEqual([]);
		expect(titles(app)).toEqual(["ctx", "export", "pin"]);
		error.mockRestore();
	});

	it("plugin re-renders with an unchanged declaration do not re-render the button group, yet clicks reach the latest callback", async () => {
		const clicks: number[] = [];
		let renders = 0;
		const hook = () => {
			// 每次重渲染都换新的对象、新的回调（插件常见写法）；内容不变。
			const context = useContext(UnstableContext.current as React.Context<object>);
			renders += 1;
			const version = renders;
			void context;
			return { title: "same", icon: <i className="x" />, onClick: () => clicks.push(version) };
		};
		const registered = action("stable", hook);
		const { app, store } = await render([registered]);
		const button = app.querySelector("[data-header-action-bar] button[title=same]") as HTMLButtonElement;
		const before = button;
		const rendersBefore = renders;
		// 触发探针重渲染：换一个新数组重新发布同一个动作，父级重渲染，i18n 作用域给的 context 是新值，探针跟着重渲染。
		await act(async () => {
			store.set(pluginHeaderActionsAtom, [registered] as never);
		});
		expect(renders).toBeGreaterThan(rendersBefore);
		// 同一个 DOM 节点：按钮没有被重建。
		expect(app.querySelector("[data-header-action-bar] button[title=same]")).toBe(before);
		act(() => {
			before.click();
		});
		// 点击调用的是探针最近一次渲染里的回调，而不是发布时那一次。
		expect(clicks).toHaveLength(1);
		expect(clicks[0]).toBe(renders);
	});

	it("puts plugin actions ahead of the built-ins and keeps the pinned item last", async () => {
		const { app } = await render([action("one", () => ({ title: "one", icon: <i />, onClick: () => {} }))]);
		expect(titles(app)).toEqual(["one", "export", "pin"]);
		// 活动面板开关是独立的一组，在按钮组之外、最右侧。
		const pinned = app.querySelector("[data-testid=pinned]");
		expect(pinned).not.toBeNull();
		expect(pinned?.closest("[data-header-action-bar]")).toBeNull();
		expect(pinned?.closest("[data-slot=button-group]")).not.toBeNull();
	});

	it("an action whose hook returns null takes no slot", async () => {
		const { app } = await render([action("hidden", () => null)]);
		expect(titles(app)).toEqual(["export", "pin"]);
	});

	it("an invalid declaration is dropped and warned about, not rendered", async () => {
		const warnings: unknown[] = [];
		const warn = vi.spyOn(console, "warn").mockImplementation((message) => {
			warnings.push(message);
		});
		const { app } = await render([action("bad", () => ({ title: "bad", icon: <i /> }))]);
		expect(titles(app)).toEqual(["export", "pin"]);
		expect(warnings).toEqual([expect.stringContaining("p:bad")]);
		warn.mockRestore();
	});

	it("a throwing hook disappears without taking the others down", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { app } = await render([
			action("boom", () => {
				throw new Error("boom");
			}),
			action("ok", () => ({ title: "ok", icon: <i />, onClick: () => {} })),
		]);
		expect(titles(app)).toEqual(["ok", "export", "pin"]);
		error.mockRestore();
	});

	it("renders a registered plugin action alongside a built-in with the same id even if its icon throws", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { ui, plugin, contributions } = createUi(["ui.slot.header-action"], undefined, "builtin");
		const visits: string[] = [];
		function BrokenIcon(): null {
			throw new Error("icon failed");
		}
		const disposable = ui.registerHeaderAction({
			id: "pin",
			pin: "prefer",
			useAction: () => ({
				title: "plugin pin",
				icon: <BrokenIcon />,
				onClick: () => {
					visits.push("plugin pin");
				},
			}),
		});
		const publish = () => publishHeaderActions([{ ...plugin, headerActions: contributions.headerActions }]);
		const { app, store } = await render(publish());
		expect(titles(app)).toEqual(["plugin pin", "export", "pin"]);
		fireEvent.click(app.querySelector<HTMLButtonElement>('button[title="plugin pin"]')!);
		expect(visits).toEqual(["plugin pin"]);

		disposable.dispose();
		act(() => store.set(pluginHeaderActionsAtom, publish()));
		expect(titles(app)).toEqual(["export", "pin"]);
	});

	it("keeps at most seven in the header and stows the rest, built-ins counted", async () => {
		const many = Array.from({ length: 6 }, (_, index) =>
			action(`a${index}`, () => ({ title: `a${index}`, icon: <i />, onClick: () => {} })),
		);
		const { app } = await render(many);
		// 6 个插件 + 2 个内置 = 8，只显示 7；最后一个内置（pin）被收纳。
		expect(titles(app).filter((title) => title !== "customize")).toHaveLength(7);
		expect(titles(app)).not.toContain("pin");
	});

	it("for a user who never customised, shows only terminal, bottom panel and export, in that order", async () => {
		const { app } = await render(
			[
				{
					pluginId: "open-in-app",
					pluginName: "O",
					actionId: "open-in-app:open-in-app",
					useAction: () => ({ title: "open", icon: <i />, onClick: () => {} }),
				},
				action("other", () => ({ title: "other", icon: <i />, onClick: () => {} })),
			],
			["export", "pin", "terminal", "bottom-panel"].map(builtin),
			null,
		);
		expect(titles(app)).toEqual(["terminal", "bottom-panel", "export"]);
	});

	it("a stowed action that promotes itself while active shows next to the panel toggle", async () => {
		const pin = { ...builtin("pin"), active: true, promoteWhenActive: true };
		const { app } = await render([], [builtin("export"), pin], { top: ["builtin:export"], tray: ["builtin:pin"] });
		// 顶栏里只有 export；收纳里的 pin 因为选中并要求露出，出现在面板开关所在的那一组里，且在开关左边。
		const barTitles = [...app.querySelectorAll("[data-header-action-bar] button[title]")].map((button) =>
			button.getAttribute("title"),
		);
		expect(barTitles).not.toContain("pin");
		expect(barTitles).toContain("export");
		const group = app.querySelector("[data-testid=pinned]")?.closest("[data-slot=button-group]");
		const buttons = [...(group?.querySelectorAll("button") ?? [])];
		expect(buttons.map((button) => button.getAttribute("title") ?? "pinned-toggle")).toEqual([
			"pin",
			"pinned-toggle",
		]);
	});

	it("an inactive promotable action stays stowed", async () => {
		const pin = { ...builtin("pin"), active: false, promoteWhenActive: true };
		const { app } = await render([], [builtin("export"), pin], { top: ["builtin:export"], tray: ["builtin:pin"] });
		const group = app.querySelector("[data-testid=pinned]")?.closest("[data-slot=button-group]");
		expect(group?.querySelectorAll("button")).toHaveLength(1);
	});

	it("persists a drag reorder in the conversation layout", async () => {
		const initial = { top: ["builtin:export", "builtin:pin"], tray: [] };
		const { app } = await render([], [builtin("export"), builtin("pin")], initial);
		const click = (selector: string) => {
			const button = app.querySelector<HTMLButtonElement>(selector);
			expect(button).not.toBeNull();
			act(() => button?.click());
		};
		click("[data-header-action-tray-handle]");
		click("[data-header-action-adjust]");
		const bar = app.querySelector("[data-header-action-bar] [data-slot=button-group]") as HTMLElement;
		const dragged = bar.querySelector("button[title=export]") as HTMLElement;
		const dataTransfer = { setData() {}, setDragImage() {}, effectAllowed: "" };
		fireEvent.dragStart(dragged, { dataTransfer });
		fireEvent.drop(bar, { dataTransfer });
		fireEvent.keyDown(document, { key: "Escape" });

		const saved = parseHeaderLayout(localStorage.getItem("forge.headerActions.order"));
		expect(saved).toEqual({ top: ["builtin:pin", "builtin:export"], tray: [] });
		expect(titles(app)).toEqual(["pin", "export"]);
		vi.resetModules();
		const { headerActionLayoutAtomFor: loadLayout } = await import("@domains/header-actions/layout-store");
		expect(createStore().get(loadLayout("conversation"))).toEqual(saved);
	});

	it("honours the saved layout over the default order", async () => {
		const { app } = await render(
			[action("one", () => ({ title: "one", icon: <i />, onClick: () => {} }))],
			[builtin("export"), builtin("pin")],
			{ top: ["builtin:pin", "builtin:export"], tray: ["p:one"] },
		);
		expect(titles(app)).toEqual(["pin", "export"]);
	});
	it("renders a plugin label next to its icon when the row has room", async () => {
		const { app } = await render([
			action("status", () => ({ title: "status", label: "main", icon: <i />, onClick: () => {} })),
		]);
		// 有文字时按钮变宽（px-3），标签是按钮内容的一部分，悬浮提示仍是 title。
		const button = app.querySelector("[data-header-action-bar] button[title=status]") as HTMLButtonElement;
		expect(button.textContent).toContain("main");
		const label = app.querySelector("[data-header-action-bar] button[title=status] span") as HTMLElement;
		expect(label.tagName).toBe("SPAN");
	});

	it("drops labels when the bar is full, keeping the icon as the identifier", async () => {
		const many = Array.from({ length: 5 }, (_, index) =>
			action(`a${index}`, () => ({ title: `a${index}`, label: `L${index}`, icon: <i />, onClick: () => {} })),
		);
		const { app } = await render(many);
		expect(app.querySelector("[data-header-action-bar]")?.textContent).not.toContain("L0");
	});

	it("only shows actions that declared the current surface", async () => {
		const onlyNewSession = {
			...action("init", () => ({ title: "init", icon: <i />, onClick: () => {} })),
			surfaces: ["new-session"] as const,
		};
		const both = {
			...action("always", () => ({ title: "always", icon: <i />, onClick: () => {} })),
			surfaces: ["conversation", "new-session"] as const,
		};
		const conversation = await render([onlyNewSession, both]);
		expect(titles(conversation.app)).toEqual(["always", "export", "pin"]);
		// 新会话页给一份显式布局，验证的是「按 surface 过滤」而不是默认排位。
		const newSession = await render(
			[onlyNewSession, both],
			[builtin("pin")],
			{ top: ["p:init", "p:always", "builtin:pin"], tray: [] },
			"new-session",
		);
		expect(titles(newSession.app)).toEqual(["init", "always", "pin"]);
	});

	it("passes the surface and cwd to the plugin hook", async () => {
		const seen: Array<{ surface: string; cwd: string | null }> = [];
		const probe = (context: { surface: string; cwd: string | null }) => {
			seen.push(context);
			return { title: "probe", icon: <i />, onClick: () => {} };
		};
		const scoped = { ...action("probe", probe as never), surfaces: ["new-session"] as const };
		await render([scoped], [builtin("pin")], null, "new-session");
		expect(seen.at(-1)).toEqual({ surface: "new-session", cwd: "/repo" });
	});

	it("gives a `pin: prefer` action a default seat in the header of a never-customised user", async () => {
		const status = {
			...action("status", () => ({ title: "status", label: "main", icon: <i />, onClick: () => {} })),
			pin: "prefer" as const,
		};
		const { app } = await render(
			[status, action("promo", () => ({ title: "promo", icon: <i />, onClick: () => {} }))],
			["terminal", "export"].map(builtin),
			null,
		);
		// 内置的默认三格 + 请求优先上栏的那个；没请求的仍进收纳。
		expect(titles(app)).toEqual(["terminal", "export", "status"]);
	});
});
