// Modified by The Open Forge contributors.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
	decideReviewRollback,
	type FinalizeReviewSnapshotInput,
	type PreparedReviewSnapshot,
	type PrepareReviewSnapshotInput,
	parseReviewSnapshotMeta,
	REVIEW_SNAPSHOT_MAX_BYTES,
	type ReviewSnapshot,
	type ReviewSnapshotMeta,
	type ReviewSnapshotStore,
} from "@vetta/runtime-storage/conversation";
import { nodeErrorCode } from "../conversation/node-error-code.js";
import { safeResultArtifactSegment } from "./result-artifact-storage.js";

const BEFORE_FILE_NAME = "before";
const META_FILE_NAME = "meta.json";

interface NodePreparedReviewSnapshot extends PreparedReviewSnapshot {
	readonly directory: string;
	readonly input: PrepareReviewSnapshotInput;
	readonly beforeHash?: string;
	readonly beforeCopied: boolean;
}

function sha256Hex(data: Uint8Array): string {
	return createHash("sha256").update(data).digest("hex");
}

/** 与 result-artifact-storage 相同的原子写：tmp + rename，避免半截 meta/目标文件。 */
async function writeFileAtomic(targetPath: string, data: Uint8Array | string): Promise<void> {
	const temporaryPath = `${targetPath}.tmp`;
	try {
		await writeFile(temporaryPath, data);
		await rename(temporaryPath, targetPath);
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

/**
 * 文件系统快照库：`<root>/<sessionId>/<snapshotId>/{before,meta.json}`。
 * 会话目录名复用 artifact 段清洗规则，天然防路径穿越；meta 校验失败一律按
 * 不可用处理——快照库是自产数据，但磁盘上的内容仍按不可信边界校验。
 */
export function createNodeReviewSnapshotStore(rootDirectory: string): ReviewSnapshotStore {
	const root = resolve(rootDirectory);
	const sessionDirectory = (sessionId: string) => join(root, safeResultArtifactSegment(sessionId));
	const snapshotDirectory = (sessionId: string, snapshotId: string) =>
		join(sessionDirectory(sessionId), safeResultArtifactSegment(snapshotId));

	const loadMeta = async (sessionId: string, snapshotId: string): Promise<ReviewSnapshotMeta | undefined> => {
		let raw: string;
		try {
			raw = await readFile(join(snapshotDirectory(sessionId, snapshotId), META_FILE_NAME), "utf8");
		} catch {
			return undefined;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw) as unknown;
		} catch {
			return undefined;
		}
		const meta = parseReviewSnapshotMeta(parsed);
		if (meta === undefined) return undefined;
		if (meta.sessionId !== sessionId || meta.snapshotId !== snapshotId) return undefined;
		return meta;
	};

	const markRolledBack = async (meta: ReviewSnapshotMeta): Promise<void> => {
		const directory = snapshotDirectory(meta.sessionId, meta.snapshotId);
		try {
			await writeFileAtomic(join(directory, META_FILE_NAME), JSON.stringify({ ...meta, state: "rolledBack" }));
		} catch {
			// 状态落盘失败不影响已完成的还原：下次回滚会因当前 hash != afterHash 判冲突，语义安全。
		}
	};

	return {
		async prepare(input) {
			const directory = snapshotDirectory(input.sessionId, input.snapshotId);
			await mkdir(directory, { recursive: true });
			const beforeCopied = input.before !== undefined && input.before.byteLength <= REVIEW_SNAPSHOT_MAX_BYTES;
			let beforeHash: string | undefined;
			if (beforeCopied && input.before !== undefined) {
				beforeHash = sha256Hex(input.before);
				await writeFile(join(directory, BEFORE_FILE_NAME), input.before);
			}
			const prepared: NodePreparedReviewSnapshot = {
				sessionId: input.sessionId,
				snapshotId: input.snapshotId,
				directory,
				input,
				beforeHash,
				beforeCopied,
			};
			return prepared;
		},

		async finalize(prepared, input: FinalizeReviewSnapshotInput) {
			const owned = prepared as NodePreparedReviewSnapshot;
			const meta: ReviewSnapshotMeta = {
				schemaVersion: 1,
				sessionId: owned.sessionId,
				snapshotId: owned.snapshotId,
				path: owned.input.path,
				absolutePath: owned.input.absolutePath,
				operation: owned.input.operation,
				status: input.status,
				state: "active",
				addedLines: input.addedLines,
				removedLines: input.removedLines,
				beforeExists: owned.input.before !== undefined,
				...(owned.beforeHash !== undefined ? { beforeHash: owned.beforeHash } : {}),
				afterExists: input.after !== undefined,
				...(input.after !== undefined ? { afterHash: sha256Hex(input.after) } : {}),
				// 旧文件存在但快照超界未落盘时不可回滚；新建文件回滚=删除，始终可逆。
				reversible: owned.beforeCopied || owned.input.before === undefined,
				...(input.binary === true ? { binary: true } : {}),
				...(input.truncated === true ? { truncated: true } : {}),
				createdAt: Date.now(),
			};
			await writeFileAtomic(join(owned.directory, META_FILE_NAME), JSON.stringify(meta));
			return meta;
		},

		async discard(prepared) {
			const owned = prepared as NodePreparedReviewSnapshot;
			await rm(owned.directory, { recursive: true, force: true });
			// 最后一个快照被丢弃时连会话目录一起收掉；非空时 rmdir 失败属正常。
			await rmdir(sessionDirectory(owned.sessionId)).catch(() => undefined);
		},

		async load(sessionId, snapshotId) {
			const meta = await loadMeta(sessionId, snapshotId);
			if (meta === undefined) return undefined;
			const snapshot: ReviewSnapshot = { meta };
			if (meta.beforeExists) {
				try {
					const before = await readFile(join(snapshotDirectory(sessionId, snapshotId), BEFORE_FILE_NAME));
					return { ...snapshot, before };
				} catch {
					return { ...snapshot, before: undefined };
				}
			}
			return snapshot;
		},

		async rollback(sessionId, snapshotId) {
			const meta = await loadMeta(sessionId, snapshotId);
			if (meta === undefined) return { kind: "unavailable" };
			if (meta.state === "rolledBack") return { kind: "already-rolled-back", path: meta.path };
			if (!meta.reversible || !isAbsolute(meta.absolutePath)) {
				return { kind: "unavailable" };
			}

			let current: { readonly exists: boolean; readonly hash?: string };
			try {
				current = { exists: true, hash: sha256Hex(await readFile(meta.absolutePath)) };
			} catch (error) {
				if (nodeErrorCode(error) === "ENOENT") {
					current = { exists: false };
				} else {
					// 读不出当前态就无法验证守卫，按不可回滚处理而不是猜。
					return { kind: "unavailable" };
				}
			}
			if (decideReviewRollback(meta, current) === "conflict") {
				return { kind: "conflict", path: meta.path };
			}

			if (meta.beforeExists) {
				let before: Buffer;
				try {
					before = await readFile(join(snapshotDirectory(sessionId, snapshotId), BEFORE_FILE_NAME));
				} catch {
					return { kind: "unavailable" };
				}
				// 还原前验证快照字节完整性：损坏的快照宁可不可用也不写出错误内容。
				if (meta.beforeHash === undefined || sha256Hex(before) !== meta.beforeHash) {
					return { kind: "unavailable" };
				}
				try {
					await mkdir(dirname(meta.absolutePath), { recursive: true });
					await writeFileAtomic(meta.absolutePath, before);
				} catch {
					return { kind: "unavailable" };
				}
			} else {
				try {
					await rm(meta.absolutePath, { force: true });
				} catch {
					return { kind: "unavailable" };
				}
			}
			await markRolledBack(meta);
			return { kind: "restored", path: meta.path };
		},

		async deleteSessionArtifacts(sessionId) {
			await rm(sessionDirectory(sessionId), { recursive: true, force: true });
		},
	};
}
