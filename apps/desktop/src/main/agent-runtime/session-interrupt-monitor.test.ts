// Copyright The Open Forge contributors.

import type { Message } from "@vetta/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearAllSessionInterruptDrafts,
	setSessionInterruptDraftNonEmpty,
} from "./session-interrupt-draft-registry.js";
import { SessionInterruptMonitor } from "./session-interrupt-monitor.js";

function assistantError(message: string): Message {
	return {
		role: "assistant",
		content: [{ type: "text", text: "" }],
		api: "openai-completions",
		provider: "openai",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "error",
		errorMessage: message,
		timestamp: Date.now() - 10_000,
	};
}

describe("SessionInterruptMonitor", () => {
	afterEach(() => {
		clearAllSessionInterruptDrafts();
	});

	it("auto 模式在网络中断且无否决时调用 runtime.retry", async () => {
		const retry = vi.fn(async () => {});
		const onDecision = vi.fn();
		const monitor = new SessionInterruptMonitor({
			getRuntime: () =>
				({
					getState: () => ({ isStreaming: false, cwd: "/tmp" }),
					getMessages: () => [assistantError("fetch failed: ECONNRESET")],
					getSessionPath: () => "/sessions/a.jsonl",
					retry,
				}) as never,
			listCandidateSessionIds: () => ["s1"],
			hasPendingAction: () => false,
			wasManualStopped: () => false,
			readMode: () => "auto",
			readMaxAttempts: () => 1,
			onDecision,
			nowMs: () => Date.now(),
		});
		// 直接跑一次 reconcile：通过 start 的 timer 太慢，改用私有扫描入口
		await monitor.reconcileNow();
		expect(retry).toHaveBeenCalledOnce();
		expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({ action: "auto-retried", sessionId: "s1" }));
		monitor.stop();
	});

	it("输入框有草稿时零自动续接", async () => {
		setSessionInterruptDraftNonEmpty("s1", true);
		const retry = vi.fn(async () => {});
		const onDecision = vi.fn();
		const monitor = new SessionInterruptMonitor({
			getRuntime: () =>
				({
					getState: () => ({ isStreaming: false }),
					getMessages: () => [assistantError("fetch failed: ECONNRESET")],
					getSessionPath: () => "/sessions/a.jsonl",
					retry,
				}) as never,
			listCandidateSessionIds: () => ["s1"],
			hasPendingAction: () => false,
			wasManualStopped: () => false,
			readMode: () => "auto",
			readMaxAttempts: () => 1,
			onDecision,
			nowMs: () => Date.now(),
		});
		await monitor.reconcileNow();
		expect(retry).not.toHaveBeenCalled();
		monitor.stop();
	});

	it("notify 模式只回调不 retry", async () => {
		const retry = vi.fn(async () => {});
		const onDecision = vi.fn();
		const monitor = new SessionInterruptMonitor({
			getRuntime: () =>
				({
					getState: () => ({ isStreaming: false }),
					getMessages: () => [assistantError("Model returned 500")],
					getSessionPath: () => "/sessions/a.jsonl",
					retry,
				}) as never,
			listCandidateSessionIds: () => ["s1"],
			hasPendingAction: () => false,
			wasManualStopped: () => false,
			readMode: () => "notify",
			readMaxAttempts: () => 1,
			onDecision,
			nowMs: () => Date.now(),
		});
		await monitor.reconcileNow();
		expect(retry).not.toHaveBeenCalled();
		expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({ action: "notify" }));
		monitor.stop();
	});
});
