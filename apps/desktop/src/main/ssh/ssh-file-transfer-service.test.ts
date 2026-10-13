// Modified by The Open Forge contributors.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RemoteDirectoryEntry } from "@vetta/ssh-transport";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SshTransferEvent, SshTransferStatus } from "../../preload/api-types/ssh-transfers.js";
import { SshFileTransferService } from "./ssh-file-transfer-service.js";

/** fake 连接的可编程剧本：每个测试按需预填。 */
const ssh = vi.hoisted(() => ({
	stats: new Map<string, RemoteDirectoryEntry>(),
	recursive: new Map<string, string[]>(),
	downloadContents: new Map<string, Uint8Array>(),
	uploadContents: new Map<string, string>(),
	uploads: [] as { remotePath: string; totalBytes: number }[],
	dirsMade: [] as string[],
	hangUploads: false,
	activeUploads: 0,
	releaseResolvers: [] as Array<() => void>,
}));

vi.mock("./ssh-runtime.js", () => ({
	getSshConnection: () => ({
		stat: async (remotePath: string) => ssh.stats.get(remotePath) ?? null,
		listFilesRecursive: async (remotePath: string) => ssh.recursive.get(remotePath) ?? [],
		makeDirectory: async (remotePath: string) => {
			ssh.dirsMade.push(remotePath);
		},
		uploadFile: async (
			remotePath: string,
			options: {
				totalBytes: number;
				readChunk: (offset: number, length: number) => Promise<Uint8Array>;
				signal?: AbortSignal;
				onProgress?: (bytes: number) => void;
			},
		) => {
			ssh.activeUploads += 1;
			try {
				if (ssh.hangUploads) {
					await new Promise<void>((resolve, reject) => {
						if (options.signal?.aborted) {
							reject(new Error("aborted"));
							return;
						}
						options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
						ssh.releaseResolvers.push(resolve);
					});
					return { bytes: options.totalBytes };
				}
				let offset = 0;
				let text = "";
				for (;;) {
					const chunk = await options.readChunk(offset, 4);
					if (chunk.byteLength === 0) break;
					text += new TextDecoder().decode(chunk);
					offset += chunk.byteLength;
					options.onProgress?.(offset);
					if (offset >= options.totalBytes) break;
				}
				ssh.uploadContents.set(remotePath, text);
				ssh.uploads.push({ remotePath, totalBytes: offset });
				return { bytes: offset };
			} finally {
				ssh.activeUploads -= 1;
			}
		},
		downloadFile: async (
			remotePath: string,
			writeChunk: (chunk: Uint8Array) => void,
			options?: { onProgress?: (bytes: number) => void },
		) => {
			const content = ssh.downloadContents.get(remotePath);
			if (!content) throw new Error(`No scripted content for ${remotePath}`);
			writeChunk(content);
			options?.onProgress?.(content.byteLength);
			return { bytes: content.byteLength };
		},
	}),
}));

vi.mock("./ssh-host-service-instance.js", () => ({
	getSshHostService: () => ({ list: async () => [{ id: "h1", label: "Lab Host" }] }),
}));

vi.mock("../filesystem/remote-filesystem.js", () => ({
	assertRemotePathWithinProject: () => undefined,
}));

let testRoot = "";
let localSourceDir = "";
let localDownloadDir = "";

beforeEach(async () => {
	testRoot = await mkdtemp(join(tmpdir(), "vetta-ssh-transfer-service-"));
	localSourceDir = join(testRoot, "source");
	localDownloadDir = join(testRoot, "downloads");
	await mkdir(join(localSourceDir, "sub"), { recursive: true });
	await mkdir(localDownloadDir, { recursive: true });
	ssh.stats.clear();
	ssh.recursive.clear();
	ssh.downloadContents.clear();
	ssh.uploadContents.clear();
	ssh.uploads.length = 0;
	ssh.dirsMade.length = 0;
	ssh.hangUploads = false;
	ssh.activeUploads = 0;
	ssh.releaseResolvers.length = 0;
});

afterEach(async () => {
	await rm(testRoot, { recursive: true, force: true });
});

