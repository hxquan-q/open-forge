// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { assertCanvasArtifactId, encodeCanvasWorkspaceBucket } from "../artifacts/canvas-paths.js";
import {
	CANVAS_PREVIEW_ENTRY_FILE,
	canvasPreviewUrl,
	contentTypeForCanvasFile,
	isCanvasPreviewArtifactId,
	isPathInside,
	parseCanvasPreviewRequestPath,
	previewGrantKey,
	selectCanvasPreviewEntry,
} from "./canvas-preview-paths.js";

/** Windows 工作空间原文：URL 里必须换成 base64url bucket，不能出现反斜杠。 */
const WORKSPACE_ID = "C:\\repo\\demo";
const TOKEN = encodeCanvasWorkspaceBucket(WORKSPACE_ID);

describe("canvas preview request path", () => {
	it("接受入口别名与显式版本文件", () => {
		expect(parseCanvasPreviewRequestPath(`/canvas/${TOKEN}/artifact-1/index.html`)).toEqual({
			ok: true,
			target: { workspaceToken: TOKEN, artifactId: "artifact-1", file: CANVAS_PREVIEW_ENTRY_FILE },
		});
		expect(parseCanvasPreviewRequestPath(`/canvas/${TOKEN}/artifact-1/v3.html?cache=bust`)).toEqual({
			ok: true,
			target: { workspaceToken: TOKEN, artifactId: "artifact-1", file: "v3.html" },
		});
		// 尾斜杠与显式入口等价，浏览器地址栏会自动补上它。
		expect(parseCanvasPreviewRequestPath(`/canvas/${TOKEN}/artifact-1/`)).toEqual({
			ok: true,
			target: { workspaceToken: TOKEN, artifactId: "artifact-1", file: CANVAS_PREVIEW_ENTRY_FILE },
		});
	});

	it.each([
		["编码的分隔符", `/canvas/${TOKEN}/..%2f..%2f..%2fetc/passwd/index.html`],
		["编码的点段", `/canvas/${TOKEN}/%2e%2e%2fsecret/index.html`],
		["反斜杠逃逸", `/canvas/${TOKEN}/artifact-1/..%5c..%5csecret.html`],
		["二次编码", `/canvas/${TOKEN}/artifact-1/%252e%252e%252fsecret.html`],
		["绝对路径注入", `/canvas/${TOKEN}/%2Fetc%2Fpasswd/index.html`],
		["Windows 盘符", `/canvas/${TOKEN}/C:%5CWindows%5Cwin.ini/index.html`],
		["空字节截断", `/canvas/${TOKEN}/artifact-1/index.html%00.png`],
		["字面点段", `/canvas/${TOKEN}/artifact-1/../../../../etc/passwd`],
		["多余层级", `/canvas/${TOKEN}/artifact-1/v1.html/index.html`],
		["空段", `/canvas/${TOKEN}//index.html`],
		["带点的工作空间段", "/canvas/a.b/artifact-1/index.html"],
		["artifactId 以点开头", `/canvas/${TOKEN}/.hidden/index.html`],
		["非入口文件名", `/canvas/${TOKEN}/artifact-1/secret.txt`],
		["后缀近似入口", `/canvas/${TOKEN}/artifact-1/index.htm`],
		["空路由", "/canvas/"],
	])("拒绝越界写法：%s", (_label, path) => {
		const parsed = parseCanvasPreviewRequestPath(path);
		expect(parsed.ok).toBe(false);
	});

	it("画布路由之外的请求按不存在处理", () => {
		expect(parseCanvasPreviewRequestPath("/etc/passwd")).toEqual({ ok: false, rejection: "outside-route" });
		expect(parseCanvasPreviewRequestPath("/canvasX/a/b/index.html")).toEqual({
			ok: false,
			rejection: "outside-route",
		});
		expect(parseCanvasPreviewRequestPath("/Canvas/a/b/index.html")).toEqual({
			ok: false,
			rejection: "outside-route",
		});
		// 画布路由之内但不满足字面合同：按越界处理，与"没这个文件"区分开。
		expect(parseCanvasPreviewRequestPath(`/canvas/${TOKEN}/artifact-1/secret.txt`)).toEqual({
			ok: false,
			rejection: "rejected",
		});
	});

	it("与 CanvasStore 的 artifactId 规则保持一致", () => {
		const acceptsCanonical = (value: string): boolean => {
			try {
				assertCanvasArtifactId(value);
				return true;
			} catch {
				return false;
			}
		};
		for (const value of [
			"artifact-1",
			"artifact_1",
			"artifact.1",
			"a",
			"1",
			"..",
			".",
			"",
			"-a",
			".a",
			"a/b",
			"a\\b",
			"artifact:1",
		]) {
			expect(isCanvasPreviewArtifactId(value)).toBe(acceptsCanonical(value));
		}
	});
});

