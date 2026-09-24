// Modified by The Open Forge contributors.
import { randomUUID } from "node:crypto";
import type {
	ReviewChangeOperation,
	ReviewChangeStatus,
	ReviewSnapshotMeta,
	ReviewSnapshotStore,
	ToolResultReview,
} from "@vetta/runtime-storage/conversation";
import * as Diff from "diff";
import { countDiffRows, generateDiffString, reviewPreviewBounds } from "./display-diff.js";
import type { ToolPathHost } from "./path-resolution.js";

/**
 * Write/Edit 的「执行期审查快照」公共流程：
 *
 * - `prepareReviewCapture` 在文件被修改前把 before 字节交给快照库；
 *   快照不可用（未注入 store / prepare 失败）时返回 undefined，
 *   工具按「无快照则不暴露回滚」的一致语义照常写入。
 * - `complete` 在写入成功后落 meta 并返回 `details.review` 载荷；
 *   finalize 失败时清理快照目录并返回 undefined（写入结果不受影响）。
 * - `discard` 在准备失败、写入失败或中止时清理快照目录，不留残渣。
 */

export interface ReviewSnapshotCapture {
	readonly snapshotId: string;
	complete(input: ReviewCaptureCompletion): Promise<ToolResultReview | undefined>;
	discard(): Promise<void>;
}

export interface ReviewCaptureCompletion {
	readonly status: ReviewChangeStatus;
	/** 实际写入文件的 UTF-8 文本；hash 守卫以它的字节为准。 */
	readonly after: string;
	readonly addedLines: number;
	readonly removedLines: number;
	readonly binary: boolean;
	readonly truncated: boolean;
}

/** 注入 Write/Edit 的会话级快照绑定：store 与会话身份必须成对出现。 */
export interface ReviewSnapshotBinding {
	readonly store: ReviewSnapshotStore;
	readonly sessionId: string;
}

export interface PrepareReviewCaptureOptions {
	readonly binding: ReviewSnapshotBinding | undefined;
	readonly cwd: string;
	readonly absolutePath: string;
	readonly operation: ReviewChangeOperation;
	/** 工具执行前读到的原始字节；undefined 表示文件此前不存在。 */
	readonly before: Uint8Array | undefined;
	readonly pathHost: ToolPathHost;
}

export async function prepareReviewCapture(
	options: PrepareReviewCaptureOptions,
): Promise<ReviewSnapshotCapture | undefined> {
	const binding = options.binding;
	if (binding === undefined) return undefined;
	const store = binding.store;
	try {
		const prepared = await store.prepare({
			sessionId: binding.sessionId,
			snapshotId: randomUUID(),
			path: reviewDisplayPath(options.cwd, options.absolutePath, options.pathHost),
			absolutePath: options.absolutePath,
			operation: options.operation,
			...(options.before !== undefined ? { before: options.before } : {}),
		});
		return {
			snapshotId: prepared.snapshotId,
			complete: async (input) => {
				try {
					const meta = await store.finalize(prepared, {
						status: input.status,
						after: Buffer.from(input.after, "utf8"),
						addedLines: input.addedLines,
						removedLines: input.removedLines,
						...(input.binary ? { binary: true } : {}),
						...(input.truncated ? { truncated: true } : {}),
					});
					return toolResultReviewFromMeta(meta);
				} catch {
					await store.discard(prepared).catch(() => undefined);
					return undefined;
				}
			},
			discard: async () => {
				await store.discard(prepared).catch(() => undefined);
			},
		};
	} catch {
		return undefined;
	}
}

export function toolResultReviewFromMeta(meta: ReviewSnapshotMeta): ToolResultReview {
	return {
		snapshotId: meta.snapshotId,
		relativePath: meta.path,
		operation: meta.operation,
		status: meta.status,
		state: meta.state,
		addedLines: meta.addedLines,
		removedLines: meta.removedLines,
		rollbackable: meta.reversible,
		...(meta.binary === true ? { binary: true } : {}),
		...(meta.truncated === true ? { truncated: true } : {}),
	};
}

export interface WriteReviewPreview {
	readonly diff?: string;
	readonly firstChangedLine?: number;
	readonly addedLines: number;
	readonly removedLines: number;
	readonly binary: boolean;
	readonly truncated: boolean;
}

/**
 * Write 的审查预览：覆盖已有文件时给出展示 diff；新建文件不重复生成 diff
 *（内容本身就是记录），只按增行统计。
 */
export function computeWriteReviewPreview(beforeText: string | undefined, afterText: string): WriteReviewPreview {
	const bounds = reviewPreviewBounds(beforeText ?? "", afterText);
	if (bounds.binary || bounds.truncated) {
		return { addedLines: 0, removedLines: 0, binary: bounds.binary, truncated: bounds.truncated };
	}
	if (beforeText === undefined) {
		let addedLines = 0;
		for (const part of Diff.diffLines("", afterText)) {
			if (part.added === true) addedLines += part.count ?? 0;
		}
		return { addedLines, removedLines: 0, binary: false, truncated: false };
	}
	const { diff, firstChangedLine } = generateDiffString(beforeText, afterText);
	const { addedLines, removedLines } = countDiffRows(diff);
	return {
		diff,
		...(firstChangedLine !== undefined ? { firstChangedLine } : {}),
		addedLines,
		removedLines,
		binary: false,
		truncated: false,
	};
}

/** 越出 cwd 的目标用绝对路径展示，工作区内归一化为 `/` 分隔的相对路径。 */
function reviewDisplayPath(cwd: string, absolutePath: string, host: ToolPathHost): string {
	const relative = host.path.relative(cwd, absolutePath);
	if (
		relative === "" ||
		relative === ".." ||
		relative.startsWith(`..${host.path.sep}`) ||
		host.path.isAbsolute(relative)
	) {
		return absolutePath;
	}
	return relative.split(/[\\/]+/).join("/");
}
