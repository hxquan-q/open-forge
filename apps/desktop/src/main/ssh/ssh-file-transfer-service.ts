// Modified by The Open Forge contributors.
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { open, readdir, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, posix } from "node:path";
import { formatSshProjectUri, normalizeRemotePath, parseProjectLocation } from "@vetta/ssh-transport";
import type {
	SshTransferConflictPolicy,
	SshTransferEntryPlan,
	SshTransferEvent,
	SshTransferGroupPlan,
	SshTransferItem,
	SshTransferPlan,
	SshTransferPlanInput,
	SshTransferPlanSkipped,
} from "../../preload/api-types/ssh-transfers.js";
import { assertRemotePathWithinProject } from "../filesystem/remote-filesystem.js";
import { getSshHostService } from "./ssh-host-service-instance.js";
import { getSshConnection } from "./ssh-runtime.js";

/**
 * 本机 ↔ SSH 远端项目之间的流式文件传输队列。
 *
 * 通道是 `SshConnection.uploadFile/downloadFile`（SSH exec 流式字节通道，见 ssh-transport），
 * 本服务只负责编排：展开文件夹、目标冲突标记、并发排队、进度与取消的账本。传输语义上的
 * 取消安全（半截文件不会替换目标）由通道层的远端 wc 校验保证，这里不重复造。
 *
 * 结构照 `downloads/download-service.ts`：事件经 {@link attachEventSink} 推给渲染进程，
 * 至多 MAX_CONCURRENT 条并发，AbortController 负责取消。
 */
const MAX_CONCURRENT = 2;
/** plan → commit 的握手有效期；过期重 plan，不放大存储。 */
const PLAN_TTL_MS = 2 * 60 * 1000;
/** 单次传输展开出的文件数上限：超出如实报错，而不是悄悄只传一半。 */
const MAX_ENTRIES_PER_GROUP = 10_000;
/** 冲突探测（远端 stat）的并发度：一次往返一颗延迟，串行在几百个文件的目录上太慢。 */
const CONFLICT_PROBE_CONCURRENCY = 8;

interface StoredPlan {
	readonly direction: SshTransferPlanInput["direction"];
	readonly hostId: string;
	readonly hostLabel: string;
	readonly groups: readonly SshTransferGroupPlan[];
	readonly skipped: readonly SshTransferPlanSkipped[];
	readonly ownerId: number;
	readonly expiresAt: number;
}

interface TransferEntry {
	readonly localPath: string;
	readonly remotePath: string;
	readonly sizeBytes: number;
}

interface InternalItem {
	readonly id: string;
	readonly direction: SshTransferPlanInput["direction"];
	readonly hostId: string;
	readonly hostLabel: string;
	readonly name: string;
	readonly remotePath: string;
	readonly localPath: string;
	readonly entries: readonly TransferEntry[];
	readonly controller: AbortController;
	/** 下一个待传条目的下标；整组从头传到尾，不跳号。 */
	nextEntry: number;
	/** 已整文件完成的字节数；进度 = completedBytes + 当前文件内进度。 */
	completedBytes: number;
	filesDone: number;
	totalBytes: number;
	transferredBytes: number;
	status: SshTransferItem["status"];
	/** 只有用户点取消才置位；写侧故障也会 abort，但要按「失败」上报。 */
	cancelRequested: boolean;
	error?: string;
	createdAt: number;
	completedAt?: number;
	speedBytesPerSec?: number;
}

type SshTransferEventSink = (event: SshTransferEvent) => void;

export class SshFileTransferService {
	private eventSink: SshTransferEventSink | undefined;
	private readonly items = new Map<string, InternalItem>();
	private readonly queue: string[] = [];
	private readonly active = new Set<string>();
	private readonly rates = new Map<string, { lastBytes: number; lastTs: number }>();
	private readonly plans = new Map<string, StoredPlan>();
	private sequence = 0;

	attachEventSink(sink: SshTransferEventSink): () => void {
		this.eventSink = sink;
		return () => {
			if (this.eventSink === sink) this.eventSink = undefined;
		};
	}

