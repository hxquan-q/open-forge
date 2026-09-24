// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import {
	AUTOMATION_PACKAGE_MAX_REDIRECTS,
	AUTOMATION_PACKAGE_MAX_TASK_BYTES,
	AutomationPackageFetchError,
	assertAutomationPackageDownloadUrl,
	fetchAutomationPackageBounded,
} from "./automation-package-secure-fetch.js";

function jsonResponse(body: string, init: ResponseInit & { url?: string } = {}): Response {
	const { url, ...rest } = init;
	const response = new Response(body, rest);
	if (url) Object.defineProperty(response, "url", { value: url });
	return response;
}

describe("assertAutomationPackageDownloadUrl", () => {
	it("allows GitHub HTTPS hosts and rejects others", () => {
		expect(assertAutomationPackageDownloadUrl("https://raw.githubusercontent.com/a/b/main/x.json").hostname).toBe(
			"raw.githubusercontent.com",
		);
		expect(() => assertAutomationPackageDownloadUrl("http://github.com/a/b")).toThrow(AutomationPackageFetchError);
		expect(() => assertAutomationPackageDownloadUrl("https://evil.example/x")).toThrow(/allowlisted/i);
		expect(() => assertAutomationPackageDownloadUrl("https://user:pass@github.com/a/b")).toThrow(/credentials/i);
	});
});

describe("fetchAutomationPackageBounded", () => {
	it("re-validates each redirect and stops after the limit", async () => {
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const href = String(input);
			if (href.includes("hop0")) {
				return jsonResponse("", {
					status: 302,
					headers: { location: "https://raw.githubusercontent.com/a/b/main/hop1.json" },
				});
			}
			if (href.includes("hop1")) {
				return jsonResponse("", {
					status: 302,
					headers: { location: "https://evil.example/steal" },
				});
			}
			return jsonResponse("{}", { status: 200 });
		});
		await expect(
			fetchAutomationPackageBounded("https://raw.githubusercontent.com/a/b/main/hop0.json", {
				maxBytes: AUTOMATION_PACKAGE_MAX_TASK_BYTES,
				fetcher: fetcher as unknown as typeof fetch,
			}),
		).rejects.toThrow(/allowlisted|redirect/i);
	});

	it("truncates streams that exceed the size bound", async () => {
		const big = "x".repeat(100);
		const fetcher = vi.fn(async () =>
			jsonResponse(big, {
				status: 200,
				url: "https://raw.githubusercontent.com/a/b/main/pkg.json",
			}),
		);
		await expect(
			fetchAutomationPackageBounded("https://raw.githubusercontent.com/a/b/main/pkg.json", {
				maxBytes: 50,
				fetcher: fetcher as unknown as typeof fetch,
			}),
		).rejects.toMatchObject({ code: "size_limit" });
	});

	it("returns body when within limit", async () => {
		const fetcher = vi.fn(async () =>
			jsonResponse('{"ok":true}', {
				status: 200,
				url: "https://raw.githubusercontent.com/a/b/main/pkg.json",
			}),
		);
		const buffer = await fetchAutomationPackageBounded("https://raw.githubusercontent.com/a/b/main/pkg.json", {
			maxBytes: AUTOMATION_PACKAGE_MAX_TASK_BYTES,
			fetcher: fetcher as unknown as typeof fetch,
		});
		expect(buffer.toString("utf8")).toBe('{"ok":true}');
		expect(AUTOMATION_PACKAGE_MAX_REDIRECTS).toBe(3);
	});
});
