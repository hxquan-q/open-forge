// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import type { WeKnoraChatMessage } from "./atoms";
import {
	draftBufferKey,
	findRequestIdForSession,
	isDraftBufferKey,
	migrateDraftBuffer,
	omitRoute,
	releaseBuffer,
	routeStreamEvent,
	sessionIdsWithLiveStream,
	type WeKnoraSessionBuffers,
	type WeKnoraStreamRoutes,
} from "./weKnoraStreamStore";

/** 归属表已注册、缓冲里有占位 assistant 的起步状态（对应引擎在 send 时的种子写法）。 */
function seeded(
	requestId: string,
	sessionId: string | null,
	key: string,
): {
	routes: WeKnoraStreamRoutes;
	buffers: WeKnoraSessionBuffers;
} {
	return {
		routes: { [requestId]: sessionId },
		buffers: { [key]: [{ id: "a1", role: "assistant", text: "", thinking: "", status: "streaming" }] },
	};
}

function streamingAssistant(text = ""): WeKnoraChatMessage {
	return { id: "a1", role: "assistant", text, thinking: "", status: "streaming" };
}

describe("routeStreamEvent · 路由命中", () => {
	it("delta 追加到归属会话的缓冲", () => {
		const { routes, buffers } = seeded("r1", "s1", "s1");
		const result = routeStreamEvent(routes, buffers, { type: "answer.delta", requestId: "r1", text: "答" });
		expect(result.matched).toBe(true);
		expect(result.bufferKey).toBe("s1");
		expect(result.buffers.s1?.[0]?.text).toBe("答");
	});

	it("turn.started 无效果：缓冲原引用返回，不产生新对象", () => {
		const { routes, buffers } = seeded("r1", "s1", "s1");
		const result = routeStreamEvent(routes, buffers, { type: "turn.started", requestId: "r1", sessionId: "s1" });
		expect(result.buffers).toBe(buffers);
		expect(result.buffers.s1?.[0]?.text).toBe("");
	});

	it("路由命中但缓冲为空：不崩溃、不造出幻影条目（applyStreamEvent 对无占位的缓冲本就无操作）", () => {
		const routes: WeKnoraStreamRoutes = { r1: "s1" };
		const buffers: WeKnoraSessionBuffers = {};
		const result = routeStreamEvent(routes, buffers, { type: "answer.delta", requestId: "r1", text: "答" });
		expect(result.matched).toBe(true);
		expect(result.buffers).toBe(buffers);
		expect("s1" in result.buffers).toBe(false);
	});
});

describe("routeStreamEvent · 未知 requestId 丢弃（AC-15 防串台）", () => {
	it("未注册的 requestId：routes/buffers 原引用返回，不落地", () => {
		const { routes, buffers } = seeded("r1", "s1", "s1");
		const result = routeStreamEvent(routes, buffers, { type: "answer.delta", requestId: "other", text: "串台" });
		expect(result.matched).toBe(false);
		expect(result.bufferKey).toBeNull();
		expect(result.routes).toBe(routes);
		expect(result.buffers).toBe(buffers);
	});

	it("已注销（终态后）的 requestId 再来事件：同样丢弃，重复终态天然幂等", () => {
		const { routes, buffers } = seeded("r1", "s1", "s1");
		const done = routeStreamEvent(routes, buffers, { type: "turn.completed", requestId: "r1" });
		const late = routeStreamEvent(done.routes, done.buffers, { type: "answer.delta", requestId: "r1", text: "迟到" });
		expect(late.matched).toBe(false);
		expect(late.routes).toBe(done.routes);
	});
});

describe("routeStreamEvent · 终态注销", () => {
	it("turn.completed：消息标 complete，requestId 从归属表注销", () => {
		const { routes, buffers } = seeded("r1", "s1", "s1");
		const withText = routeStreamEvent(routes, buffers, { type: "answer.delta", requestId: "r1", text: "全文" });
		const result = routeStreamEvent(withText.routes, withText.buffers, { type: "turn.completed", requestId: "r1" });
		expect(result.terminalRequestId).toBe("r1");
		expect(result.routes).toEqual({});
		expect(result.buffers.s1?.[0]?.status).toBe("complete");
	});

	it("turn.cancelled：标 cancelled 并注销", () => {
		const { routes, buffers } = seeded("r1", "s1", "s1");
		const result = routeStreamEvent(routes, buffers, { type: "turn.cancelled", requestId: "r1" });
		expect(result.terminalRequestId).toBe("r1");
		expect(result.routes).toEqual({});
		expect(result.buffers.s1?.[0]?.status).toBe("cancelled");
	});

	it("turn.failed：带错误码标 failed（stream_interrupted 标 interrupted）并注销", () => {
		const { routes, buffers } = seeded("r1", "s1", "s1");
		const failed = routeStreamEvent(routes, buffers, {
			type: "turn.failed",
			requestId: "r1",
			error: { code: "stream_error", detail: "boom" },
		});
		expect(failed.routes).toEqual({});
		expect(failed.buffers.s1?.[0]?.status).toBe("failed");
		expect(failed.buffers.s1?.[0]?.errorCode).toBe("stream_error");

		const interrupted = routeStreamEvent(routes, buffers, {
			type: "turn.failed",
			requestId: "r1",
			error: { code: "stream_interrupted" },
		});
		expect(interrupted.buffers.s1?.[0]?.status).toBe("interrupted");
	});

	it("终态不释放缓冲：终态内容留在缓冲里交由调用方消费（当前会话进投影 / 后台会话重拉列表）", () => {
		const { routes, buffers } = seeded("r1", "s1", "s1");
		const result = routeStreamEvent(routes, buffers, { type: "turn.completed", requestId: "r1" });
		expect(result.buffers.s1).toBeDefined();
	});
});

