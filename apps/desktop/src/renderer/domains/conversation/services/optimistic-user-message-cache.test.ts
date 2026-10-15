// Modified by The Open Forge contributors.
import {
	type ConversationUserMessageViewModel,
	createConversationAgentMessage,
	createConversationUserMessage,
} from "@shared/conversation";
import { beforeEach, describe, expect, it } from "vitest";
import {
	clearOptimisticUserMessages,
	reconcileOptimisticUserMessages,
	reconcileOptimisticUserMessagesTail,
	rememberOptimisticUserMessage,
} from "./optimistic-user-message-cache";

function user(id: string, text: string): ConversationUserMessageViewModel {
	return createConversationUserMessage({ id, text });
}

beforeEach(() => clearOptimisticUserMessages());

describe("optimistic user message reconciliation", () => {
	it("历史尚未写入本轮用户消息时保留乐观气泡", () => {
		const history = [user("persisted-1", "first")];
		const optimistic = user("optimistic-2", "second");
		rememberOptimisticUserMessage("runtime-a", optimistic, history);

		expect(reconcileOptimisticUserMessages("runtime-a", history)).toEqual([...history, optimistic]);
	});

	it("历史在对应序号出现同一用户消息后移除乐观气泡", () => {
		const previous = user("persisted-1", "same text");
		const optimistic = { ...user("optimistic-2", "same text"), attachments: [] };
		rememberOptimisticUserMessage("runtime-a", optimistic, [previous]);

		const canonical = user("persisted-2", "same text");
		expect(reconcileOptimisticUserMessages("runtime-a", [previous, canonical])).toEqual([previous, canonical]);
		expect(reconcileOptimisticUserMessages("runtime-a", [previous, canonical])).toEqual([previous, canonical]);
	});

	it("规范历史确认发送后仍沿用编辑器结构化快照", () => {
		const inputSegments = [
			{ kind: "text" as const, text: "保留 " },
			{ kind: "file" as const, path: "C:/workspace/screenshot.png" },
		];
		const optimistic = createConversationUserMessage({
			id: "optimistic-1",
			text: "保留 @C:/workspace/screenshot.png",
			inputSegments,
			attachments: [{ kind: "file", path: "C:/workspace/screenshot.png" }],
		});
		rememberOptimisticUserMessage("runtime-a", optimistic, []);

		const canonical = createConversationUserMessage({
			id: "persisted-1",
			text: optimistic.text,
			attachments: optimistic.attachments,
		});

		expect(reconcileOptimisticUserMessages("runtime-a", [canonical])).toEqual([{ ...canonical, inputSegments }]);
	});

	it("相同文本只出现在更早序号时不能误确认新消息", () => {
		const previous = user("persisted-1", "repeat");
		const optimistic = user("optimistic-2", "repeat");
		rememberOptimisticUserMessage("runtime-a", optimistic, [previous]);

		expect(reconcileOptimisticUserMessages("runtime-a", [previous])).toEqual([previous, optimistic]);
	});

	it("仅附件消息用 runtime 占位文本落盘后仍能确认", () => {
		const optimistic = { ...user("optimistic-1", ""), attachments: [{ kind: "file" as const, path: "C:\\a.txt" }] };
		rememberOptimisticUserMessage("runtime-a", optimistic, []);

		const canonical = {
			...user("persisted-1", "(see attached content)"),
			attachments: [{ kind: "file" as const, path: "C:\\a.txt" }],
		};
		expect(reconcileOptimisticUserMessages("runtime-a", [canonical])).toEqual([canonical]);
	});

	it("队列消费气泡按 matchTextOnly 吸收：规范消息带附件徽章也不残留重复", () => {
		// 队列镜像只有 displayText；被 turn 消费后规范消息带 attachments，
		// 严格元数据比较会失配，曾导致 agent 回复完成后气泡重复（ADR-0060）。
		const optimistic = user("optimistic-1", "@/cache/img.png badge 字体太大");
		rememberOptimisticUserMessage("runtime-a", optimistic, [], { matchTextOnly: true });

		const canonical = {
			...user("persisted-1", "@/cache/img.png badge 字体太大"),
			attachments: [{ kind: "image" as const, path: "/cache/img.png" }],
		};
		expect(reconcileOptimisticUserMessages("runtime-a", [canonical])).toEqual([canonical]);
		expect(reconcileOptimisticUserMessages("runtime-a", [canonical])).toEqual([canonical]);
	});

	it("matchTextOnly 仍要求文本与序号命中，防止误吸收", () => {
		const optimistic = user("optimistic-1", "second");
		rememberOptimisticUserMessage("runtime-a", optimistic, [user("persisted-1", "first")], {
			matchTextOnly: true,
		});

		const history = [user("persisted-1", "first"), user("persisted-2", "different")];
		// 未确认也不丢：落在其发送时的因果位置（persisted-1 之后），而非列表末尾。
		expect(reconcileOptimisticUserMessages("runtime-a", history)).toEqual([history[0], optimistic, history[1]]);
	});

	it("序号被其他规范消息占用时按发送序号钳制落位，不追加到回复末尾", () => {
		// 排队消息被 turn 消费后镜像气泡记下的序号，可能已被另一条更早落盘的
		// 发送占据；旧实现走尾部兜底，把气泡追加到它触发的回复之后（BUG-0068）。
		const optimistic = user("optimistic-2", "插队消息");
		rememberOptimisticUserMessage("runtime-a", optimistic, [user("persisted-1", "first")]);
		const reply = createConversationAgentMessage({ id: "agent-1", phase: "completed", blocks: [] });
		const history = [user("persisted-1", "first"), user("persisted-2", "other"), reply];

		expect(reconcileOptimisticUserMessages("runtime-a", history).map((message) => message.id)).toEqual([
			"persisted-1",
			"optimistic-2",
			"persisted-2",
			"agent-1",
		]);
	});

	it("永远对不上账的气泡在有限次对账后停止残留", () => {
		// 队列镜像曾为内部 continuation 消息补气泡，而规范历史按 origin 过滤掉它，
		// 于是每次 agent_end 重拉都把这条气泡重新追加到列表末尾，永久残留且错位。
		const optimistic = user("optimistic-1", "Continue the response from where you stopped.");
		rememberOptimisticUserMessage("runtime-a", optimistic, [], { matchTextOnly: true });

		const history = [user("persisted-1", "真实用户消息")];
		// 发送时没有任何 user 序号（precedingUserCount=0），落在列表首位。
		expect(reconcileOptimisticUserMessages("runtime-a", history)).toEqual([optimistic, ...history]);
		reconcileOptimisticUserMessages("runtime-a", history);
		reconcileOptimisticUserMessages("runtime-a", history);
		expect(reconcileOptimisticUserMessages("runtime-a", history)).toEqual(history);
		expect(reconcileOptimisticUserMessages("runtime-a", history)).toEqual(history);
	});

	it("落盘较慢的气泡不会被误清：历史未到达该序号就一直保留", () => {
		const optimistic = user("optimistic-2", "second");
		rememberOptimisticUserMessage("runtime-a", optimistic, [user("persisted-1", "first")]);

		const history = [user("persisted-1", "first")];
		for (let index = 0; index < 10; index += 1) {
			expect(reconcileOptimisticUserMessages("runtime-a", history)).toEqual([...history, optimistic]);
		}
	});

	it("不同 runtime 的待确认气泡互不串会话", () => {
		const optimistic = user("optimistic-a", "session a");
		rememberOptimisticUserMessage("runtime-a", optimistic, []);

		expect(reconcileOptimisticUserMessages("runtime-b", [])).toEqual([]);
		expect(reconcileOptimisticUserMessages("runtime-a", [])).toEqual([optimistic]);
	});
});

