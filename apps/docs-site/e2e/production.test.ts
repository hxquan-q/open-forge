// Copyright The Open Forge contributors.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const nextBin = require.resolve("next/dist/bin/next");
let server: ReturnType<typeof spawn> | undefined;
let origin: string;
let serverOutput = "";

beforeAll(async () => {
	const socket = createServer();
	// NextURL normalizes loopback IPs to localhost; keep the rewrite origin local.
	socket.listen(0, "localhost");
	await once(socket, "listening");
	const address = socket.address();
	if (!address || typeof address === "string") throw new Error("No local test port");
	origin = "http://localhost:" + address.port;
	await new Promise<void>((resolve, reject) => socket.close((error) => (error ? reject(error) : resolve())));

	server = spawn(process.execPath, [nextBin, "start", "--hostname", "localhost", "--port", String(address.port)], {
		cwd: appRoot,
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
	});
	const child = server;
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Production server not ready: " + serverOutput)), 20_000);
		child.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once("exit", (code) => {
			clearTimeout(timeout);
			reject(new Error("Production server exited " + code + ": " + serverOutput));
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			serverOutput = (serverOutput + chunk.toString()).slice(-8_000);
		});
		child.stdout?.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			serverOutput = (serverOutput + text).slice(-8_000);
			if (serverOutput.includes("Ready in")) {
				clearTimeout(timeout);
				resolve();
			}
		});
	});
});

afterAll(async () => {
	if (!server?.pid || server.exitCode !== null || server.signalCode !== null) return;
	const stopped = once(server, "exit");
	server.kill();
	await stopped;
});

async function request(path: string, locale: string | null = "en", acceptLanguage = locale ?? "") {
	const headers = new Headers();
	if (locale) headers.set("Cookie", "FD_LOCALE=" + locale);
	if (acceptLanguage) headers.set("Accept-Language", acceptLanguage);
	return fetch(new URL(path, origin), {
		redirect: "manual",
		headers,
		signal: AbortSignal.timeout(10_000),
	});
}

function isSearchResult(value: unknown): value is { type: string; url: string; content: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof value.type === "string" &&
		"url" in value &&
		typeof value.url === "string" &&
		"content" in value &&
		typeof value.content === "string"
	);
}

describe("built documentation user flows", () => {
	for (const locale of ["zh", "en"]) {
		it(locale + ": reads installation and configuration, then exports Markdown without a redirect loop", async () => {
			const home = await request("/", locale);
			expect(home.status, serverOutput).toBe(200);
			expect(await home.text()).toContain("Open Forge");

			const installation = await request("/getting-started/installation-and-updates/", locale);
			expect(installation.status, serverOutput).toBe(200);
			const html = await installation.text();
			expect(html).toContain(locale === "zh" ? "小爱ai" : "Allstr ai");
			expect(html).toContain("OpenForge.exe");

			const config = await request("/reference/configuration-paths/", locale);
			expect(config.status, serverOutput).toBe(200);
			expect(await config.text()).toContain("VETTA_HOME");

			const markdown = await request("/reference/configuration-paths.md", locale);
			expect(markdown.status, serverOutput).toBe(200);
			expect(markdown.headers.get("content-type")).toContain("text/markdown");
			const body = await markdown.text();
			expect(body).toContain("~/.openforge");
			expect(body).toContain(locale === "zh" ? "数据根与兼容迁移" : "Data roots and compatibility migration");
		});

		it(locale + ": searches localized configuration and follows its shared public URL", async () => {
			const query = locale === "zh" ? "配置" : "configuration";
			const response = await request(
				"/api/search/?query=" + encodeURIComponent(query) + "&locale=" + locale,
				locale,
			);
			expect(response.status, serverOutput).toBe(200);
			const results: unknown = await response.json();
			if (!Array.isArray(results)) throw new Error("Search did not return an array");
			const pages = results
				.filter(isSearchResult)
				.filter((result) => result.type === "page" && result.url.includes("/reference/configuration-paths"));
			expect(pages, JSON.stringify(results)).toHaveLength(1);
			const page = pages[0];
			if (!page) throw new Error("Configuration page missing from search");
			expect(page.url).not.toMatch(/^\/(?:zh|en)\//);
			expect(page.content).toContain(locale === "zh" ? "配置" : "Configuration");
			const destination = page.url.endsWith("/") ? page.url : page.url + "/";
			const article = await request(destination, locale);
			expect(article.status, serverOutput).toBe(200);
			expect(await article.text()).toContain("VETTA_CONFIG_DIR");
		});
	}

	it("negotiates browser language, honors the cookie, and canonicalizes a prefixed link", async () => {
		const path = "/reference/configuration-paths/";
		const browser = await request(path, null, "en-US,en;q=0.9");
		expect(browser.status, serverOutput).toBe(200);
		expect(await browser.text()).toContain('lang="en-US"');

		const saved = await request(path, "zh", "en-US,en;q=0.9");
		expect(saved.status, serverOutput).toBe(200);
		expect(await saved.text()).toContain('lang="zh-CN"');

		const prefixed = await request("/en/reference/configuration-paths/?from=legacy", "zh");
		expect(prefixed.status).toBe(307);
		const location = new URL(prefixed.headers.get("location") ?? "", origin);
		expect(location.pathname + location.search).toBe(path + "?from=legacy");
		expect(prefixed.headers.get("set-cookie")).toContain("FD_LOCALE=en");

		const translated = await request(location.pathname + location.search, "en");
		expect(translated.status, serverOutput).toBe(200);
		expect(await translated.text()).toContain('lang="en-US"');
	});

	it("keeps discovery endpoints and the branded social image available", async () => {
		const sitemap = await request("/sitemap.xml");
		expect(sitemap.status).toBe(200);
		expect(await sitemap.text()).toContain("/reference/configuration-paths/");
		for (const locale of ["zh", "en"]) {
			const llms = await request("/llms-full.txt?lang=" + locale, locale);
			expect(llms.status).toBe(200);
			const body = await llms.text();
			expect(body).toContain("~/.openforge");
			expect(body).toContain("OpenForge.exe");
			expect(body).not.toContain("openvetta.com");
		}
		const social = await request("/opengraph-image/");
		expect(social.status).toBe(200);
		expect(social.headers.get("content-type")).toContain("image/png");
		expect((await social.arrayBuffer()).byteLength).toBeGreaterThan(1_000);
	});
});