	/**
	 * 展开并探测一次传输：文件夹在本地/远端各自递归展开，逐文件标记目标冲突。
	 * 只读操作（stat/existsSync），不落任何字节；真正的入队在 {@link commit}。
	 */
	async plan(input: SshTransferPlanInput, ownerId: number): Promise<SshTransferPlan> {
		this.pruneExpiredPlans();
		const skipped: SshTransferPlanSkipped[] = [];
		const groups =
			input.direction === "upload" ? await this.planUpload(input, skipped) : await this.planDownload(input, skipped);
		const hostId =
			input.direction === "upload"
				? this.splitUri(input.remoteDirUri).hostId
				: this.splitUri(input.remoteUris[0] ?? "").hostId;
		const hostLabel = (await getSshHostService().list()).find((host) => host.id === hostId)?.label ?? hostId;
		const plan: SshTransferPlan = {
			id: this.nextPlanId(),
			direction: input.direction,
			hostId,
			hostLabel,
			groups,
			skipped,
		};
		this.plans.set(plan.id, {
			direction: plan.direction,
			hostId,
			hostLabel,
			groups,
			skipped,
			ownerId,
			expiresAt: Date.now() + PLAN_TTL_MS,
		});
		return plan;
	}

	/** 按 plan 入队。`skip` 策略整文件剔除冲突条目；`replace` 原样入队。 */
	commit(planId: string, conflictPolicy: SshTransferConflictPolicy, ownerId: number): SshTransferItem[] {
		this.pruneExpiredPlans();
		const plan = this.plans.get(planId);
		if (!plan || plan.ownerId !== ownerId) throw new Error("Transfer plan expired or unavailable");
		this.plans.delete(planId);
		const created: SshTransferItem[] = [];
		for (const group of plan.groups) {
			const entries = group.entries
				.filter((entry) => conflictPolicy === "replace" || !entry.conflict)
				.map((entry) => ({ localPath: entry.localPath, remotePath: entry.remotePath, sizeBytes: entry.sizeBytes }));
			if (entries.length === 0) continue;
			const item = this.enqueue({
				direction: plan.direction,
				hostId: plan.hostId,
				hostLabel: plan.hostLabel,
				name: group.name,
				remotePath: group.remotePath,
				localPath: group.localPath,
				entries,
			});
			created.push(this.snapshot(item));
		}
		this.pump();
		return created;
	}

	cancel(id: string): void {
		const item = this.items.get(id);
		if (!item) return;
		const queueIndex = this.queue.indexOf(id);
		if (queueIndex >= 0) this.queue.splice(queueIndex, 1);
		item.cancelRequested = true;
		item.controller.abort();
		if (item.status === "queued") {
			item.status = "canceled";
			item.completedAt = Date.now();
			this.notifyUpdated(item);
		}
	}

	/** 只清除已结束的条目；进行中的先取消再清（与 downloads.remove 同义）。 */
	async remove(id: string): Promise<void> {
		const item = this.items.get(id);
		if (!item) return;
		if (item.status === "queued" || item.status === "transferring") this.cancel(id);
		this.items.delete(id);
		this.rates.delete(id);
		this.notifyRemoved(id);
	}

	list(): SshTransferItem[] {
		return Array.from(this.items.values())
			.map((item) => this.snapshot(item))
			.sort((a, b) => b.createdAt - a.createdAt);
	}

	// ─── 展开与探测 ───────────────────────────────────────────────

	private async planUpload(
		input: Extract<SshTransferPlanInput, { direction: "upload" }>,
		skipped: SshTransferPlanSkipped[],
	): Promise<SshTransferGroupPlan[]> {
		const { hostId, remotePath: remoteDir } = this.splitUri(input.remoteDirUri);
		assertRemotePathWithinProject(formatSshProjectUri(hostId, remoteDir));
		const normalizedDir = normalizeRemotePath(remoteDir);
		const groups: SshTransferGroupPlan[] = [];
		for (const localPath of input.localPaths) {
			if (typeof localPath !== "string" || localPath.trim() === "") continue;
			if (!isAbsolute(localPath)) throw new Error(`Upload source must be an absolute path: ${localPath}`);
			let info: ReturnType<typeof statSync>;
			try {
				info = statSync(localPath);
			} catch {
				skipped.push({ name: basename(localPath), reason: "source-missing" });
				continue;
			}
			const name = basename(localPath);
			if (info.isDirectory()) {
				const walked = await this.walkLocalDirectory(localPath, skipped);
				const entries = walked.map((file) => ({
					localPath: file.path,
					// 文件夹作为整体传送：远端落在 <目标>/<文件夹名>/… 下，与下载对侧一致。
					remotePath: posix.join(normalizedDir, name, file.relativePath),
					name: basename(file.path),
					sizeBytes: file.sizeBytes,
					relativePath: file.relativePath,
					conflict: false,
				}));
				groups.push({
					name,
					remotePath: posix.join(normalizedDir, name),
					localPath,
					totalBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
					fileCount: entries.length,
					entries: await this.markUploadConflicts(hostId, entries),
				});
			} else if (info.isFile()) {
				const entry = {
					localPath,
					remotePath: posix.join(normalizedDir, name),
					name,
					sizeBytes: info.size,
					relativePath: undefined,
					conflict: false,
				};
				groups.push({
					name,
					remotePath: posix.join(normalizedDir, name),
					localPath,
					totalBytes: info.size,
					fileCount: 1,
					entries: await this.markUploadConflicts(hostId, [entry]),
				});
			} else {
				skipped.push({ name, reason: "source-not-regular-file" });
			}
		}
		return groups;
	}

