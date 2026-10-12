// Modified by The Open Forge contributors.

/** SSH 远端项目与本机之间的流式文件传输：plan/commit 握手、队列条目与事件负载。 */

export type SshTransferDirection = "upload" | "download";
export type SshTransferStatus = "queued" | "transferring" | "completed" | "failed" | "canceled";
/** 目标已存在时的处置：整体替换或整文件跳过；由 UI 在 commit 前决定，服务不自行裁断。 */
export type SshTransferConflictPolicy = "replace" | "skip";

/** 文件夹展开后的叶子条目。`conflict` 表示探测时目标已存在。 */
export interface SshTransferEntryPlan {
	readonly localPath: string;
	readonly remotePath: string;
	readonly name: string;
	readonly sizeBytes: number;
	/** 目录传输时相对选中根的 POSIX 相对路径；单文件为 undefined。 */
	readonly relativePath?: string;
	readonly conflict: boolean;
}

/** 一次顶层选择（一个文件或一个文件夹）展开成的传输组，入队后对应一条队列条目。 */
export interface SshTransferGroupPlan {
	readonly name: string;
	readonly remotePath: string;
	readonly localPath: string;
	readonly totalBytes: number;
	readonly fileCount: number;
	readonly entries: readonly SshTransferEntryPlan[];
}

/** plan 阶段主动排除的源；reason 是稳定枚举，由 UI 层翻译。 */
export interface SshTransferPlanSkipped {
	readonly name: string;
	readonly reason: "source-missing" | "source-not-regular-file" | "symlink-skipped" | "entry-limit-reached";
}

export interface SshTransferPlan {
	readonly id: string;
	readonly direction: SshTransferDirection;
	readonly hostId: string;
	readonly hostLabel: string;
	readonly groups: readonly SshTransferGroupPlan[];
	readonly skipped: readonly SshTransferPlanSkipped[];
}

export type SshTransferPlanInput =
	| { readonly direction: "upload"; readonly remoteDirUri: string; readonly localPaths: readonly string[] }
	| { readonly direction: "download"; readonly remoteUris: readonly string[]; readonly localDir: string };

/** 队列里的一个传输单元：一次顶层选择对应一条，进度按组内字节与文件数汇总。 */
export interface SshTransferItem {
	readonly id: string;
	readonly direction: SshTransferDirection;
	readonly hostId: string;
	readonly hostLabel: string;
	readonly name: string;
	readonly remotePath: string;
	readonly localPath: string;
	readonly totalBytes: number;
	readonly transferredBytes: number;
	readonly status: SshTransferStatus;
	readonly error?: string;
	readonly createdAt: number;
	readonly completedAt?: number;
	readonly speedBytesPerSec?: number;
	readonly fileCount: number;
	readonly filesDone: number;
}

export interface SshTransferEvent {
	readonly type: "added" | "updated" | "removed";
	readonly item?: SshTransferItem;
	readonly id?: string;
}
