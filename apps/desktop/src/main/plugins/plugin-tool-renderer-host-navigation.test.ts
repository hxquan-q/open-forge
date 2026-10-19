// Copyright The Open Forge contributors.
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { PluginToolRendererHostLifecycle } from "./plugin-tool-renderer-host-lifecycle.js";
import { attachPluginToolRendererHostNavigation } from "./plugin-tool-renderer-host-navigation.js";

function createReadyHost(): PluginToolRendererHostLifecycle {
	const host = new PluginToolRendererHostLifecycle();
	host.markReady();
	return host;
}

describe("attachPluginToolRendererHostNavigation", () => {
	it("被 will-navigate 拦截的已开始导航不让插件工具宿主失效", () => {
		const host = createReadyHost();
		const source = new EventEmitter();
		const detach = attachPluginToolRendererHostNavigation(source, host);

		source.emit("did-start-navigation", { isMainFrame: true, isSameDocument: false });

		expect(host.readState()).toBe("ready");
		expect(host.acquire(vi.fn())).toMatchObject({ ok: true });
		detach();
	});

	it("主 frame 导航提交后进入 loading，并在渲染端重新就绪后恢复", () => {
		const host = createReadyHost();
		const source = new EventEmitter();
		const detach = attachPluginToolRendererHostNavigation(source, host);
		const failInFlight = vi.fn();
		expect(host.acquire(failInFlight)).toMatchObject({ ok: true });

		source.emit("did-navigate", "http://127.0.0.1:3020/", 200, "OK");

		expect(host.readState()).toBe("loading");
		expect(failInFlight).toHaveBeenCalledOnce();
		expect(host.acquire(vi.fn())).toMatchObject({ ok: false });

		host.markReady();
		expect(host.acquire(vi.fn())).toMatchObject({ ok: true });
		detach();
	});

	it("解绑后不再响应已提交导航，也不残留监听", () => {
		const host = createReadyHost();
		const source = new EventEmitter();
		const detach = attachPluginToolRendererHostNavigation(source, host);
		expect(source.listenerCount("did-navigate")).toBe(1);

		detach();

		expect(source.listenerCount("did-navigate")).toBe(0);
		source.emit("did-navigate", "http://127.0.0.1:3020/", 200, "OK");
		expect(host.readState()).toBe("ready");
	});
});