	private async planDownload(
		input: Extract<SshTransferPlanInput, { direction: "download" }>,
		skipped: SshTransferPlanSkipped[],
	): Promise<SshTransferGroupPlan[]> {
		const uris = input.remoteUris.filter((uri): uri is string => typeof uri === "string" && uri.trim() !== "");
		if (uris.length === 0) throw new Error("No remote paths to download");
		if (typeof input.localDir !== "string" || !isAbsolute(input.localDir)) {
			throw new Error("Download target must be an absolute local directory");
		}
		const hostIds = new Set(uris.map((uri) => this.splitUri(uri).hostId));
		if (hostIds.size > 1) throw new Error("Cannot download from multiple hosts in one transfer");
		const hostId = hostIds.values().next().value;
		if (hostId === undefined) throw new Error("No remote paths to download");
		for (const uri of uris) assertRemotePathWithinProject(uri);
		const connection = getSshConnection(hostId);
		const groups: SshTransferGroupPlan[] = [];
		for (const uri of uris) {
			const { remotePath } = this.splitUri(uri);
			// 顶层跟随符号链接：用户点的是文件树里显示为文件的东西，就按文件传。
			const info = await connection.stat(remotePath, undefined, { followSymlinks: true });
			if (!info) {
				skipped.push({ name: basename(remotePath), reason: "source-missing" });
				continue;
			}
			const name = basename(remotePath);
			if (info.kind === "directory") {
				const relativePaths = await connection.listFilesRecursive(remotePath, {
					ignoredDirectoryNames: [],
					limit: MAX_ENTRIES_PER_GROUP,
				});
				const entries: SshTransferEntryPlan[] = [];
				for (const relativePath of relativePaths) {
					// 与上传对侧一致：文件夹作为整体落到 <目标目录>/<文件夹名>/… 下。
					const localPath = join(input.localDir, name, ...relativePath.split("/"));
					entries.push({
						localPath,
						remotePath: posix.join(remotePath, relativePath),
						name: posix.basename(relativePath),
						sizeBytes: 0,
						relativePath,
						conflict: existsSync(localPath),
					});
				}
				if (relativePaths.length >= MAX_ENTRIES_PER_GROUP) {
					skipped.push({ name, reason: "entry-limit-reached" });
				}
				groups.push({
					name,
					remotePath,
					localPath: join(input.localDir, name),
					totalBytes: 0,
					fileCount: entries.length,
					entries,
				});
			} else if (info.kind === "file") {
				const localPath = join(input.localDir, name);
				groups.push({
					name,
					remotePath,
					localPath,
					totalBytes: info.sizeBytes,
					fileCount: 1,
					entries: [
						{
							localPath,
							remotePath,
							name,
							sizeBytes: info.sizeBytes,
							relativePath: undefined,
							conflict: existsSync(localPath),
						},
					],
				});
			} else {
				skipped.push({ name, reason: "source-not-regular-file" });
			}
		}
		return groups;
	}

