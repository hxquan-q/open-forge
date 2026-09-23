// Copyright The Open Forge contributors.
import type {
	ArtifactAvailability,
	ArtifactDescriptor,
	ArtifactKind,
	RuntimeSessionTaskState,
	RuntimeTaskSnapshot,
} from "@vetta/runtime-core/task";

/** Task 面板命令的渲染端形状；主进程侧再收窄一次。 */
export type DesktopTaskCommandInput =
	| { readonly type: "create"; readonly title?: string }
	| { readonly type: "cancel"; readonly taskId: string; readonly reason?: string }
	| { readonly type: "pause"; readonly taskId: string }
	| {
			readonly type: "review";
			readonly taskId: string;
			readonly decision: "approved" | "changes_requested" | "rejected";
	  }
	| {
			readonly type: "attach-artifact";
			readonly taskId: string;
			readonly artifact: {
				readonly kind: ArtifactKind;
				readonly title: string;
				readonly uri: string;
				readonly contentType?: string;
			};
	  };

export type DesktopTaskCommandOutcome =
	| { readonly ok: true; readonly state: RuntimeSessionTaskState }
	| { readonly ok: false; readonly code: string; readonly message: string };

export interface DesktopArtifactView {
	readonly descriptor: ArtifactDescriptor;
	readonly availability: ArtifactAvailability;
}

/** 渲染端读取产物内容的结果：与主进程 DesktopArtifactReadResult 形状一致。 */
export type DesktopArtifactReadOutcome =
	| {
			readonly status: "ok";
			readonly content: string;
			readonly truncated: boolean;
			readonly contentType?: string;
			readonly title?: string;
	  }
	| { readonly status: "source-missing"; readonly artifactId: string }
	| { readonly status: "not-found"; readonly artifactId: string };

/** 渲染端导出文档产物的结果：cancelled 表示用户放弃保存对话框。 */
export type DocumentExportOutcome =
	| { readonly status: "exported"; readonly targetUri: string }
	| { readonly status: "cancelled" }
	| { readonly status: "source-missing"; readonly artifactId: string }
	| { readonly status: "not-exportable"; readonly artifactId: string }
	| { readonly status: "not-found"; readonly artifactId: string };

export interface DesktopTaskApi {
	getState: (sessionId: string) => Promise<RuntimeSessionTaskState>;
	getArtifactViews: (sessionId: string) => Promise<readonly DesktopArtifactView[]>;
	runCommand: (sessionId: string, command: DesktopTaskCommandInput) => Promise<DesktopTaskCommandOutcome>;
	readArtifact: (sessionId: string, artifactId: string) => Promise<DesktopArtifactReadOutcome>;
	exportArtifact: (
		sessionId: string,
		artifactId: string,
		suggestedFileName?: string,
	) => Promise<DocumentExportOutcome>;
}

export type { ArtifactKind, RuntimeTaskSnapshot };
