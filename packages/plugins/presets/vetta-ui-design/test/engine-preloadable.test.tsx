// Copyright The Open Forge contributors.

import { Component, act, lazy, Suspense, useLayoutEffect } from "react";
import type { ComponentType, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { preloadable } from "../engine/src/preloadable";
import { ENGINE_FILES } from "../src/engine/engine-files";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderFrame(
	Frame: ComponentType,
	run: (host: HTMLElement, fallbacks: string[]) => Promise<void>,
): Promise<void> {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	const fallbacks: string[] = [];
	function Fallback() {
		useLayoutEffect(() => {
			fallbacks.push("fallback committed");
		}, []);
		return <span>Loading</span>;
	}
	try {
		await act(async () =>
			root.render(
				<Suspense fallback={<Fallback />}>
					<Frame />
				</Suspense>,
			),
		);
		await run(host, fallbacks);
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

it("the existing lazy route commits a fallback even for an immediately available module", async () => {
	const Frame = lazy(async () => ({ default: () => <div>Ready</div> }));
	await renderFrame(Frame, async (_host, fallbacks) => {
		expect(fallbacks).toHaveLength(1);
	});
});

it("preloads the initial frame once and commits content without a fallback", async () => {
	const load = vi.fn(async () => ({ default: () => <div>Ready</div> }));
	const untouched = vi.fn(async () => ({ default: () => <div>Other</div> }));
	const frame = preloadable(load);
	preloadable(untouched);
	await Promise.all([frame.preload(), frame.preload()]);
	await renderFrame(frame.Component, async (host, fallbacks) => {
		expect(host.textContent).toBe("Ready");
		expect(fallbacks).toHaveLength(0);
		expect(load).toHaveBeenCalledTimes(1);
		expect(untouched).not.toHaveBeenCalled();
	});
});

it("keeps subsequent routes lazy and reveals them after their module arrives", async () => {
	let finish!: (module: { default: ComponentType }) => void;
	const frame = preloadable(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	await renderFrame(frame.Component, async (host, fallbacks) => {
		expect(host.textContent).toBe("Loading");
		expect(fallbacks).toHaveLength(1);
		await act(async () => finish({ default: () => <div>Later</div> }));
		expect(host.textContent).toBe("Later");
	});
});

it("keeps rejected preloads on the existing error-boundary rendering path", async () => {
	const load = vi.fn(async (): Promise<{ default: ComponentType }> => {
		throw new Error("frame broken");
	});
	const frame = preloadable(load);
	await expect(frame.preload()).resolves.toBeUndefined();
	class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
		state = { failed: false };
		static getDerivedStateFromError() {
			return { failed: true };
		}
		render() {
			return this.state.failed ? <div>Frame error</div> : this.props.children;
		}
	}
	const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
	try {
		await renderFrame(
			() => (
				<Boundary>
					<frame.Component />
				</Boundary>
			),
			async (host) => {
				expect(host.textContent).toBe("Frame error");
				expect(load).toHaveBeenCalledTimes(1);
			},
		);
	} finally {
		errorLog.mockRestore();
	}
});

it("materializes the preload and source-discovery helpers with their consumers", () => {
	for (const path of ["src/preloadable.tsx", "plugins/theme-source.mjs", "plugins/watch-design.mjs"])
		expect(ENGINE_FILES[path]).toBeTruthy();
	const main = ENGINE_FILES["src/main.tsx"];
	if (!main) throw new Error("Missing engine main");
	const preload = main.indexOf("void Promise.all([layout?.preload()");
	expect(preload).toBeGreaterThan(0);
	expect(main.match(/\n\s*root\.render\(/)?.index ?? -1).toBeGreaterThan(preload);
});
