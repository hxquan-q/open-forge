// Modified by The Open Forge contributors.
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent/config";
import { createNodeReviewSnapshotStore } from "@vetta/runtime-node/host";
import type { ReviewSnapshotStore } from "@vetta/runtime-storage/conversation";

/**
 * Write/Edit 审查快照的 Desktop 侧落点。
 *
 * 快照根目录固定在 `<agentDir>/review-snapshots/`——与 tool-results、mcp-results
 * 同属宿主配置域，不进用户工程目录，外部 `git commit` 抹不掉审查事实。
 *
 * `sessionRoots` 记录「本会话的快照在哪个根下」：会话执行环境创建时注册，
 * 回滚服务按 sessionId 找回同一个根，自定义 agentDir 的会话也不会找错目录。
 */
export function desktopReviewSnapshotRoot(agentDir: string | undefined): string {
	return join(agentDir ?? getAgentDir(), "review-snapshots");
}

const storesByRoot = new Map<string, ReviewSnapshotStore>();
const sessionRoots = new Map<string, string>();

export function getDesktopReviewSnapshotStore(agentDir: string | undefined): ReviewSnapshotStore {
	const root = desktopReviewSnapshotRoot(agentDir);
	const existing = storesByRoot.get(root);
	if (existing !== undefined) return existing;
	const store = createNodeReviewSnapshotStore(root);
	storesByRoot.set(root, store);
	return store;
}

/** 会话执行环境创建时调用：登记 sessionId → 快照根，供回滚按会话定位。 */
export function registerDesktopReviewSnapshotSession(sessionId: string, agentDir: string | undefined): void {
	sessionRoots.set(sessionId, desktopReviewSnapshotRoot(agentDir));
}

/**
 * 回滚服务按 sessionId 解析快照库。未注册的会话（如升级前的旧记录）回退到
 * 默认 agentDir 根：快照按 sessionId 分目录，找错根只会得到 unavailable，
 * 不会误读别的会话数据。
 */
export function resolveDesktopReviewSnapshotStore(sessionId: string): ReviewSnapshotStore {
	const root = sessionRoots.get(sessionId) ?? desktopReviewSnapshotRoot(undefined);
	const existing = storesByRoot.get(root);
	if (existing !== undefined) return existing;
	const store = createNodeReviewSnapshotStore(root);
	storesByRoot.set(root, store);
	return store;
}
