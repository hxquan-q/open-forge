// Copyright The Open Forge contributors.
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { encodeCanvasWorkspaceBucket, sha256Hex } from "./canvas-paths.js";
import { CanvasStore } from "./canvas-store.js";

const disposals: string[] = [];

async function createStore(): Promise<CanvasStore> {
	const root = await mkdtemp(join(tmpdir(), "canvas-store-"));
	disposals.push(root);
	return new CanvasStore(root);
}

afterEach(async () => {
	const { rm } = await import("node:fs/promises");
	await Promise.all(disposals.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CanvasStore", () => {
	it("原子写入后可读，且不留下半成品 tmp", async () => {
		const store = await createStore();
		const written = await store.write({
			workspaceId: "C:/projects/demo",
			artifactId: "artifact-1",
			version: 1,
			content: "# Hello",
			contentType: "text/markdown",
		});
		expect(written.checksum).toBe(sha256Hex("# Hello"));
		expect(await store.readContent(written.path)).toBe("# Hello");
		const names = await readdir(store.artifactDir("C:/projects/demo", "artifact-1"));
		expect(names.some((name) => name.endsWith(".tmp"))).toBe(false);
		expect(names).toContain("v1.md");
	});

	it("按 workspace 分桶，缺失文件返回空而不是抛错", async () => {
		const store = await createStore();
		expect(await store.listVersions("ws-a", "missing")).toEqual([]);
		expect(await store.listArtifactIds("ws-a")).toEqual([]);
		expect(await store.exists(store.versionPath("ws-a", "artifact-1", 1, ".md"))).toBe(false);
		const first = await store.write({
			workspaceId: "ws-a",
			artifactId: "artifact-1",
			version: 1,
			content: "a",
		});
		await store.write({
			workspaceId: "ws-b",
			artifactId: "artifact-1",
			version: 1,
			content: "b",
		});
		expect(await store.readContent(first.path)).toBe("a");
		expect(await store.listArtifactIds("ws-a")).toEqual(["artifact-1"]);
	});

	it("拒绝路径逃逸的 artifactId，workspace 用编码目录而不是原路径", async () => {
		const store = await createStore();
		expect(() => store.artifactDir("ws", "../etc")).toThrowError(/invalid artifactId/);
		const written = await store.write({
			workspaceId: "C:/projects/demo",
			artifactId: "notes",
			version: 1,
			content: "ok",
		});
		expect(written.path).toContain(encodeCanvasWorkspaceBucket("C:/projects/demo"));
		expect(written.path.includes("C:/projects/demo") || written.path.includes("C:\\projects\\demo")).toBe(false);
	});

	it("update 写新版本，不覆盖旧版本文件", async () => {
		const store = await createStore();
		const v1 = await store.write({
			workspaceId: "ws",
			artifactId: "doc",
			version: 1,
			content: "one",
		});
		const v2 = await store.write({
			workspaceId: "ws",
			artifactId: "doc",
			version: 2,
			content: "two",
		});
		expect(await store.readContent(v1.path)).toBe("one");
		expect(await store.readContent(v2.path)).toBe("two");
		expect((await store.listVersions("ws", "doc")).map((item) => item.version)).toEqual([1, 2]);
	});

	it("外部直接改文件后 checksum 变化，枚举仍能读到", async () => {
		const store = await createStore();
		const v1 = await store.write({
			workspaceId: "ws",
			artifactId: "doc",
			version: 1,
			content: "one",
		});
		await writeFile(v1.path, "edited", "utf8");
		expect(await store.checksumOfPath(v1.path)).toBe(sha256Hex("edited"));
	});
});
