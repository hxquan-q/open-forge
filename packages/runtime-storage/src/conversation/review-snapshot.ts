// Modified by The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * 每次文件写入执行的「审查快照」协议：快照字节只进工作区外的快照库，
 * toolResult `details.review` 只携带可序列化的元数据，绝不携带文件内容。
 */

/** 单份 before 快照的最大字节数；超限只记元数据，`rollbackable=false`。 */
export const REVIEW_SNAPSHOT_MAX_BYTES = 16 * 1024 * 1024;
/** 生成展示 diff 与增删行统计的输入界值；超限记 `truncated` 并省略预览。 */
export const REVIEW_DIFF_MAX_BYTES = 512 * 1024;

export const ReviewChangeOperationSchema = Type.Union([Type.Literal("write"), Type.Literal("edit")]);
export type ReviewChangeOperation = Static<typeof ReviewChangeOperationSchema>;

export const ReviewChangeStatusSchema = Type.Union([
	Type.Literal("added"),
	Type.Literal("modified"),
	Type.Literal("deleted"),
]);
export type ReviewChangeStatus = Static<typeof ReviewChangeStatusSchema>;

export const ReviewChangeStateSchema = Type.Union([Type.Literal("active"), Type.Literal("rolledBack")]);
export type ReviewChangeState = Static<typeof ReviewChangeStateSchema>;

/** toolResult `details.review` 载荷：审查卡与回滚入口所需的全部序列化事实。 */
export const ToolResultReviewSchema = Type.Object(
	{
		snapshotId: Type.String({ minLength: 1 }),
		/** 展示用相对路径（相对 cwd；越出工作区时为绝对路径）。 */
		relativePath: Type.String({ minLength: 1 }),
		operation: ReviewChangeOperationSchema,
		status: ReviewChangeStatusSchema,
		state: ReviewChangeStateSchema,
		addedLines: Type.Integer({ minimum: 0 }),
		removedLines: Type.Integer({ minimum: 0 }),
		/** before 快照完整且快照处于 active 状态；为 false 时不得展示回滚入口。 */
		rollbackable: Type.Boolean(),
		/** 任一侧含 NUL 字节：未生成文本 diff 与行统计。 */
		binary: Type.Optional(Type.Boolean()),
		/** 任一侧超过 {@link REVIEW_DIFF_MAX_BYTES}：未生成 diff 与行统计。 */
		truncated: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);
export type ToolResultReview = Static<typeof ToolResultReviewSchema>;

/** 宽松入口：非法或缺失时返回 undefined，让旧记录与畸形字段静默降级。 */
export function parseToolResultReview(value: unknown): ToolResultReview | undefined {
	return Value.Check(ToolResultReviewSchema, value) ? value : undefined;
}

/**
 * `meta.json` 的持久化形状。`absolutePath` 与两侧内容 hash 只存在于磁盘
 * 快照库中——它们是回滚的权威依据，不会进入会话记录或模型上下文。
 */
export const ReviewSnapshotMetaSchema = Type.Object(
	{
		schemaVersion: Type.Literal(1),
		sessionId: Type.String({ minLength: 1 }),
		snapshotId: Type.String({ minLength: 1 }),
		path: Type.String({ minLength: 1 }),
		absolutePath: Type.String({ minLength: 1 }),
		operation: ReviewChangeOperationSchema,
		status: ReviewChangeStatusSchema,
		state: ReviewChangeStateSchema,
		addedLines: Type.Integer({ minimum: 0 }),
		removedLines: Type.Integer({ minimum: 0 }),
		beforeExists: Type.Boolean(),
		beforeHash: Type.Optional(Type.String({ minLength: 1 })),
		afterExists: Type.Boolean(),
		afterHash: Type.Optional(Type.String({ minLength: 1 })),
		reversible: Type.Boolean(),
		binary: Type.Optional(Type.Boolean()),
		truncated: Type.Optional(Type.Boolean()),
		createdAt: Type.Number(),
	},
	{ additionalProperties: false },
);
export type ReviewSnapshotMeta = Static<typeof ReviewSnapshotMetaSchema>;

export function parseReviewSnapshotMeta(value: unknown): ReviewSnapshotMeta | undefined {
	return Value.Check(ReviewSnapshotMetaSchema, value) ? value : undefined;
}

export interface PrepareReviewSnapshotInput {
	readonly sessionId: string;
	readonly snapshotId: string;
	/** 展示用相对路径。 */
	readonly path: string;
	/** 回滚写回目标；由生产侧解析得到，消费侧不另行解释。 */
	readonly absolutePath: string;
	readonly operation: ReviewChangeOperation;
	/** 工具执行前的文件原始字节；undefined 表示文件此前不存在。 */
	readonly before?: Uint8Array;
}

/** 不透明句柄：prepare 之后执行成败分别交给 finalize 或 discard。 */
export interface PreparedReviewSnapshot {
	readonly sessionId: string;
	readonly snapshotId: string;
}

export interface FinalizeReviewSnapshotInput {
	readonly status: ReviewChangeStatus;
	/** 实际写入的字节；用于 hash 守卫（本协议的 write/edit 恒存在）。 */
	readonly after?: Uint8Array;
	readonly addedLines: number;
	readonly removedLines: number;
	readonly binary?: boolean;
	readonly truncated?: boolean;
}

export interface ReviewSnapshot {
	readonly meta: ReviewSnapshotMeta;
	/** beforeExists 且快照完整时为原始字节；否则 undefined。 */
	readonly before?: Uint8Array;
}

export interface ReviewRollbackCurrentState {
	readonly exists: boolean;
	readonly hash?: string;
}

/**
 * hash 守卫的唯一判定：当前文件状态必须与快照记录的 after 状态逐位一致
 * 才允许还原；任何外部改动（修改或删除）都判冲突，绝不盲覆盖。
 */
export function decideReviewRollback(
	meta: Pick<ReviewSnapshotMeta, "afterExists" | "afterHash">,
	current: ReviewRollbackCurrentState,
): "restore" | "conflict" {
	if (current.exists !== meta.afterExists) return "conflict";
	if (current.exists && current.hash !== meta.afterHash) return "conflict";
	return "restore";
}

export type ReviewRollbackOutcome =
	| { readonly kind: "restored"; readonly path: string }
	| { readonly kind: "conflict"; readonly path: string }
	| { readonly kind: "already-rolled-back"; readonly path: string }
	| { readonly kind: "unavailable" };

/**
 * 快照库存储 Port。实现按 `<root>/<sessionId>/<snapshotId>/{before,meta.json}`
 * 组织，目录位于宿主配置域而非工作区内，外部 git 操作不会抹掉审查事实。
 */
export interface ReviewSnapshotStore {
	/** 写入前调用：登记目标并落 before 字节（超界时只记元数据，置 reversible=false）。 */
	prepare(input: PrepareReviewSnapshotInput): Promise<PreparedReviewSnapshot>;
	/** 工具写入成功后调用：落 meta.json；之后快照对回滚可见。 */
	finalize(prepared: PreparedReviewSnapshot, input: FinalizeReviewSnapshotInput): Promise<ReviewSnapshotMeta>;
	/** 执行失败或中止时调用：删除整个快照目录，不留残渣。 */
	discard(prepared: PreparedReviewSnapshot): Promise<void>;
	load(sessionId: string, snapshotId: string): Promise<ReviewSnapshot | undefined>;
	rollback(sessionId: string, snapshotId: string): Promise<ReviewRollbackOutcome>;
	deleteSessionArtifacts(sessionId: string): Promise<void>;
}
