// Copyright The Open Forge contributors.
import type { ChatTimelineItem } from "@shared/store/atoms";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findDuplicateConversationKeys, reportDuplicateConversationKeys } from "./conversation-key-diagnostics";

function agentMessage(fields: { id: string; entryId?: string; renderKey?: string }): ChatTimelineItem {
	return { kind: "agent", role: "assistant", ...fields } as unknown as ChatTimelineItem;
}

function userMessage(fields: { id: string; entryId?: string; renderKey?: string }): ChatTimelineItem {
	return { kind: "user", role: "user", ...fields } as unknown as ChatTimelineItem;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("findDuplicateConversationKeys", () => {
	it("键唯一时不报重复", () => {
		const items = [userMessage({ id: "u1", entryId: "e-1" }), agentMessage({ id: "a1", entryId: "e-2" })];
		expect(findDuplicateConversationKeys(items)).toEqual([]);
	});

	it("同 entryId 的两项判为重复，并给出身份与下标", () => {
		const items = [
			userMessage({ id: "u1", entryId: "event-1215" }),
			agentMessage({ id: "a1", entryId: "e-2" }),
			agentMessage({ id: "a2", entryId: "event-1215" }),
		];

		expect(findDuplicateConversationKeys(items)).toEqual([
			{
				key: "event-1215",
				count: 2,
				items: [
					{ index: 0, kind: "user", id: "u1", entryId: "event-1215", role: "user" },
					{ index: 2, kind: "agent", id: "a2", entryId: "event-1215", role: "assistant" },
				],
			},
		]);
	});

	it("同一键出现三项时 count 为 3", () => {
		const items = [
			agentMessage({ id: "a1", entryId: "event-1229" }),
			agentMessage({ id: "a2", entryId: "event-1229" }),
			agentMessage({ id: "a3", entryId: "event-1229" }),
		];
		const duplicates = findDuplicateConversationKeys(items);
		expect(duplicates).toHaveLength(1);
		expect(duplicates[0]?.count).toBe(3);
		expect(duplicates[0]?.items.map((item) => item.index)).toEqual([0, 1, 2]);
	});

	it("多组重复同时报出，按首次出现顺序", () => {
		const items = [
			agentMessage({ id: "a1", entryId: "event-1215" }),
			agentMessage({ id: "b1", entryId: "event-1229" }),
			agentMessage({ id: "a2", entryId: "event-1215" }),
			agentMessage({ id: "b2", entryId: "event-1229" }),
		];
		expect(findDuplicateConversationKeys(items).map((group) => group.key)).toEqual(["event-1215", "event-1229"]);
	});

	it("renderKey 优先于 entryId：renderKey 相同即判重复", () => {
		const items = [
			agentMessage({ id: "a1", entryId: "e-1", renderKey: "rk-shared" }),
			agentMessage({ id: "a2", entryId: "e-2", renderKey: "rk-shared" }),
		];
		expect(findDuplicateConversationKeys(items)).toEqual([
			{
				key: "rk-shared",
				count: 2,
				items: [
					{ index: 0, kind: "agent", id: "a1", entryId: "e-1", renderKey: "rk-shared", role: "assistant" },
					{ index: 1, kind: "agent", id: "a2", entryId: "e-2", renderKey: "rk-shared", role: "assistant" },
				],
			},
		]);
	});
});

describe("reportDuplicateConversationKeys", () => {
	it("发现重复时输出一次结构化诊断（含会话、总数与重复组）", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const items = [
			agentMessage({ id: "a1", entryId: "event-1215" }),
			agentMessage({ id: "a2", entryId: "event-1215" }),
		];

		reportDuplicateConversationKeys("/history/session.jsonl", items);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toBe("[conversation-keys] duplicate render keys");
		const payload: unknown = warn.mock.calls[0]?.[1];
		expect(typeof payload).toBe("string");
		expect(JSON.parse(String(payload))).toEqual({
			sessionId: "/history/session.jsonl",
			total: 2,
			duplicates: [
				{
					key: "event-1215",
					count: 2,
					items: [
						{ index: 0, kind: "agent", id: "a1", entryId: "event-1215", role: "assistant" },
						{ index: 1, kind: "agent", id: "a2", entryId: "event-1215", role: "assistant" },
					],
				},
			],
		});
	});

	it("does not serialize message contents into the diagnostic", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const first = Object.assign(agentMessage({ id: "a", entryId: "same" }), { text: "private-body-fixture" });
		reportDuplicateConversationKeys(null, [first, agentMessage({ id: "b", entryId: "same" })]);
		expect(String(warn.mock.calls[0]?.[1])).not.toContain("private-body-fixture");
	});

	it("键唯一时零输出（不产生常态噪音）", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		reportDuplicateConversationKeys(null, [agentMessage({ id: "a1", entryId: "e-1" })]);
		expect(warn).not.toHaveBeenCalled();
	});
});
