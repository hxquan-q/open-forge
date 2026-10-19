// Copyright The Open Forge contributors.
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const originalResourcesPath = Object.getOwnPropertyDescriptor(process, "resourcesPath");
afterEach(() => {
	if (originalResourcesPath) Object.defineProperty(process, "resourcesPath", originalResourcesPath);
	else Reflect.deleteProperty(process, "resourcesPath");
	vi.unstubAllEnvs();
	vi.resetModules();
});

it("imports the real development window manager without reading packaged-only resources", async () => {
	vi.stubEnv("VETTA_BRAND_PROFILE", "distribution");
	Object.defineProperty(process, "resourcesPath", { configurable: true, value: undefined });
	vi.resetModules();
	const { iconPath, macTrayIconPath } = await import("./window-manager.js");
	expect(iconPath.win32).toBe(join(process.cwd(), "build", "brand", "distribution", "icon.ico"));
	expect(macTrayIconPath).toBe(join(process.cwd(), "build", "brand", "distribution", "icon.png"));
});