describe("routeStreamEvent · 并发双流互不串台（AC-18）", () => {
	it("两路各自追加到各自缓冲；一路终态不影响另一路", () => {
		const routes: WeKnoraStreamRoutes = { r1: "s1", r2: "s2" };
		const buffers: WeKnoraSessionBuffers = {
			s1: [streamingAssistant()],
			s2: [streamingAssistant()],
		};
		const a1 = routeStreamEvent(routes, buffers, { type: "answer.delta", requestId: "r1", text: "甲" });
		const b1 = routeStreamEvent(a1.routes, a1.buffers, { type: "answer.delta", requestId: "r2", text: "乙" });
		expect(b1.buffers.s1?.[0]?.text).toBe("甲");
		expect(b1.buffers.s2?.[0]?.text).toBe("乙");

		const aDone = routeStreamEvent(b1.routes, b1.buffers, { type: "turn.completed", requestId: "r1" });
		expect(aDone.routes).toEqual({ r2: "s2" });
		expect(aDone.buffers.s2?.[0]?.status).toBe("streaming");
	});
});

describe("routeStreamEvent · 草稿期路由（null 归属的完备语义）", () => {
	it("归属为 null 时落到 draft:<requestId> 缓冲键", () => {
		const { routes, buffers } = seeded("r1", null, "draft:r1");
		const result = routeStreamEvent(routes, buffers, { type: "answer.delta", requestId: "r1", text: "草稿" });
		expect(result.bufferKey).toBe(draftBufferKey("r1"));
		expect(result.buffers["draft:r1"]?.[0]?.text).toBe("草稿");
	});
});

describe("缓冲 / 归属表工具", () => {
	it("releaseBuffer 释放指定键；键不存在时原引用返回", () => {
		const buffers: WeKnoraSessionBuffers = { s1: [], s2: [] };
		const released = releaseBuffer(buffers, "s1");
		expect(Object.keys(released)).toEqual(["s2"]);
		expect(releaseBuffer(released, "s1")).toBe(released);
	});

	it("migrateDraftBuffer 把草稿缓冲改挂到真实会话键（假设 7）", () => {
		const buffers: WeKnoraSessionBuffers = { "draft:3": [streamingAssistant("半")] };
		const migrated = migrateDraftBuffer(buffers, draftBufferKey(3), "s1");
		expect(migrated.s1?.[0]?.text).toBe("半");
		expect("draft:3" in migrated).toBe(false);
	});

	it("migrateDraftBuffer 同键 / 源键缺失时原引用返回", () => {
		const buffers: WeKnoraSessionBuffers = { s1: [] };
		expect(migrateDraftBuffer(buffers, "s1", "s1")).toBe(buffers);
		expect(migrateDraftBuffer(buffers, "draft:9", "s1")).toBe(buffers);
	});

	it("omitRoute 注销 requestId；不存在时原引用返回", () => {
		const routes: WeKnoraStreamRoutes = { r1: "s1", r2: "s2" };
		expect(omitRoute(routes, "r1")).toEqual({ r2: "s2" });
		expect(omitRoute(routes, "ghost")).toBe(routes);
	});

	it("findRequestIdForSession 反查归属；无则 null", () => {
		const routes: WeKnoraStreamRoutes = { r1: "s1", r2: null };
		expect(findRequestIdForSession(routes, "s1")).toBe("r1");
		expect(findRequestIdForSession(routes, "s9")).toBeNull();
	});

	it("sessionIdsWithLiveStream 只收会话键，草稿键被排除（AC-19 指示不含未落库草稿）", () => {
		const buffers: WeKnoraSessionBuffers = { s1: [], s2: [], "draft:3": [] };
		expect(sessionIdsWithLiveStream(buffers).sort()).toEqual(["s1", "s2"]);
		expect(isDraftBufferKey(draftBufferKey(3))).toBe(true);
		expect(isDraftBufferKey("s1")).toBe(false);
	});
});
