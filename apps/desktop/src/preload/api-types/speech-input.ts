// Modified by The Open Forge contributors.
export type SpeechInputPhase =
	| "unsupported"
	| "not-downloaded"
	| "downloading"
	| "ready"
	| "loading"
	| "listening"
	| "stopping"
	| "error";

export type SpeechInputErrorCode =
	| "unsupported-platform"
	| "model-missing"
	| "model-invalid"
	| "model-download-failed"
	| "recognizer-start-failed"
	| "recognizer-failed";

export interface SpeechInputStatus {
	supported: boolean;
	phase: SpeechInputPhase;
	modelId: string;
	/** phase === "downloading" 时的下载进度（0–1）。 */
	downloadProgress?: number;
	errorCode?: SpeechInputErrorCode;
}

export type SpeechInputEvent =
	| { type: "status"; status: SpeechInputStatus }
	| { type: "partial"; sessionId: string; text: string }
	| { type: "final"; sessionId: string; text: string }
	| { type: "error"; sessionId?: string; code: SpeechInputErrorCode };

export interface DesktopSpeechInputApi {
	getStatus(): Promise<SpeechInputStatus>;
	start(): Promise<{ sessionId: string }>;
	pushAudio(sessionId: string, samples: Float32Array): void;
	stop(sessionId: string): Promise<void>;
	cancel(sessionId: string): Promise<void>;
	onEvent(handler: (event: SpeechInputEvent) => void): () => void;
}
