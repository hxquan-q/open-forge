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

export interface DesktopTaskApi {
	getState: (sessionId: string) => Promise<RuntimeSessionTaskState>;
	getArtifactViews: (sessionId: string) => Promise<readonly DesktopArtifactView[]>;
	runCommand: (sessionId: string, command: DesktopTaskCommandInput) => Promise<DesktopTaskCommandOutcome>;
}

export type { ArtifactKind, RuntimeTaskSnapshot };
