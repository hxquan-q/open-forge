// Copyright The Open Forge contributors.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeCanvasWorkspaceBucket } from "../artifacts/canvas-paths.js";
import { CanvasPreviewServer } from "./canvas-preview-server.js";

const WORKSPACE_ID = "C:\\repo\\demo";
const TOKEN = encodeCanvasWorkspaceBucket(WORKSPACE_ID);
const ARTIFACT_ID = "artifact-1";
const SECRET = "top secret";

let base: string;
let root: string;
let outside: string;
let server: CanvasPreviewServer;

/** 用 node:http 发原始路径：`fetch` 会先按 URL 规则归一化 `..`，测不到服务端自己的拒绝逻辑。 */
function rawRequest(
	port: number,
	path: string,
	method = "GET",
): Promise<{
	readonly status: number;
	readonly body: string;
	readonly headers: Record<string, string | string[] | undefined>;
}> {
	return new Promise((resolvePromise, rejectPromise) => {
		const request = httpRequest({ host: "127.0.0.1", port, path, method }, (response) => {
			const chunks: Buffer[] = [];
			response.on("data", (chunk: Buffer) => chunks.push(chunk));
			response.on("end", () =>
				resolvePromise({
					status: response.statusCode ?? 0,
					body: Buffer.concat(chunks).toString("utf8"),
					headers: response.headers,
				}),
			);
		});
		request.on("error", rejectPromise);
		request.end();
	});
}

beforeEach(async () => {
	base = await mkdtemp(join(tmpdir(), "canvas-preview-"));
	root = join(base, "canvas");
	outside = join(base, "outside");
	await mkdir(join(root, TOKEN, ARTIFACT_ID), { recursive: true });
	await mkdir(join(outside), { recursive: true });
	await writeFile(join(outside, "secret.txt"), SECRET);
	await writeFile(join(root, TOKEN, ARTIFACT_ID, "v1.html"), "<h1>first</h1>");
	await writeFile(join(root, TOKEN, ARTIFACT_ID, "v2.html"), "<h1>second</h1>");
	server = new CanvasPreviewServer({ root });
});

afterEach(async () => {
	await server.stop();
	await rm(base, { recursive: true, force: true });
});

async function openArtifact(): Promise<string> {
	const address = await server.grant({ workspaceId: WORKSPACE_ID, artifactId: ARTIFACT_ID });
	return address.url;
}

