// Modified by The Open Forge contributors.

/**
 * Memory worker 协议（TASK-0371）。主侧客户端与 worker 引导源共用此形状；
 * 请求按 id 配对响应。错误以 { code, message } 传回，主侧还原为
 * MemoryContractError（稳定错误码跨线程保持）。
 */

export interface MemoryWorkerOpenRequest {
	readonly type: "open";
	readonly databasePath: string;
	/** better-sqlite3 包入口的绝对路径（主侧 require.resolve 后传入；eval worker 无法可靠裸解析）。 */
	readonly driverModulePath: string;
	/** 可选：显式 .nativeBinding 二进制路径（打包/隔离场景）。 */
	readonly nativeBinding?: string;
	readonly allowedScopes: readonly {
		readonly name: string;
		readonly principalId: string;
		readonly projectId?: string;
		readonly workspaceViewId?: string;
		readonly visibility?: string;
	}[];
	readonly schemaVersionCeiling?: number;
}

export interface MemoryWorkerWriteRequest {
	readonly type: "write";
	readonly command: unknown;
	readonly scope: {
		readonly name: string;
		readonly principalId: string;
		readonly projectId?: string;
		readonly workspaceViewId?: string;
		readonly visibility?: string;
	};
	/** BUG-0147/R3：调用方自身授权集合；共享 worker 的各 lease 分别携带，缺省回落 open 时集合。 */
	readonly authScopes?: MemoryWorkerOpenRequest["allowedScopes"];
}

export interface MemoryWorkerReadRequest {
	readonly type: "read";
	readonly scope: MemoryWorkerWriteRequest["scope"];
	readonly selector: { readonly asOf: string; readonly knownAt?: string };
	readonly authScopes?: MemoryWorkerOpenRequest["allowedScopes"];
}

export interface MemoryWorkerListRequest {
	readonly type: "listRevisions" | "listSources";
	readonly memoryId: string;
	readonly scope: MemoryWorkerWriteRequest["scope"];
	readonly authScopes?: MemoryWorkerOpenRequest["allowedScopes"];
}

export interface MemoryWorkerCloseRequest {
	readonly type: "close";
}

export interface MemoryWorkerBackupRequest {
	readonly type: "backup";
	readonly destinationPath: string;
}

export interface MemoryWorkerProbeRequest {
	readonly type: "ping";
}

export type MemoryWorkerRequest =
	| MemoryWorkerOpenRequest
	| MemoryWorkerWriteRequest
	| MemoryWorkerReadRequest
	| MemoryWorkerListRequest
	| MemoryWorkerCloseRequest
	| MemoryWorkerBackupRequest
	| MemoryWorkerProbeRequest;

export interface MemoryWorkerSuccess {
	readonly ok: true;
	readonly id: number;
	readonly result: unknown;
}

export interface MemoryWorkerFailure {
	readonly ok: false;
	readonly id: number;
	readonly error: { readonly code: string; readonly message: string };
}

export type MemoryWorkerResponse = MemoryWorkerSuccess | MemoryWorkerFailure;

/** 迁移失败/不兼容 schema 的稳定错误码（存储层专用，随 worker 往返）。 */
export const MEMORY_STORE_ERROR_CODES = {
	SCHEMA_INCOMPATIBLE: "SCHEMA_INCOMPATIBLE",
	STORE_CLOSED: "STORE_CLOSED",
} as const;
