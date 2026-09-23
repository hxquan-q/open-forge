// Copyright The Open Forge contributors.
import type { ArtifactDescriptor } from "@vetta/runtime-core/task";

/**
 * 文档处理能力的合同（TASK-0017 定义，TASK-0028 实现端到端入口）。
 *
 * 输入由宿主限定来源与输出路径；产出必须是 `document` Artifact（内容文件是
 * 事实源，descriptor 是可重建投影）；Review 三分支复用 Task Review 状态机，
 * Export 只在 approved 之后可用且写入前重验目标路径授权。
 */

/** 宿主提供的文档处理请求（入口 UI 由 TASK-0028 实现）。 */
export interface DocumentProcessingRequest {
	readonly sourceFileUris: readonly string[];
	readonly goal: string;
	/** 期望产物文件名（不含路径）；宿主负责落到用户选定或项目内的输出目录。 */
	readonly outputFileName?: string;
	readonly language?: string;
}

export const DOCUMENT_ARTIFACT_KIND = "document" as const;

/** 文档产物合同：内容为 Markdown/text 等可直接预览的格式。 */
export interface DocumentArtifactContract {
	readonly kind: typeof DOCUMENT_ARTIFACT_KIND;
	readonly artifact: ArtifactDescriptor;
	/** 内容文件相对输出根的可移植引用（不携带本机绝对路径前缀）。 */
	readonly relativeUri: string;
}

/** 文档 Review 语义：approved 才可导出；changes_requested 走返工，不覆盖历史版本。 */
export type DocumentReviewDecision = "approved" | "changes_requested" | "rejected";

/** Export 结果：失败时保留已生成版本，绝不静默覆盖目标文件。 */
export type DocumentExportResult =
	| { readonly status: "exported"; readonly targetUri: string }
	| { readonly status: "target-exists"; readonly targetUri: string }
	| { readonly status: "unauthorized-target"; readonly targetUri: string }
	| { readonly status: "source-missing"; readonly artifactId: string };

export function isDocumentArtifact(artifact: ArtifactDescriptor): boolean {
	return artifact.kind === DOCUMENT_ARTIFACT_KIND;
}