describe("optimistic user message tail reconciliation（TASK-0050 窗口化）", () => {
	it("按尾部对齐确认：窗口内最后一条 user 命中即消费乐观气泡", () => {
		// 窗口化尾页只含历史后缀——precedingUserCount 全局序号不可得。
		const optimistic = user("optimistic-1", "latest question");
		// 发送时全量历史已有 3 条 user；窗口页只显示最后两条。
		rememberOptimisticUserMessage("runtime-a", optimistic, [user("p-1", "a"), user("p-2", "b"), user("p-3", "c")]);
		const tail = [user("p-3", "c"), user("persisted-new", "latest question")];
		const result = reconcileOptimisticUserMessagesTail("runtime-a", tail);
		expect(result.items.map((m) => m.id)).toEqual(["p-3", "persisted-new"]);
		expect(result.expiredIds.size).toBe(0);
		// 已确认——下一轮对账不再出现该气泡。
		expect(reconcileOptimisticUserMessagesTail("runtime-a", tail).items).toHaveLength(2);
	});

	it("多条待决气泡按发送顺序对位尾部 user 序列", () => {
		rememberOptimisticUserMessage("runtime-a", user("opt-1", "q4"), [user("p", "older")]);
		rememberOptimisticUserMessage("runtime-a", user("opt-2", "q5"), [user("p", "older")]);
		const tail = [user("persisted-4", "q4"), user("persisted-5", "q5")];
		const result = reconcileOptimisticUserMessagesTail("runtime-a", tail);
		expect(result.items.map((m) => m.id)).toEqual(["persisted-4", "persisted-5"]);
	});

	it("对不上的气泡不进 canonical 序列也不消失：由调用方作 live-only 保留", () => {
		const optimistic = user("optimistic-1", "still pending");
		rememberOptimisticUserMessage("runtime-a", optimistic, []);
		const tail = [user("persisted-1", "unrelated")];
		const result = reconcileOptimisticUserMessagesTail("runtime-a", tail);
		expect(result.items.map((m) => m.id)).toEqual(["persisted-1"]);
		expect(result.expiredIds.size).toBe(0);
	});

	it("未决气泡超过最大对账次数后进入 expiredIds 并移出待决池", () => {
		const optimistic = user("optimistic-1", "never lands");
		rememberOptimisticUserMessage("runtime-a", optimistic, []);
		const tail = [user("persisted-1", "unrelated")];
		let expiredIds: ReadonlySet<string> = new Set();
		for (let i = 0; i < 4; i += 1) {
			expiredIds = reconcileOptimisticUserMessagesTail("runtime-a", tail).expiredIds;
		}
		expect([...expiredIds]).toEqual(["optimistic-1"]);
		// 过期后待决池已清空。
		expect(reconcileOptimisticUserMessagesTail("runtime-a", tail).items).toHaveLength(1);
	});

	it("确认的气泡把 inputSegments 快照回填到 canonical item", () => {
		const inputSegments = [
			{ kind: "text" as const, text: "see " },
			{ kind: "file" as const, path: "C:/f.txt" },
		];
		const optimistic = createConversationUserMessage({
			id: "opt-1",
			text: "see @C:/f.txt",
			inputSegments,
			attachments: [{ kind: "file", path: "C:/f.txt" }],
		});
		rememberOptimisticUserMessage("runtime-a", optimistic, []);
		const canonical = createConversationUserMessage({
			id: "persisted-1",
			text: optimistic.text,
			attachments: optimistic.attachments,
		});
		const result = reconcileOptimisticUserMessagesTail("runtime-a", [canonical]);
		expect(result.items[0]).toMatchObject({ id: "persisted-1", inputSegments });
	});
});
