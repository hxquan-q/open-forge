import { mkdir, readFile, writeFile } from "node:fs/promises";
import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { ToolResultReview } from "@vetta/runtime-storage/conversation";
import { nodeErrorCode } from "../../../conversation/node-error-code.js";
import {
	localToolPathHost,
	resolveToCwd,
	resolveWritablePath,
	type ToolPathHost,
} from "../../shared/path-resolution.js";
import {
	computeWriteReviewPreview,
	prepareReviewCapture,
	type ReviewSnapshotBinding,
	type ReviewSnapshotCapture,
} from "../../shared/review-capture.js";
import { WRITE_TOOL_DESCRIPTION } from "./description.js";

export const WriteToolInputSchema = Type.Object({
	description: Type.Optional(
		Type.String({
			description: "Brief user-facing reason for this tool call (max 100 chars).",
			maxLength: 100,
		}),
	),
	path: Type.String({ description: "Path to the file to write (relative or absolute)" }),
	content: Type.String({ description: "Content to write to the file" }),
});

export type WriteToolInput = Static<typeof WriteToolInputSchema>;

export interface WriteToolDetails {
	/** 执行期审查快照元数据；未注入快照库或快照失败时缺省，旧记录兼容。 */
	readonly review?: ToolResultReview;
}

export interface WriteOperations {
	readonly writeFile: (absolutePath: string, content: string) => Promise<void>;
	readonly mkdir: (directory: string) => Promise<void>;
	/** 写入前读取原始字节用于审查快照；缺省为本机文件系统。 */
	readonly readFile?: (absolutePath: string) => Promise<Uint8Array>;
}

export interface WritePathPolicy {
	readonly getRejectionReason: (absolutePath: string) => string | undefined;
}

export interface WriteToolOptions {
	readonly operations?: WriteOperations;
	readonly pathPolicy: WritePathPolicy;
	/** 路径在哪台机器上解析；缺省为本机。远端项目必须换掉，见 {@link ToolPathHost}。 */
	readonly pathHost?: ToolPathHost;
	/** 会话级审查快照；缺省时工具不产出 `details.review`，行为与旧版一致。 */
	readonly reviewSnapshots?: ReviewSnapshotBinding;
}

const defaultWriteOperations: WriteOperations = {
	writeFile: (path, content) => writeFile(path, content, "utf-8"),
	mkdir: (directory) => mkdir(directory, { recursive: true }).then(() => {}),
	readFile: (path) => readFile(path),
};

export function createWriteTool(cwd: string, options: WriteToolOptions): RuntimeToolDefinition<WriteToolInput> {
	const operations = options.operations ?? defaultWriteOperations;
	const pathPolicy = options.pathPolicy;
	const pathHost = options.pathHost ?? localToolPathHost;
	return {
		name: "write",
		label: "write",
		description: WRITE_TOOL_DESCRIPTION,
		inputSchema: WriteToolInputSchema,
		async execute(request) {
			const { path, content } = request.input;
			const requestedPath = resolveToCwd(path, cwd, pathHost);
			const absolutePath = resolveWritablePath(path, cwd, pathHost);
			const rejectionReason = pathPolicy.getRejectionReason(absolutePath);
			if (rejectionReason !== undefined) {
				return {
					content: [
						{
							type: "text",
							text: rejectionReason,
						},
					],
					details: undefined,
				};
			}

			const directory = pathHost.path.dirname(absolutePath);
			const pathRetargeted = requestedPath !== absolutePath;
			const notes = pathRetargeted ? [`[Auto-corrected output path: "${path}" -> "${absolutePath}"]`] : [];
			return executeWrite({
				operations,
				directory,
				absolutePath,
				content,
				notes,
				signal: request.signal,
				cwd,
				pathHost,
				reviewSnapshots: options.reviewSnapshots,
			});
		},
	};
}

interface ExecuteWriteOptions {
	readonly operations: WriteOperations;
	readonly directory: string;
	readonly absolutePath: string;
	readonly content: string;
	readonly notes: readonly string[];
	readonly signal: AbortSignal;
	readonly cwd: string;
	readonly pathHost: ToolPathHost;
	readonly reviewSnapshots: ReviewSnapshotBinding | undefined;
}

/** 区分「文件不存在」与「读不出」：只有 ENOENT 才能断言 before 为空，其余情况跳过快照而不是误报新建。 */
type BeforeBytes =
	| { readonly kind: "absent" }
	| { readonly kind: "bytes"; readonly bytes: Uint8Array }
	| { readonly kind: "unreadable" };

async function readBeforeBytes(
	readFileOp: (absolutePath: string) => Promise<Uint8Array>,
	absolutePath: string,
): Promise<BeforeBytes> {
	try {
		return { kind: "bytes", bytes: await readFileOp(absolutePath) };
	} catch (error) {
		return nodeErrorCode(error) === "ENOENT" ? { kind: "absent" } : { kind: "unreadable" };
	}
}

function executeWrite(options: ExecuteWriteOptions): Promise<{
	readonly content: readonly [{ readonly type: "text"; readonly text: string }];
	readonly details: WriteToolDetails | undefined;
}> {
	return new Promise((resolve, reject) => {
		if (options.signal.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}
		let aborted = false;
		const onAbort = (): void => {
			aborted = true;
			reject(new Error("Operation aborted"));
		};
		options.signal.addEventListener("abort", onAbort, { once: true });

		void (async () => {
			let capture: ReviewSnapshotCapture | undefined;
			try {
				await options.operations.mkdir(options.directory);
				if (aborted) return;
				let before: Uint8Array | undefined;
				if (options.reviewSnapshots !== undefined) {
					// 自定义 operations 不提供 readFile 时禁止回退本机磁盘猜测：
					// 远端/沙箱写入的 before 读不到就跳过快照，绝不伪造「新文件」。
					const read = options.operations.readFile;
					const beforeBytes =
						read === undefined
							? { kind: "unreadable" as const }
							: await readBeforeBytes(read, options.absolutePath);
					if (aborted) return;
					if (beforeBytes.kind !== "unreadable") {
						before = beforeBytes.kind === "bytes" ? beforeBytes.bytes : undefined;
						capture = await prepareReviewCapture({
							binding: options.reviewSnapshots,
							cwd: options.cwd,
							absolutePath: options.absolutePath,
							operation: "write",
							before,
							pathHost: options.pathHost,
						});
					}
				}
				if (aborted) {
					await capture?.discard();
					return;
				}
				await options.operations.writeFile(options.absolutePath, options.content);
				if (aborted) {
					await capture?.discard();
					return;
				}
				options.signal.removeEventListener("abort", onAbort);
				let review: ToolResultReview | undefined;
				if (capture !== undefined) {
					const beforeText = before === undefined ? undefined : new TextDecoder().decode(before);
					const preview = computeWriteReviewPreview(beforeText, options.content);
					review = await capture.complete({
						status: before === undefined ? "added" : "modified",
						after: options.content,
						addedLines: preview.addedLines,
						removedLines: preview.removedLines,
						binary: preview.binary,
						truncated: preview.truncated,
					});
				}
				resolve({
					content: [
						{
							type: "text",
							text:
								`${options.notes.join("\n")}${options.notes.length > 0 ? "\n" : ""}` +
								`Successfully wrote ${options.content.length} bytes to ${options.absolutePath}`,
						},
					],
					details: review === undefined ? undefined : { review },
				});
			} catch (error: unknown) {
				await capture?.discard();
				options.signal.removeEventListener("abort", onAbort);
				if (!aborted) reject(error);
			}
		})();
	});
}
