// Copyright The Open Forge contributors.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(desktop, "../..");
const localRequire = createRequire(join(desktop, "package.json"));
const repoRequire = createRequire(join(repo, "package.json"));
const playwrightRequire = createRequire(repoRequire.resolve("@playwright/cli/package.json"));
const { chromium } = playwrightRequire("playwright");
const directory = await mkdtemp(join(tmpdir(), "openforge-browser-tabs-bench-"));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
let browser;
let server;
try {
	await build({
		configFile: false, root: desktop, logLevel: "error", plugins: [tailwindcss()],
		resolve: { alias: [{ find: "react-dom/client", replacement: localRequire.resolve("react-dom/profiling") }] },
		esbuild: { jsx: "automatic" }, define: { "process.env.NODE_ENV": '"production"' },
		build: {
			outDir: directory, emptyOutDir: false,
			lib: { entry: join(desktop, "scripts/browser-tabs.bench.tsx"), formats: ["es"], fileName: "benchmark" },
		},
	});
	const css = (await readdir(directory)).filter((name) => name.endsWith(".css"));
	server = createServer(async (request, response) => {
		if (request.url === "/") {
			response.setHeader("Content-Type", "text/html; charset=utf-8");
			response.end(`<!doctype html><meta charset="utf-8"><title>Browser tabs component benchmark</title>${css.map((file) => `<link rel="stylesheet" href="/${file}">`).join("")}`);
			return;
		}
		const path = resolve(directory, `.${new URL(request.url, "http://localhost").pathname}`);
		if (!path.startsWith(directory + sep)) return response.writeHead(403).end();
		try {
			response.setHeader("Content-Type", extname(path) === ".css" ? "text/css" : "text/javascript");
			response.end(await readFile(path));
		} catch { response.writeHead(404).end(); }
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	browser = await chromium.launch({ headless: true, channel: process.env.VETTA_TEST_BROWSER || "chrome" });
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	const repetitions = Number(process.env.VETTA_BENCH_REPS || 3);
	assert.ok(Number.isInteger(repetitions) && repetitions > 0);
	const reports = [];
	for (let rep = 0; rep < repetitions; rep++) {
		reports.push(await page.evaluate(async () => {
			const { runBrowserTabsBenchmark } = await import("/benchmark.js");
			return runBrowserTabsBenchmark();
		}));
	}
	assert.deepEqual(errors, []);
	const totals = reports.map((rows) => rows.reduce((sum, row) => sum + row.reactMs, 0));
	const metrics = {
		tab_react_ms: +median(totals).toFixed(3),
		width_reads: median(reports.map((rows) => rows.reduce((sum, row) => sum + row.widthReads, 0))),
		p95_commit_ms: +median(reports.map((rows) => Math.max(...rows.map((row) => row.p95CommitMs)))).toFixed(3),
		p95_visible_ms: +median(reports.map((rows) => Math.max(...rows.map((row) => row.p95VisibleMs)))).toFixed(3),
		spread_pct: +((Math.max(...totals) - Math.min(...totals)) / median(totals) * 100).toFixed(2),
	};
	console.log(JSON.stringify({ browser: browser.version(), mode: "production-profiling", reports, metrics }));
	for (const [key, value] of Object.entries(metrics)) console.log(`METRIC ${key}=${value}`);
} finally {
	await browser?.close();
	if (server) await new Promise((resolve) => server.close(resolve));
	assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
	assert.ok(basename(directory).startsWith("openforge-browser-tabs-bench-"));
	await rm(directory, { recursive: true, force: true });
}