	/** 本机目录递归展开。符号链接不入队（可能成环），如实记进 skipped。 */
	private async walkLocalDirectory(
		root: string,
		skipped: SshTransferPlanSkipped[],
	): Promise<{ path: string; relativePath: string; sizeBytes: number }[]> {
		const files: { path: string; relativePath: string; sizeBytes: number }[] = [];
		const stack: { dir: string; relativePath: string }[] = [{ dir: root, relativePath: "" }];
		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) break;
			const dirents = await readdir(current.dir, { withFileTypes: true });
			for (const dirent of dirents) {
				const path = join(current.dir, dirent.name);
				const relativePath = current.relativePath === "" ? dirent.name : `${current.relativePath}/${dirent.name}`;
				if (dirent.isDirectory()) {
					stack.push({ dir: path, relativePath });
				} else if (dirent.isFile()) {
					if (files.length >= MAX_ENTRIES_PER_GROUP) throw new Error(`Too many files under ${root}`);
					let sizeBytes = 0;
					try {
						sizeBytes = statSync(path).size;
					} catch {
						skipped.push({ name: relativePath, reason: "source-missing" });
						continue;
					}
					files.push({ path, relativePath, sizeBytes });
				} else {
					skipped.push({ name: relativePath, reason: "symlink-skipped" });
				}
			}
		}
		return files;
	}

	/** 远端逐个 stat 标记目标冲突；小并发把几百个条目的探测压到几十轮往返。 */
	private async markUploadConflicts(hostId: string, entries: SshTransferEntryPlan[]): Promise<SshTransferEntryPlan[]> {
		const connection = getSshConnection(hostId);
		const marked = entries.map((entry) => ({ ...entry, conflict: false }));
		for (let start = 0; start < marked.length; start += CONFLICT_PROBE_CONCURRENCY) {
			const batch = marked.slice(start, start + CONFLICT_PROBE_CONCURRENCY);
			await Promise.all(
				batch.map(async (entry) => {
					const existing = await connection.stat(entry.remotePath);
					entry.conflict = existing !== null;
				}),
			);
		}
		return marked;
	}

	// ─── 队列与执行 ───────────────────────────────────────────────

	private enqueue(input: {
		direction: SshTransferPlanInput["direction"];
		hostId: string;
		hostLabel: string;
		name: string;
		remotePath: string;
		localPath: string;
		entries: readonly TransferEntry[];
	}): InternalItem {
		this.sequence += 1;
		const item: InternalItem = {
			id: `xfer_${Date.now()}_${this.sequence}`,
			...input,
			controller: new AbortController(),
			cancelRequested: false,
			nextEntry: 0,
			completedBytes: 0,
			filesDone: 0,
			totalBytes: input.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
			transferredBytes: 0,
			status: "queued",
			createdAt: Date.now(),
		};
		this.items.set(item.id, item);
		this.queue.push(item.id);
		this.notifyAdded(item);
		return item;
	}

	private pump(): void {
		while (this.active.size < MAX_CONCURRENT && this.queue.length > 0) {
			const id = this.queue.shift();
			if (!id) break;
			const item = this.items.get(id);
			if (!item || item.status !== "queued") continue;
			this.active.add(id);
			this.runItem(item)
				.catch((error: unknown) => {
					// runItem 自身吞掉业务失败；能漏到这里的只有账本 bug，如实记下来。
					item.status = "failed";
					item.error = error instanceof Error ? error.message : String(error);
					item.completedAt = Date.now();
					this.notifyUpdated(item);
				})
				.finally(() => {
					this.active.delete(id);
					this.pump();
				});
		}
	}

	private async runItem(item: InternalItem): Promise<void> {
		item.status = "transferring";
		item.speedBytesPerSec = 0;
		this.rates.set(item.id, { lastBytes: 0, lastTs: Date.now() });
		this.notifyUpdated(item);
		const signal = item.controller.signal;
		const connection = getSshConnection(item.hostId);
		const madeDirs = new Set<string>();
		while (item.nextEntry < item.entries.length && !signal.aborted) {
			const entry = item.entries[item.nextEntry];
			try {
				if (item.direction === "upload") {
					await this.runUploadEntry(connection, item, entry, madeDirs);
				} else {
					await this.runDownloadEntry(connection, item, entry);
				}
			} catch (error) {
				if (signal.aborted && item.cancelRequested) {
					item.status = "canceled";
				} else {
					item.status = "failed";
					item.error = error instanceof Error ? error.message : String(error);
				}
				item.completedAt = Date.now();
				item.speedBytesPerSec = 0;
				this.notifyUpdated(item);
				return;
			}
			item.completedBytes += entry.sizeBytes;
			item.filesDone += 1;
			item.nextEntry += 1;
			item.transferredBytes = item.completedBytes;
			this.notifyUpdated(item);
		}
		if (signal.aborted) {
			item.status = "canceled";
			item.completedAt = Date.now();
			item.speedBytesPerSec = 0;
			this.notifyUpdated(item);
		} else {
			item.status = "completed";
			item.completedAt = Date.now();
			item.speedBytesPerSec = 0;
			this.notifyUpdated(item);
		}
	}

	private async runUploadEntry(
		connection: ReturnType<typeof getSshConnection>,
		item: InternalItem,
		entry: TransferEntry,
		madeDirs: Set<string>,
	): Promise<void> {
		const signal = item.controller.signal;
		// mkdir -p 幂等但一次就是一轮 SSH 往返；同目录的兄弟文件不必重复建。
		const parent = posix.dirname(entry.remotePath);
		if (!madeDirs.has(parent)) {
			await connection.makeDirectory(parent, signal);
			madeDirs.add(parent);
		}
		const handle = await open(entry.localPath, "r");
		try {
			await connection.uploadFile(entry.remotePath, {
				totalBytes: entry.sizeBytes,
				readChunk: async (offset, length) => {
					const buffer = new Uint8Array(new ArrayBuffer(length));
					const { bytesRead } = await handle.read(buffer, 0, length, offset);
					return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
				},
				signal,
				onProgress: (bytes) => this.updateProgress(item, item.completedBytes + bytes),
			});
		} finally {
			await handle.close();
		}
	}

	private async runDownloadEntry(
		connection: ReturnType<typeof getSshConnection>,
		item: InternalItem,
		entry: TransferEntry,
	): Promise<void> {
		const signal = item.controller.signal;
		mkdirSync(dirname(entry.localPath), { recursive: true });
		// 下载失败/取消时删掉半截文件（upload 的半截由远端 wc 校验兜住，本地这半截只能自己兜）。
		const stream = createWriteStream(entry.localPath, { flags: "w" });
		// 写侧故障（磁盘满、权限）不能从回调里抛——那会变成主进程 uncaught；
		// 记下来、停掉远端读取，等 downloadFile 结束后如实按「失败」上报。
		let streamError: unknown;
		stream.on("error", (error: Error) => {
			streamError ??= error;
			item.controller.abort();
		});
		let settled = false;
		try {
			try {
				await connection.downloadFile(
					entry.remotePath,
					(chunk) => {
						if (streamError !== undefined) return;
						stream.write(chunk);
					},
					{
						signal,
						onProgress: (bytes) => this.updateProgress(item, item.completedBytes + bytes),
					},
				);
			} catch (error) {
				if (streamError !== undefined) throw streamError;
				throw error;
			}
			await new Promise<void>((resolve, reject) => {
				stream.once("error", reject);
				stream.end(() => resolve());
			});
			settled = true;
		} catch (error) {
			if (streamError !== undefined) throw streamError;
			throw error;
		} finally {
			stream.destroy();
			if (!settled) await rm(entry.localPath, { force: true }).catch(() => undefined);
		}
	}

	private updateProgress(item: InternalItem, transferredBytes: number): void {
		item.transferredBytes = transferredBytes;
		this.updateRate(item);
		this.notifyUpdated(item);
	}

	private updateRate(item: InternalItem): void {
		const rate = this.rates.get(item.id);
		if (!rate) return;
		const now = Date.now();
		const elapsed = now - rate.lastTs;
		if (elapsed < 500) return;
		const transferred = item.transferredBytes - rate.lastBytes;
		item.speedBytesPerSec = Math.round((transferred / elapsed) * 1000);
		rate.lastBytes = item.transferredBytes;
		rate.lastTs = now;
	}

	// ─── 杂项 ─────────────────────────────────────────────────────

	private splitUri(uri: string): { hostId: string; remotePath: string } {
		const location = parseProjectLocation(uri);
		if (location.kind !== "ssh") throw new Error(`Not a remote path: ${uri}`);
		return { hostId: location.hostId, remotePath: location.remotePath };
	}

	private pruneExpiredPlans(): void {
		const now = Date.now();
		for (const [id, plan] of this.plans) {
			if (plan.expiresAt <= now) this.plans.delete(id);
		}
	}

	private nextPlanId(): string {
		this.sequence += 1;
		return `xfer-plan_${Date.now()}_${this.sequence}`;
	}

	private snapshot(item: InternalItem): SshTransferItem {
		return {
			id: item.id,
			direction: item.direction,
			hostId: item.hostId,
			hostLabel: item.hostLabel,
			name: item.name,
			remotePath: item.remotePath,
			localPath: item.localPath,
			totalBytes: item.totalBytes,
			transferredBytes: item.transferredBytes,
			status: item.status,
			error: item.error,
			createdAt: item.createdAt,
			completedAt: item.completedAt,
			speedBytesPerSec: item.speedBytesPerSec,
			fileCount: item.entries.length,
			filesDone: item.filesDone,
		};
	}

	private emit(event: SshTransferEvent): void {
		this.eventSink?.(event);
	}

	private notifyAdded(item: InternalItem): void {
		this.emit({ type: "added", item: this.snapshot(item) });
	}

	private notifyUpdated(item: InternalItem): void {
		this.emit({ type: "updated", item: this.snapshot(item) });
	}

	private notifyRemoved(id: string): void {
		this.emit({ type: "removed", id });
	}
}

let sharedSshFileTransferService: SshFileTransferService | undefined;

export function getSshFileTransferService(): SshFileTransferService {
	sharedSshFileTransferService ??= new SshFileTransferService();
	return sharedSshFileTransferService;
}