describe("canvas preview entry resolution", () => {
	it("入口取版本号最大的 HTML 版本", () => {
		expect(selectCanvasPreviewEntry(["v1.md", "v2.html", "v3.md"])).toBe("v2.html");
		expect(selectCanvasPreviewEntry(["v9.html", "v10.html"])).toBe("v10.html");
		expect(selectCanvasPreviewEntry(["v2.htm", "v2.html"])).toBe("v2.html");
		expect(selectCanvasPreviewEntry(["v1.xhtml"])).toBe("v1.xhtml");
	});

	it("没有 HTML 版本时不给入口", () => {
		expect(selectCanvasPreviewEntry([])).toBeUndefined();
		expect(selectCanvasPreviewEntry(["index.html", "readme.html"])).toBeUndefined();
		expect(selectCanvasPreviewEntry(["v1.md", "v2.csv"])).toBeUndefined();
	});

	it("按扩展名推导内容类型", () => {
		expect(contentTypeForCanvasFile("index.html")).toBe("text/html; charset=utf-8");
		expect(contentTypeForCanvasFile("v2.json")).toBe("application/json; charset=utf-8");
		expect(contentTypeForCanvasFile("v1.md")).toBe("text/markdown; charset=utf-8");
		expect(contentTypeForCanvasFile("v4.SVG")).toBe("image/svg+xml");
		expect(contentTypeForCanvasFile("v4.bin")).toBe("application/octet-stream");
	});
});

describe("canvas preview url", () => {
	it("只拼回环地址与 bucket，不带本机路径", () => {
		const url = canvasPreviewUrl({ port: 41_234, workspaceId: WORKSPACE_ID, artifactId: "artifact-1" });
		expect(url).toBe(`http://127.0.0.1:41234/canvas/${TOKEN}/artifact-1/${CANVAS_PREVIEW_ENTRY_FILE}`);
		expect(url).not.toContain("repo");
		expect(url).not.toContain("\\");
	});

	it("显式版本文件可单独寻址", () => {
		expect(canvasPreviewUrl({ port: 1, workspaceId: WORKSPACE_ID, artifactId: "a", file: "v2.html" })).toBe(
			`http://127.0.0.1:1/canvas/${TOKEN}/a/v2.html`,
		);
	});

	it("授权键按 bucket 与 artifact 组合", () => {
		expect(previewGrantKey(TOKEN, "artifact-1")).toBe(`${TOKEN}/artifact-1`);
	});
});

describe("canvas preview path containment", () => {
	it("接受根目录本身与其子路径", () => {
		expect(isPathInside("C:/canvas", "C:/canvas/bucket/artifact/v1.html")).toBe(true);
		expect(isPathInside("C:\\canvas", "C:/canvas/bucket")).toBe(true);
		expect(isPathInside("C:/canvas/", "C:/canvas")).toBe(true);
	});

	it("拒绝同级前缀、祖先与空路径", () => {
		expect(isPathInside("C:/canvas", "C:/canvas-other/v1.html")).toBe(false);
		expect(isPathInside("C:/canvas/bucket", "C:/canvas")).toBe(false);
		expect(isPathInside("C:/canvas", "")).toBe(false);
		expect(isPathInside("", "C:/canvas")).toBe(false);
	});
});
