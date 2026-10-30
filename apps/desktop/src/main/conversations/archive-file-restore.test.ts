// Copyright The Open Forge contributors.
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSION_ARCHIVE_ERROR_CODES } from "@vetta/runtime-storage/conversation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureArchiveDirectory, restoreArchiveAttachments, restoreArchiveFile } from "./archive-file-restore.js";

vi.mock("node:fs/promises", { spy: true });

const bytes = (text: string) => new TextEncoder().encode(text);

describe("archive file restoration", () => {
	const roots: string[] = [];
	afterEach(async () => {
		vi.restoreAllMocks();
		await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
	});
	async function root(): Promise<string> {
		const path = await fs.mkdtemp(join(tmpdir(), "archive-files-"));
		roots.push(path);
		return path;
	}

	it("restores nested binary artifacts, skips existing files, and overwrites only with explicit consent", async () => {
		const target = join(await root(), "new-project");
		const binary = new Uint8Array([0, 1, 255, 128]);
		expect(await restoreArchiveFile(target, "nested/artifact.bin", binary)).toBe("written");
		expect(new Uint8Array(await fs.readFile(join(target, "nested/artifact.bin")))).toEqual(binary);
		expect(await restoreArchiveFile(target, "nested/artifact.bin", bytes("other"))).toBe("skipped");
		expect(new Uint8Array(await fs.readFile(join(target, "nested/artifact.bin")))).toEqual(binary);
		expect(await restoreArchiveFile(target, "nested/artifact.bin", bytes("other"), true)).toBe("overwritten");
		expect(await fs.readFile(join(target, "nested/artifact.bin"), "utf8")).toBe("other");
		expect(await fs.readdir(join(target, "nested"))).toEqual(["artifact.bin"]);
	});

	it("concurrent default imports publish exactly one complete file without clobbering it", async () => {
		const target = await root();
		const results = await Promise.all([
			restoreArchiveFile(target, "artifact.txt", bytes("first")),
			restoreArchiveFile(target, "artifact.txt", bytes("second")),
		]);
		expect(results.sort()).toEqual(["skipped", "written"]);
		expect(["first", "second"]).toContain(await fs.readFile(join(target, "artifact.txt"), "utf8"));
		expect(await fs.readdir(target)).toEqual(["artifact.txt"]);
	});

	it("supports no-clobber restoration on filesystems without hard links", async () => {
		const target = await root();
		vi.mocked(fs.link).mockRejectedValueOnce(Object.assign(new Error("not supported"), { code: "ENOTSUP" }));
		expect(await restoreArchiveFile(target, "artifact.txt", bytes("complete"))).toBe("written");
		expect(await fs.readFile(join(target, "artifact.txt"), "utf8")).toBe("complete");
		expect(await fs.readdir(target)).toEqual(["artifact.txt"]);
	});

	it("fallback exclusive copy preserves a concurrently created destination and cleans its temporary file", async () => {
		const target = await root();
		vi.mocked(fs.link).mockImplementationOnce(async () => {
			await fs.writeFile(join(target, "artifact.txt"), "concurrent-user-file");
			throw Object.assign(new Error("not supported"), { code: "ENOTSUP" });
		});
		expect(await restoreArchiveFile(target, "artifact.txt", bytes("archive"))).toBe("skipped");
		expect(await fs.readFile(join(target, "artifact.txt"), "utf8")).toBe("concurrent-user-file");
		expect(await fs.readdir(target)).toEqual(["artifact.txt"]);
	});

	it("preserves existing ordinary permissions when replacing an executable artifact", async () => {
		const target = await root();
		await fs.writeFile(join(target, "run.sh"), "old script", { mode: 0o755 });
		const originalMode = (await fs.stat(join(target, "run.sh"))).mode & 0o777;
		expect(await restoreArchiveFile(target, "run.sh", bytes("new script"), true)).toBe("overwritten");
		expect(fs.chmod).toHaveBeenCalledWith(expect.any(String), originalMode);
		expect((await fs.stat(join(target, "run.sh"))).mode & 0o777).toBe(originalMode);
		expect(await fs.readFile(join(target, "run.sh"), "utf8")).toBe("new script");
	});

	it("explicit overwrite replaces the target instead of truncating a user's hard-linked file", async () => {
		const target = await root();
		const outside = join(await root(), "user.txt");
		await fs.writeFile(outside, "user-owned");
		await fs.link(outside, join(target, "artifact.txt"));
		expect(await restoreArchiveFile(target, "artifact.txt", bytes("restored"), true)).toBe("overwritten");
		expect(await fs.readFile(outside, "utf8")).toBe("user-owned");
		expect(await fs.readFile(join(target, "artifact.txt"), "utf8")).toBe("restored");
	});

	it("rejects linked roots, intermediate links and directory leaves, even for overwrite", async () => {
		const target = await root();
		const outside = await root();
		await fs.symlink(outside, join(target, "linked"), process.platform === "win32" ? "junction" : "dir");
		await expect(ensureArchiveDirectory(join(target, "linked"))).rejects.toMatchObject({
			archiveCode: SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH,
		});
		await expect(restoreArchiveFile(target, "linked/file.txt", bytes("bad"), true)).rejects.toMatchObject({
			archiveCode: SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH,
		});
		await expect(restoreArchiveFile(target, "linked", bytes("bad"), true)).rejects.toMatchObject({
			archiveCode: SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH,
		});
		expect(await fs.readdir(outside)).toEqual([]);
	});

	it.each(["../escape", "C:/escape", "nested/file:stream", "CON.txt", "nested/file.", "nested/file "])(
		"rejects nonportable or escaping path %s",
		async (path) => {
			const target = await root();
			await expect(restoreArchiveFile(target, path, bytes("bad"))).rejects.toMatchObject({
				archiveCode: SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH,
			});
			expect(await fs.readdir(target)).toEqual([]);
		},
	);

	it("cleans a partially written temporary file without replacing existing content on failure", async () => {
		const target = await root();
		await fs.writeFile(join(target, "artifact.txt"), "user-owned");
		const write = fs.writeFile;
		vi.spyOn(fs, "writeFile").mockImplementationOnce(async (...args) => {
			await write(...args);
			throw new Error("disk full");
		});
		await expect(restoreArchiveFile(target, "artifact.txt", bytes("replacement"), true)).rejects.toThrow("disk full");
		expect(await fs.readFile(join(target, "artifact.txt"), "utf8")).toBe("user-owned");
		expect(await fs.readdir(target)).toEqual(["artifact.txt"]);
	});

	it("attachment retries accept identical bytes but reject conflicting files without overwriting", async () => {
		const target = await root();
		const attachment = { relativePath: "assets/image.bin", bytes: bytes("original") };
		await restoreArchiveAttachments(target, [attachment, attachment]);
		await expect(
			restoreArchiveAttachments(target, [{ ...attachment, bytes: bytes("changed") }]),
		).rejects.toMatchObject({ archiveCode: SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME });
		expect(await fs.readFile(join(target, "assets/image.bin"), "utf8")).toBe("original");
	});
});
