// Copyright The Open Forge contributors.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAllowedBrowserTabUrl } from "@vetta/coding-agent/function-extensions";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeCanvasWorkspaceBucket } from "../artifacts/canvas-paths.js";
import { disposeCanvasPreviewServer, openCanvasArtifactPreviewInBrowser } from "./canvas-preview-desktop.js";

const WORKSPACE_ID = "C:\\repo\\demo";
const TOKEN = encodeCanvasWorkspaceBucket(WORKSPACE_ID);
const ARTIFACT_ID = "artifact-1";

let base: string;
let root: string;

beforeEach(async () => {
	base = await mkdtemp(join(tmpdir(), "canvas-preview-desktop-"));
	root = join(base, "canvas");
	await mkdir(join(root, TOKEN, ARTIFACT_ID), { recursive: true });
	await writeFile(join(root, TOKEN, ARTIFACT_ID, "v1.html"), "<h1>drawer</h1>");
});

afterEach(async () => {
	await disposeCanvasPreviewServer();
	await rm(base, { recursive: true, force: true });
});

describe("open canvas artifact preview in browser", () => {
	it("HTML artifact 得到可在浏览器加载的回环地址", async () => {
		const result = await openCanvasArtifactPreviewInBrowser(
			{ workspaceId: WORKSPACE_ID, artifactId: ARTIFACT_ID },
			{ root },
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.url).toMatch(
			new RegExp(`^http://127\\.0\\.0\\.1:\\d+/canvas/${TOKEN}/${ARTIFACT_ID}/index\\.html$`),
		);
		const response = await fetch(result.url);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("<h1>drawer</h1>");
	});

	it("回环地址仍是 Browser Tab 接受的 http 地址", async () => {
		const result = await openCanvasArtifactPreviewInBrowser(
			{ workspaceId: WORKSPACE_ID, artifactId: ARTIFACT_ID },
			{ root },
		);
		if (!result.ok) throw new Error("preview should open");

		// 必须保持 ADR-0129 的 Browser 入口校验：回环路径不是绕过它的例外。
		expect(isAllowedBrowserTabUrl(result.url)).toBe(true);
		expect(new URL(result.url).hostname).toBe("127.0.0.1");
	});

	it("没有 HTML 版本的 artifact 回 missing_file", async () => {
		await mkdir(join(root, TOKEN, "artifact-notes"), { recursive: true });
		await writeFile(join(root, TOKEN, "artifact-notes", "v1.md"), "# notes");

		const result = await openCanvasArtifactPreviewInBrowser(
			{ workspaceId: WORKSPACE_ID, artifactId: "artifact-notes" },
			{ root },
		);

		expect(result).toEqual({
			ok: false,
			code: "missing_file",
			message: "this artifact has no HTML version to preview",
		});
	});

	it("非法输入回 invalid_input，不启动伺服", async () => {
		await expect(
			openCanvasArtifactPreviewInBrowser({ workspaceId: WORKSPACE_ID, artifactId: "../escape" }, { root }),
		).resolves.toMatchObject({ ok: false, code: "invalid_input" });
		await expect(
			openCanvasArtifactPreviewInBrowser({ workspaceId: "   ", artifactId: ARTIFACT_ID }, { root }),
		).resolves.toEqual({ ok: false, code: "invalid_input", message: "workspaceId is required" });
	});

	it("重复打开复用同一个端口，dispose 之后端口不再监听", async () => {
		const first = await openCanvasArtifactPreviewInBrowser(
			{ workspaceId: WORKSPACE_ID, artifactId: ARTIFACT_ID },
			{ root },
		);
		const second = await openCanvasArtifactPreviewInBrowser(
			{ workspaceId: WORKSPACE_ID, artifactId: ARTIFACT_ID },
			{ root },
		);
		if (!first.ok || !second.ok) throw new Error("preview should open");
		expect(new URL(second.url).port).toBe(new URL(first.url).port);

		await disposeCanvasPreviewServer();
		await expect(fetch(first.url)).rejects.toThrow();

		// 窗口关闭后重新打开同一个 artifact：单例已重置，应能重新起服务。
		const reopened = await openCanvasArtifactPreviewInBrowser(
			{ workspaceId: WORKSPACE_ID, artifactId: ARTIFACT_ID },
			{ root },
		);
		if (!reopened.ok) throw new Error("preview should reopen");
		expect((await fetch(reopened.url)).status).toBe(200);
	});
});