async function waitForStatus(service: SshFileTransferService, id: string, status: SshTransferStatus) {
	for (let attempt = 0; attempt < 500; attempt += 1) {
		// 先睡再查：transferring 在 commit 内同步置位，零等待会把「还没开始传」误判成已达状态。
		await new Promise((resolve) => setTimeout(resolve, 10));
		const item = service.list().find((entry) => entry.id === id);
		if (item?.status === status) return item;
	}
	throw new Error(`Transfer ${id} did not reach ${status}`);
}

async function collectEvents(service: SshFileTransferService): Promise<SshTransferEvent[]> {
	const events: SshTransferEvent[] = [];
	service.attachEventSink((event) => events.push(event));
	return events;
}

describe("SshFileTransferService", () => {
	it("上传文件夹：递归展开、按需建目录、内容逐字节到位", async () => {
		await writeFile(join(localSourceDir, "a.txt"), "hello", "utf8");
		await writeFile(join(localSourceDir, "sub", "b.txt"), "world!", "utf8");
		const service = new SshFileTransferService();
		await collectEvents(service);

		const plan = await service.plan(
			{ direction: "upload", remoteDirUri: "ssh://h1/srv/proj", localPaths: [localSourceDir] },
			7,
		);
		expect(plan.hostLabel).toBe("Lab Host");
		expect(plan.groups).toHaveLength(1);
		expect(plan.groups[0]?.fileCount).toBe(2);

		const [item] = await service.commit(plan.id, "replace", 7);
		expect(item?.fileCount).toBe(2);
		const settled = await waitForStatus(service, item?.id ?? "", "completed");
		expect(settled.filesDone).toBe(2);
		expect(settled.transferredBytes).toBe(11);
		expect(ssh.uploadContents.get("/srv/proj/source/a.txt")).toBe("hello");
		expect(ssh.uploadContents.get("/srv/proj/source/sub/b.txt")).toBe("world!");
		// b.txt 的父目录只建一次，不因 a.txt 重复建。
		expect(ssh.dirsMade).toContain("/srv/proj/source/sub");
		expect(ssh.dirsMade).toContain("/srv/proj/source");
	});

	it("冲突目标：skip 整文件剔除，replace 原样入队", async () => {
		await writeFile(join(localSourceDir, "a.txt"), "hello", "utf8");
		await writeFile(join(localSourceDir, "b.txt"), "world!", "utf8");
		ssh.stats.set("/srv/proj/a.txt", { name: "a.txt", kind: "file", sizeBytes: 5, modifiedAtSeconds: 0 });
		const service = new SshFileTransferService();

		const skipPlan = await service.plan(
			{
				direction: "upload",
				remoteDirUri: "ssh://h1/srv/proj",
				localPaths: [join(localSourceDir, "a.txt"), join(localSourceDir, "b.txt")],
			},
			7,
		);
		expect(skipPlan.groups[0]?.entries.find((entry) => entry.remotePath === "/srv/proj/a.txt")?.conflict).toBe(true);
		const [skipItem] = await service.commit(skipPlan.id, "skip", 7);
		expect(skipItem?.fileCount).toBe(1);
		await waitForStatus(service, skipItem?.id ?? "", "completed");
		expect(ssh.uploadContents.has("/srv/proj/a.txt")).toBe(false);
		expect(ssh.uploadContents.get("/srv/proj/b.txt")).toBe("world!");

		const replacePlan = await service.plan(
			{ direction: "upload", remoteDirUri: "ssh://h1/srv/proj", localPaths: [join(localSourceDir, "a.txt")] },
			7,
		);
		const [replaceItem] = await service.commit(replacePlan.id, "replace", 7);
		expect(replaceItem?.fileCount).toBe(1);
		await waitForStatus(service, replaceItem?.id ?? "", "completed");
		expect(ssh.uploadContents.get("/srv/proj/a.txt")).toBe("hello");
	});

	it("下载单文件与目录：内容逐字节落盘", async () => {
		const encoder = new TextEncoder();
		ssh.stats.set("/srv/proj/notes.txt", { name: "notes.txt", kind: "file", sizeBytes: 5, modifiedAtSeconds: 0 });
		ssh.stats.set("/srv/proj/src", { name: "src", kind: "directory", sizeBytes: 0, modifiedAtSeconds: 0 });
		ssh.downloadContents.set("/srv/proj/notes.txt", encoder.encode("hello"));
		ssh.downloadContents.set("/srv/proj/src/a.txt", encoder.encode("AAA"));
		ssh.recursive.set("/srv/proj/src", ["a.txt", "sub/b.txt"]);
		ssh.downloadContents.set("/srv/proj/src/sub/b.txt", encoder.encode("BBB"));
		const service = new SshFileTransferService();

		const filePlan = await service.plan(
			{ direction: "download", remoteUris: ["ssh://h1/srv/proj/notes.txt"], localDir: localDownloadDir },
			7,
		);
		const [fileItem] = await service.commit(filePlan.id, "replace", 7);
		await waitForStatus(service, fileItem?.id ?? "", "completed");
		await expect(readFile(join(localDownloadDir, "notes.txt"), "utf8")).resolves.toBe("hello");

		const dirPlan = await service.plan(
			{ direction: "download", remoteUris: ["ssh://h1/srv/proj/src"], localDir: localDownloadDir },
			7,
		);
		const [dirItem] = await service.commit(dirPlan.id, "replace", 7);
		expect(dirItem?.fileCount).toBe(2);
		await waitForStatus(service, dirItem?.id ?? "", "completed");
		await expect(readFile(join(localDownloadDir, "src", "a.txt"), "utf8")).resolves.toBe("AAA");
		await expect(readFile(join(localDownloadDir, "src", "sub", "b.txt"), "utf8")).resolves.toBe("BBB");
	});

	it("用户取消：条目落到 canceled，挂起的上传退出", async () => {
		await writeFile(join(localSourceDir, "a.txt"), "hello", "utf8");
		ssh.hangUploads = true;
		const service = new SshFileTransferService();

		const plan = await service.plan(
			{ direction: "upload", remoteDirUri: "ssh://h1/srv/proj", localPaths: [join(localSourceDir, "a.txt")] },
			7,
		);
		const [item] = await service.commit(plan.id, "replace", 7);
		await waitForStatus(service, item?.id ?? "", "transferring");
		expect(ssh.activeUploads).toBe(1);
		service.cancel(item?.id ?? "");
		const settled = await waitForStatus(service, item?.id ?? "", "canceled");
		expect(settled.error).toBeUndefined();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(ssh.activeUploads).toBe(0);
	});

	it("并发上限：同时至多两条在传，完成一条才放行第三条", async () => {
		ssh.hangUploads = true;
		const service = new SshFileTransferService();
		const ids: string[] = [];
		for (const name of ["one.txt", "two.txt", "three.txt"]) {
			await writeFile(join(localSourceDir, name), "x", "utf8");
			const plan = await service.plan(
				{ direction: "upload", remoteDirUri: "ssh://h1/srv/proj", localPaths: [join(localSourceDir, name)] },
				7,
			);
			const [item] = await service.commit(plan.id, "replace", 7);
			ids.push(item?.id ?? "");
		}
		for (let attempt = 0; attempt < 200 && ssh.activeUploads < 2; attempt += 1) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		expect(ssh.activeUploads).toBe(2);
		// 放行一条；第三条异步补位挂起后，再全量放行——快照必须等三号入场，否则它的 resolver 无人释放。
		ssh.releaseResolvers.shift()?.();
		await vi.waitFor(() => {
			expect(ssh.releaseResolvers.length).toBe(2);
			expect(ssh.activeUploads).toBe(2);
		});
		for (const resolve of [...ssh.releaseResolvers]) resolve();
		await waitForStatus(service, ids[0] ?? "", "completed");
		await waitForStatus(service, ids[1] ?? "", "completed");
		await waitForStatus(service, ids[2] ?? "", "completed");
	});

	it("plan 握手绑定归属：别的 sender 拿去 commit 会被拒", async () => {
		await writeFile(join(localSourceDir, "a.txt"), "hello", "utf8");
		const service = new SshFileTransferService();
		const plan = await service.plan(
			{ direction: "upload", remoteDirUri: "ssh://h1/srv/proj", localPaths: [join(localSourceDir, "a.txt")] },
			7,
		);
		expect(() => service.commit(plan.id, "replace", 99)).toThrow("Transfer plan expired or unavailable");
		// 归属匹配的 commit 仍可用。
		const [item] = await service.commit(plan.id, "replace", 7);
		await waitForStatus(service, item?.id ?? "", "completed");
	});
});
