// Copyright The Open Forge contributors.
import type { TeamSessionDocument } from "@vetta/agent-team";

export interface TeamSessionUpdatePublisherOptions {
	/** flush 时读取内存中的最新会话状态；已被删除/逐出时返回 undefined。 */
	readonly getSession: (sessionId: string) => TeamSessionDocument | undefined;
	/** flush 时是否仍有订阅者；无订阅者时跳过快照构建与发布。 */
	readonly hasSubscribers: (sessionId: string) => boolean;
	/** 实际发布（构建全量快照并推给订阅者）。 */
	readonly publish: (session: TeamSessionDocument) => void;
	/** 同一会话多次请求的合并窗口（毫秒）；缺省 32。 */
	readonly coalesceMs?: number;
}

interface PendingFlush {
	session: TeamSessionDocument;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * `session-updated` 全量快照发布的合并调度器。
 *
 * 该事件是按 revision 判新的全量刷新通道：渲染端拒收旧帧，中间帧只浪费
 * 序列化与重渲染。同一会话在窗口内的多次状态变更合并为一次末帧发布；
 * flush 时无订阅者则连快照构建一起跳过（迟来的订阅者由 subscribe 的
 * 一次性初始 session-snapshot 补齐）。
 */
export class TeamSessionUpdatePublisher {
	private readonly pending = new Map<string, PendingFlush>();

	constructor(private readonly options: TeamSessionUpdatePublisherOptions) {}

	request(session: TeamSessionDocument): void {
		const existing = this.pending.get(session.id);
		if (existing) {
			// 只保留最新状态，等待同一窗口到期取末帧。
			existing.session = session;
			return;
		}
		const timer = setTimeout(() => this.flush(session.id), this.options.coalesceMs ?? 32);
		this.pending.set(session.id, { session, timer });
	}

	flush(sessionId: string): void {
		const entry = this.pending.get(sessionId);
		if (!entry) return;
		// 先移除挂起项再发布：发布抛错不得阻断后续调度。
		this.pending.delete(sessionId);
		if (!this.options.hasSubscribers(sessionId)) return;
		const session = this.options.getSession(sessionId);
		// 会话已被删除或逐出：不发布陈旧快照。
		if (!session) return;
		this.options.publish(session);
	}

	/** 会话删除/逐出时取消挂起中的发布。 */
	drop(sessionId: string): void {
		const entry = this.pending.get(sessionId);
		if (!entry) return;
		clearTimeout(entry.timer);
		this.pending.delete(sessionId);
	}
}
