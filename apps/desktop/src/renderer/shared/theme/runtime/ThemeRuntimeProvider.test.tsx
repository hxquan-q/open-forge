// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import type { DesktopThemePackage } from "@preload/api";
import { Button } from "@shared/components/ui/button";
import { act, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_THEME_MODULE, type ThemeModule } from "@vetta-org/theme-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loader = vi.hoisted(() => ({ evaluations: 0, load: vi.fn() }));
vi.mock("./themeLoader", () => {
	loader.evaluations += 1;
	return { loadThemePackage: loader.load };
});
vi.mock("../pages/theme-renderer-capability-host", () => ({
	themeRendererCapabilityHost: { activate: () => ({ dispose() {} }) },
}));

import { useThemeRuntime } from "./ThemeRuntimeContext";
import { ThemeRuntimeProvider } from "./ThemeRuntimeProvider";

const external: DesktopThemePackage = {
	id: "custom",
	displayName: { en: "Custom" },
	version: "1.0.0",
	sdkVersion: "0.1.0",
	source: "remote",
	entryUrl: "https://example.test/theme.js",
	styleUrls: [],
	moduleFederation: { remoteName: "custom", expose: "./theme" },
};
const customTheme: ThemeModule = { meta: { ...DEFAULT_THEME_MODULE.meta, id: "custom" } };

function Consumer(): JSX.Element {
	const runtime = useThemeRuntime();
	return (
		<>
			<output>
				{runtime.activeThemeId}:{runtime.status}
			</output>
			<Button type="button" onClick={() => void runtime.selectTheme("default")}>
				Default
			</Button>
		</>
	);
}

describe("ThemeRuntimeProvider startup", () => {
	beforeEach(() => {
		localStorage.clear();
		loader.load.mockReset();
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: { themes: { list: vi.fn(async () => [external]) } },
		});
	});

	it("renders the default theme without evaluating the external-theme loader", async () => {
		expect(loader.evaluations).toBe(0);
		render(
			<ThemeRuntimeProvider>
				<Consumer />
			</ThemeRuntimeProvider>,
		);
		expect(screen.getByText("default:loading")).not.toBeNull();
		await screen.findByText("default:ready");
		expect(loader.evaluations).toBe(0);
	});

	it("falls back from a missing stored theme without evaluating its loader", async () => {
		localStorage.setItem("vetta-ui-theme", "missing");
		render(
			<ThemeRuntimeProvider>
				<Consumer />
			</ThemeRuntimeProvider>,
		);
		await screen.findByText("default:error");
		expect(loader.evaluations).toBe(0);
		expect(localStorage.getItem("vetta-ui-theme")).toBe("default");
	});

	it("waits for a stored external theme and disposes it when returning to default", async () => {
		localStorage.setItem("vetta-ui-theme", "custom");
		let finish!: (value: { module: ThemeModule; dispose: () => void }) => void;
		loader.load.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const dispose = vi.fn();
		const mounted = render(
			<ThemeRuntimeProvider>
				<Consumer />
			</ThemeRuntimeProvider>,
		);
		await waitFor(() => expect(loader.load).toHaveBeenCalledWith(external));
		expect(screen.queryByRole("button", { name: "Default" })).toBeNull();
		await act(async () => finish({ module: customTheme, dispose }));
		await screen.findByText("custom:ready");
		act(() => screen.getByRole("button", { name: "Default" }).click());
		await screen.findByText("default:ready");
		expect(dispose).toHaveBeenCalledOnce();
		mounted.unmount();
		expect(dispose).toHaveBeenCalledOnce();
	});

	it("releases the initial loading shell and keeps default content when the external theme fails", async () => {
		localStorage.setItem("vetta-ui-theme", "custom");
		loader.load.mockRejectedValue(new Error("unavailable"));
		render(
			<ThemeRuntimeProvider>
				<Consumer />
			</ThemeRuntimeProvider>,
		);
		await screen.findByText("default:error");
		expect(screen.getByRole("button", { name: "Default" })).not.toBeNull();
	});
});
