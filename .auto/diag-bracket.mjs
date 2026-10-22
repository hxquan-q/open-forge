// 诊断脚本（.auto 专用，不动仓库基准）：含裸方括号 prose 的流式残余成本量化。
// 复用 markdown-render.bench 的构建/浏览器模式，夹具换成 bracket-prose。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";


const worktree = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(worktree, "apps/desktop");
const repo = worktree;
const localRequire = createRequire(join(desktop, "package.json"));
const repoRequire = createRequire(join(repo, "package.json"));
const playwrightRequire = createRequire(repoRequire.resolve("@playwright/cli/package.json"));
const { build } = createRequire(join(desktop, "package.json"))("vite");
const { chromium } = playwrightRequire("playwright");
const directory = await mkdtemp(join(tmpdir(), "vetta-bracket-diag-"));
let entry = "";
let browser;
let server;
try {
	entry = join(desktop, "diag-entry.tmp.tsx");
	await writeFile(entry, `
import { Profiler } from "react";
import { createRoot } from "react-dom/client";
import { MarkdownContent } from "@vetta-org/theme-ui/markdown";

const line = (i) =>
	"Problem " + i + ": compute the sum.\\n\\n$$\\nS_" + i + " = \\\\sum_{k=1}^{n} k = \\\\frac{n(n+1)}{2}\\n$$\\n\\nTherefore the closed form holds for all n.\\n\\n";
const bracketProse = Array.from({ length: 350 }, (_, i) => line(i)).join("");
const env = { theme: "dark", labels: { copy: "c", copied: "d" }, getFileIconClass: () => "", onOpenFile: () => {}, onOpenUrl: () => {} };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const paint = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function run() {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const durations = [];
	const render = (text, live) => root.render(
		<Profiler id="d" onRender={(_id, _phase, dur) => durations.push(dur)}>
			<MarkdownContent {...env} text={text} isStreamingTail={live} />
		</Profiler>,
	);
	render(bracketProse, true);
	await pause(1000);
	durations.length = 0;
	let text = bracketProse;
	for (let i = 0; i < 40; i++) {
		text += \'tail word \' + i + \'. \';
		render(text, true);
		await pause(50);
	}
	text += "\\n\\nFINAL";
	render(text, false);
	const deadline = performance.now() + 5000;
	while (!host.textContent?.includes("FINAL")) { if (performance.now() > deadline) throw new Error("no flush"); await paint(); }
	await pause(250);
	const sorted = [...durations].sort((a, b) => a - b);
	return {
		sourceChars: text.length,
		commits: durations.length,
		reactRenderMs: +durations.reduce((s, v) => s + v, 0).toFixed(1),
		p95CommitMs: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1),
		maxCommitMs: +(sorted[sorted.length - 1] ?? 0).toFixed(1),
	};
}
`);
	await build({
		configFile: false, root: desktop, logLevel: "error",
		resolve: { alias: [{ find: "react-dom/client", replacement: localRequire.resolve("react-dom/profiling") }] },
		esbuild: { jsx: "automatic" },
		define: { "process.env.NODE_ENV": '"production"' },
		build: { outDir: directory, emptyOutDir: false, lib: { entry, formats: ["es"], fileName: "diag" } },
		worker: { format: "es" },
	});
	server = createServer(async (request, response) => {
		if (request.url === "/") { response.end("<!doctype html><style>body{width:800px}</style>"); return; }
		const path = resolve(directory, `.${new URL(request.url, "http://localhost").pathname}`);
		if (!path.startsWith(directory + sep)) return response.writeHead(403).end();
		try {
			response.setHeader("Content-Type", extname(path) === ".css" ? "text/css" : "text/javascript");
			response.end(await readFile(path));
		} catch { response.writeHead(404).end(); }
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	browser = await chromium.launch({ headless: true, channel: process.env.VETTA_TEST_BROWSER || undefined });
	const page = await browser.newPage();
	await page.route("**/*", (route) => (new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort()));
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	const result = await page.evaluate(async () => {
		const { run } = await import("/diag.js");
		return run();
	});
	console.log(JSON.stringify({ browser: browser.version(), mode: "bracket-prose-diagnostic", result }, null, 2));
} finally {
	await browser?.close();
	if (server) await new Promise((resolve) => server.close(resolve));
	assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
	assert.ok(basename(directory).startsWith("vetta-bracket-diag-"));
	await rm(entry, { force: true });
	await rm(directory, { recursive: true, force: true });
}
