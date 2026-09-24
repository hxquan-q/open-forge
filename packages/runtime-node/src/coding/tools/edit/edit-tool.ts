import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { countDiffRows, reviewPreviewBounds } from "../../shared/display-diff.js";
import { localToolPathHost, resolveExistingPath, type ToolPathHost } from "../../shared/path-resolution.js";
import { prepareReviewCapture, type ReviewSnapshotBinding } from "../../shared/review-capture.js";
import { formatStrippedPrefixNotice, prepareAnchorEdits } from "./anchor-edit.js";
import { EDIT_TOOL_DESCRIPTION } from "./description.js";
import type { EditOperations, EditToolDetails, EditToolOptions } from "./edit-contracts.js";
import { generateDiffString, prepareExactTextEdit } from "./edit-text.js";
import { type EditToolInput, EditToolInputSchema } from "./schema.js";

const defaultEditOperations: EditOperations = {
	readFile: (path) => readFile(path),
	writeFile: (path, content) => writeFile(path, content, "utf-8"),
	access: (path) => access(path, constants.R_OK | constants.W_OK),
};

interface EditToolResult {
	readonly content: readonly [{ readonly type: "text"; readonly text: string }];
	readonly details: EditToolDetails;
}

async function executeAnchorMode(
	operations: EditOperations,
	absolutePath: string,
	displayPath: string,
	edits: NonNullable<EditToolInput["edits"]>,
	signal: AbortSignal,
	context: EditExecutionContext,
): Promise<EditToolResult> {
	if (edits.length === 0) throw new Error("edits array is empty — provide at least one anchor edit.");
	try {
		await operations.access(absolutePath);
	} catch {
		throw new Error(`File not found: ${displayPath}`);
	}
	const rawBuffer = await operations.readFile(absolutePath);
	const rawContent = rawBuffer.toString("utf-8");
	if (signal.aborted) throw new Error("Operation aborted");
	const edit = prepareAnchorEdits(rawContent, displayPath, edits);
	if (signal.aborted) throw new Error("Operation aborted");
	// 锚点解析成功后再登记快照：失败的编辑不留下孤儿快照目录。
	const capture = await prepareReviewCapture({
		binding: context.reviewSnapshots,
		cwd: context.cwd,
		absolutePath,
		operation: "edit",
		before: rawBuffer,
		pathHost: context.pathHost,
	});
	try {
		await operations.writeFile(absolutePath, edit.content);
		const review = await capture?.complete({
			status: "modified",
			after: edit.content,
			...countDiffRows(edit.details.diff),
			binary: reviewPreviewBounds(rawContent, edit.content).binary,
			truncated: false,
		});
		return {
			content: [{ type: "text", text: edit.receipt }],
			details: { ...edit.details, ...(review !== undefined ? { review } : {}) },
		};
	} catch (error) {
		await capture?.discard();
		throw error;
	}
}

function executeExactTextMode(
	operations: EditOperations,
	absolutePath: string,
	displayPath: string,
	oldText: string,
	newText: string,
	signal: AbortSignal,
	context: EditExecutionContext,
): Promise<EditToolResult> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}

		let aborted = false;
		const onAbort = (): void => {
			aborted = true;
			reject(new Error("Operation aborted"));
		};
		signal.addEventListener("abort", onAbort, { once: true });

		void (async () => {
			try {
				try {
					await operations.access(absolutePath);
				} catch {
					signal.removeEventListener("abort", onAbort);
					reject(new Error(`File not found: ${displayPath}`));
					return;
				}
				if (aborted) return;
				const rawBuffer = await operations.readFile(absolutePath);
				const rawContent = rawBuffer.toString("utf-8");
				if (aborted) return;
				const edit = prepareExactTextEdit(rawContent, oldText, newText, displayPath);
				if (aborted) return;
				const capture = await prepareReviewCapture({
					binding: context.reviewSnapshots,
					cwd: context.cwd,
					absolutePath,
					operation: "edit",
					before: rawBuffer,
					pathHost: context.pathHost,
				});
				try {
					await operations.writeFile(absolutePath, edit.content);
					if (aborted) {
						await capture?.discard();
						return;
					}
					signal.removeEventListener("abort", onAbort);
					const diff = generateDiffString(edit.baseContent, edit.newContent);
					const review = await capture?.complete({
						status: "modified",
						after: edit.content,
						...countDiffRows(diff.diff),
						binary: reviewPreviewBounds(rawContent, edit.content).binary,
						truncated: false,
					});
					resolve({
						content: [
							{
								type: "text",
								text:
									`Successfully replaced text in ${displayPath}.` +
									formatStrippedPrefixNotice(edit.strippedPrefixCount),
							},
						],
						details: {
							diff: diff.diff,
							firstChangedLine: diff.firstChangedLine,
							...(review !== undefined ? { review } : {}),
						},
					});
				} catch (error) {
					await capture?.discard();
					throw error;
				}
			} catch (error: unknown) {
				signal.removeEventListener("abort", onAbort);
				if (!aborted) reject(error);
			}
		})();
	});
}

interface EditExecutionContext {
	readonly cwd: string;
	readonly pathHost: ToolPathHost;
	readonly reviewSnapshots: ReviewSnapshotBinding | undefined;
}

export function createEditTool(cwd: string, options: EditToolOptions): RuntimeToolDefinition<EditToolInput> {
	const operations = options.operations ?? defaultEditOperations;
	const pathPolicy = options.pathPolicy;
	const context: EditExecutionContext = {
		cwd,
		pathHost: options.pathHost ?? localToolPathHost,
		reviewSnapshots: options.reviewSnapshots,
	};
	return {
		name: "edit",
		label: "edit",
		description: EDIT_TOOL_DESCRIPTION,
		inputSchema: EditToolInputSchema,
		async execute(request) {
			const { path, oldText, newText, edits } = request.input;
			const absolutePath = resolveExistingPath(path, cwd, options.pathHost);
			const rejectionReason = pathPolicy.getRejectionReason(absolutePath);
			if (rejectionReason !== undefined) throw new Error(rejectionReason);
			if (edits !== undefined && (oldText !== undefined || newText !== undefined)) {
				throw new Error("Use either `edits` (anchor mode) or `oldText`/`newText` (exact-text mode), not both.");
			}
			if (edits !== undefined) {
				return executeAnchorMode(operations, absolutePath, path, edits, request.signal, context);
			}
			if (oldText === undefined || newText === undefined) {
				throw new Error(
					"Missing edit payload: provide `edits` (anchor mode, preferred) or both `oldText` and `newText`.",
				);
			}
			return executeExactTextMode(operations, absolutePath, path, oldText, newText, request.signal, context);
		},
	};
}
