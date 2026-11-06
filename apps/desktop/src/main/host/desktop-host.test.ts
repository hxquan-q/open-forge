// Copyright The Open Forge contributors.
import { HOST_PROTOCOL_ERROR_CODES } from "@vetta/host-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

let document: Record<string, unknown>;
vi.mock("../agent-settings/settings-document-store.js", () => ({
	readAgentSettingsDocument: () => document,
	updateAgentSettingsDocument: (mutate: (settings: Record<string, unknown>) => void) => mutate(document),
}));
vi.mock("../constants.js", () => ({
	DEFAULT_SERVER_URL: "https://server.example.test",
	DEFAULT_SITE_URL: "https://site.example.test",
}));

const { createDesktopHost } = await import("./desktop-host.js");

describe("desktop host settings domain", () => {
	beforeEach(() => {
		document = {};
	});

	it("registers exactly the six pilot settings methods", () => {
		expect(createDesktopHost().methods()).toEqual([
			"settings.getModelTransport",
			"settings.getServerUrl",
			"settings.getSessionInterruptContinue",
			"settings.getSiteUrl",
			"settings.setModelTransport",
			"settings.setSessionInterruptContinue",
		]);
	});

	it("returns server and site urls from build constants", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "settings.getServerUrl", params: {} })).resolves.toEqual({
			ok: true,
			result: "https://server.example.test",
		});
		await expect(host.handle({ method: "settings.getSiteUrl", params: {} })).resolves.toEqual({
			ok: true,
			result: "https://site.example.test",
		});
	});

	it("reads and persists model transport", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "settings.getModelTransport", params: {} })).resolves.toEqual({
			ok: true,
			result: "sse",
		});
		await expect(
			host.handle({ method: "settings.setModelTransport", params: { transport: "websocket" } }),
		).resolves.toEqual({ ok: true, result: "websocket" });
		expect(document.transport).toBe("websocket");
	});

	it("rejects invalid model transport without writing", async () => {
		const response = await createDesktopHost().handle({
			method: "settings.setModelTransport",
			params: { transport: "socket" },
		});
		expect(response).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
		expect(document).toEqual({});
	});

	it("keeps session interrupt defaults and normalization for corrupt persisted data", async () => {
		const host = createDesktopHost();
		await expect(host.handle({ method: "settings.getSessionInterruptContinue", params: {} })).resolves.toEqual({
			ok: true,
			result: { mode: "notify", maxAttempts: 1 },
		});
		document.sessionInterruptContinue = { mode: "bogus", maxAttempts: 3.7 };
		await expect(host.handle({ method: "settings.getSessionInterruptContinue", params: {} })).resolves.toEqual({
			ok: true,
			result: { mode: "notify", maxAttempts: 3 },
		});
	});

	it("writes session interrupt mode, preserving other fields and pinning maxAttempts to 1", async () => {
		document.sessionInterruptContinue = { mode: "notify", maxAttempts: 5, extra: true };
		await expect(
			createDesktopHost().handle({ method: "settings.setSessionInterruptContinue", params: { mode: "auto" } }),
		).resolves.toEqual({ ok: true, result: null });
		expect(document.sessionInterruptContinue).toEqual({ mode: "auto", maxAttempts: 1, extra: true });
	});

	it("rejects invalid session interrupt mode without writing", async () => {
		const response = await createDesktopHost().handle({
			method: "settings.setSessionInterruptContinue",
			params: { mode: "always" },
		});
		expect(response).toMatchObject({ ok: false, error: { code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS } });
		expect(document).toEqual({});
	});
});