describe("canvas preview server", () => {
	it("打开 artifact 后入口地址伺服最新 HTML 版本，且要求不缓存", async () => {
		const url = await openArtifact();
		const response = await fetch(url);

		expect(url).toBe(`http://127.0.0.1:${server.port}/canvas/${TOKEN}/${ARTIFACT_ID}/index.html`);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.text()).toBe("<h1>second</h1>");
	});

	it("Agent 写出新版本后，刷新同一地址就能拿到新内容", async () => {
		const url = await openArtifact();
		expect(await (await fetch(url)).text()).toBe("<h1>second</h1>");

		await writeFile(join(root, TOKEN, ARTIFACT_ID, "v3.html"), "<h1>third</h1>");

		expect(await (await fetch(url)).text()).toBe("<h1>third</h1>");
	});

	it("HEAD 只回头，显式版本文件按扩展名推导类型", async () => {
		const url = await openArtifact();
		const head = await fetch(url, { method: "HEAD" });
		expect(head.status).toBe(200);
		expect(head.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(await head.text()).toBe("");

		await writeFile(join(root, TOKEN, ARTIFACT_ID, "v2.json"), '{"ok":true}');
		const json = await fetch(`${url.replace("index.html", "v2.json")}`);
		expect(json.status).toBe(200);
		expect(json.headers.get("content-type")).toBe("application/json; charset=utf-8");
		expect(await json.text()).toBe('{"ok":true}');
	});

	it("只读：任何写方法都被拒绝", async () => {
		const url = await openArtifact();
		const { port } = server;
		expect(port).toBeDefined();
		const path = new URL(url).pathname;

		for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
			const response = await rawRequest(port as number, path, method);
			expect(response.status).toBe(405);
			expect(response.headers.allow).toBe("GET, HEAD");
			expect(response.body).not.toContain("second");
		}
	});

	it.each([
		["字面点段", "/canvas/{{TOKEN}}/{{ID}}/../../../outside/secret.txt"],
		["编码分隔符", "/canvas/{{TOKEN}}/{{ID}}/..%2f..%2f..%2foutside%2fsecret.txt"],
		["编码点段", "/canvas/{{TOKEN}}/%2e%2e%2f{{ID}}/index.html"],
		["反斜杠逃逸", "/canvas/{{TOKEN}}/{{ID}}/..%5c..%5coutside%5csecret.txt"],
		["二次编码", "/canvas/{{TOKEN}}/{{ID}}/%252e%252e%252fsecret.txt"],
		["绝对路径", "/canvas/{{TOKEN}}/%2F..%2Foutside/secret.txt"],
		["路由之外", "/etc/passwd"],
		["大小写变体", "/Canvas/{{TOKEN}}/{{ID}}/index.html"],
		["多一层目录", "/canvas/{{TOKEN}}/{{ID}}/sub/index.html"],
	])("拒绝越界请求：%s", async (_label, template) => {
		await openArtifact();
		const path = template.replaceAll("{{TOKEN}}", TOKEN).replaceAll("{{ID}}", ARTIFACT_ID);
		const response = await rawRequest(server.port as number, path);

		expect([403, 404]).toContain(response.status);
		expect(response.body).not.toContain(SECRET);
	});

	it("只伺服用户打开过的 artifact", async () => {
		await mkdir(join(root, TOKEN, "artifact-2"), { recursive: true });
		await writeFile(join(root, TOKEN, "artifact-2", "v1.html"), "<h1>another artifact</h1>");
		await openArtifact();

		const notGranted = await rawRequest(server.port as number, `/canvas/${TOKEN}/artifact-2/index.html`);
		expect(notGranted.status).toBe(403);
		expect(notGranted.body).not.toContain("another artifact");
	});

	it("其他工作空间的 bucket 也读不到", async () => {
		const otherToken = encodeCanvasWorkspaceBucket("C:\\repo\\other");
		await openArtifact();

		const response = await rawRequest(server.port as number, `/canvas/${otherToken}/${ARTIFACT_ID}/index.html`);
		expect(response.status).toBe(403);
	});

	it("缺失或没有 HTML 版本的 artifact 回 404", async () => {
		const missing = await server.grant({ workspaceId: WORKSPACE_ID, artifactId: "artifact-missing" });
		expect((await fetch(missing.url)).status).toBe(404);

		await mkdir(join(root, TOKEN, "artifact-markdown"), { recursive: true });
		await writeFile(join(root, TOKEN, "artifact-markdown", "v1.md"), "# notes");
		const markdown = await server.grant({ workspaceId: WORKSPACE_ID, artifactId: "artifact-markdown" });
		expect((await fetch(markdown.url)).status).toBe(404);
	});

	it("拒绝通过符号链接读到画布之外的文件", async (ctx) => {
		try {
			await symlink(join(outside, "secret.txt"), join(root, TOKEN, ARTIFACT_ID, "v3.html"));
			await symlink(outside, join(root, TOKEN, "artifact-linked"));
		} catch {
			// Windows 未开启开发者模式时无法建符号链接：这条防线由 isPathInside 单测覆盖。
			ctx.skip();
			return;
		}

		const url = await openArtifact();
		const viaFile = await fetch(url);
		expect(viaFile.status).toBe(404);
		expect(await viaFile.text()).not.toContain(SECRET);

		const linked = await server.grant({ workspaceId: WORKSPACE_ID, artifactId: "artifact-linked" });
		const viaDir = await fetch(linked.url);
		expect(viaDir.status).toBe(404);
		expect(await viaDir.text()).not.toContain(SECRET);
	});

	it("重复打开复用同一个监听端口，停止后端口释放且能重新打开", async () => {
		const first = await openArtifact();
		const second = await openArtifact();
		expect(new URL(second).port).toBe(new URL(first).port);
		const firstPort = server.port as number;
		const path = `/canvas/${TOKEN}/${ARTIFACT_ID}/index.html`;

		await server.stop();
		expect(server.listening).toBe(false);
		await expect(rawRequest(firstPort, path)).rejects.toThrow();

		const reopened = await openArtifact();
		const reopenedPort = server.port as number;
		expect(server.listening).toBe(true);
		expect((await fetch(reopened)).status).toBe(200);

		await server.stop();
		await expect(rawRequest(reopenedPort, path)).rejects.toThrow();
	});
});
