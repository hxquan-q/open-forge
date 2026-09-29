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

/** 悬挂 turn 的持久化形态：用户消息已落盘，助手消息永远不会出现。 */
function userMessageAt(timestamp: number): Message {
	return { role: "user", content: "继续排查", timestamp } as Message;
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

	it("流式悬挂候选（isStreaming 且零事件活动远超看门狗窗口）不得被巡检沉默跳过", async () => {
		// 「会话异常中断后转圈无输出」复现：turn 永不结算，kernel 停在 running，
		// 会话早已进入候选清单（running-changed 广播时注册），若巡检对 streaming
		// 会话直接早退，它永远走不到 classify——notify/auto 都不会发生，渲染端
		// 两个 streaming 信号源都等不到 agent_end，用户只见转圈。
		// 本用例只锁最小合同：悬挂必须浮出水面（机制由修复方案自定）。
		const retry = vi.fn(async () => {});
		const onDecision = vi.fn();
		const monitor = new SessionInterruptMonitor({
			getRuntime: () =>
				({
					getState: () => ({ isStreaming: true, lastEventAt: Date.now() - 10 * 60_000 }),
					getMessages: () => [userMessageAt(Date.now() - 10 * 60_000)],
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
		expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({ action: "notify", sessionId: "s1" }));
		expect(retry).not.toHaveBeenCalled();
		monitor.stop();
	});

	it("同一悬挂判定跨多轮扫描只提示一次，判定化解后可再次提示", async () => {
		// 悬挂会持续命中（15s 扫描一轮），不去重则系统通知与 toast 每轮重发。
		const retry = vi.fn(async () => {});
		const onDecision = vi.fn();
		let lastEventAt = Date.now() - 10 * 60_000;
		const monitor = new SessionInterruptMonitor({
			getRuntime: () =>
				({
					getState: () => ({ isStreaming: true, lastEventAt }),
					getMessages: () => [userMessageAt(lastEventAt)],
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
		await monitor.reconcileNow();
		await monitor.reconcileNow();
		expect(onDecision).toHaveBeenCalledTimes(1);

		// 活动恢复（判定化解）后再次悬挂：允许下一次提示。
		lastEventAt = Date.now();
		await monitor.reconcileNow();
		lastEventAt = Date.now() - 10 * 60_000;
		await monitor.reconcileNow();
		expect(onDecision).toHaveBeenCalledTimes(2);
		monitor.stop();
	});

	it("流式且事件活动新鲜（健康长回合）零决策，消息时间戳陈旧不得造成误报", async () => {
		// 护栏：长回合进行中助手消息尚未落盘，最后一条持久化消息（用户消息）
		// 可能已经很旧——若巡检退回消息时间戳判定 streaming idle，每个健康长回合
		// 都会被误报成悬挂。必须以逐事件活动证据为准。
		const retry = vi.fn(async () => {});
		const onDecision = vi.fn();
		const monitor = new SessionInterruptMonitor({
			getRuntime: () =>
				({
					getState: () => ({ isStreaming: true, lastEventAt: Date.now() - 1_000 }),
					getMessages: () => [userMessageAt(Date.now() - 20 * 60_000)],
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
		expect(onDecision).not.toHaveBeenCalled();
		expect(retry).not.toHaveBeenCalled();
		monitor.stop();
	});

	it("流式但宿主尚无事件活动证据时宁沉默不误报", async () => {
		const retry = vi.fn(async () => {});
		const onDecision = vi.fn();
		const monitor = new SessionInterruptMonitor({
			getRuntime: () =>
				({
					getState: () => ({ isStreaming: true }),
					getMessages: () => [userMessageAt(Date.now() - 20 * 60_000)],
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
		expect(onDecision).not.toHaveBeenCalled();
		expect(retry).not.toHaveBeenCalled();
		monitor.stop();
	});
});
