// Copyright The Open Forge contributors.
// BUG-0127 路线 5 的性能护栏：守数量级回归（对齐 canvas-data-grid「可复现预算」
// 先例）。预算取本机线性实测的宽裕倍数；若活动循环/文本兜底退化回 O(n²)，
// 本规模下的耗时是数百毫秒量级，会显著超出预算变红。
import type {
	DesktopTeamSessionSnapshot,
	DesktopTeamSessionStreamEvent,
} from "@preload/api-types/team-conversation-display";
import type { TeamSessionDocument } from "@vetta/agent-team";
import { createAssistantMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import {
	computeTeamTimelineBase,
	projectTeamConversationTimeline,
	reduceTeamStreamState,
	type TeamMemberViewModel,
} from "./teamChatModel";

const AGENT_TEXT = "测量文本占位".repeat(25); // 200 字符，触发文本兜底比较路径

function perfSession(): TeamSessionDocument {
	return {
		schemaVersion: 1,
		revision: 1,
		id: "perf-session",
		teamId: "perf-team",
		name: "Perf",
		cwd: "C:/perf",
		leaderMemberId: "leader",
		memberHandles: { leader: "lead", worker: "work", reviewer: "rev" },
		createdAt: 1,
		updatedAt: 1,
		events: [],
		memberRuntime: {},
	} as TeamSessionDocument;
}

function buildPerfSnapshot(messageCount: number, activityCount: number): DesktopTeamSessionSnapshot {
	const messages: DesktopTeamSessionSnapshot["messages"][number][] = [];
	for (let index = 0; index < messageCount; index += 1) {
		const turnId = `turn-${Math.floor(index / 4)}`;
		if (index % 2 === 0) {
			messages.push({
				kind: "user",
				id: `user-${index}`,
				turnId,
				timestamp: index,
				author: { kind: "user", id: "local-user" },
				message: { role: "user", content: `请求 ${index}`, timestamp: index },
			});
		} else {
			messages.push({
				kind: "agent",
				id: `agent-${index}`,
				turnId,
				timestamp: index,
				author: { kind: "agent", id: index % 10 === 0 ? "worker" : "leader" },
				message: {
					...createAssistantMessage({ api: "perf", provider: "perf", model: "fixture" }, { timestamp: index }),
					content: [{ type: "text", text: AGENT_TEXT }],
				},
			});
		}
	}
	const activities: DesktopTeamSessionSnapshot["activities"] = Array.from(
		{ length: activityCount },
		(_value, index) => ({
			kind: "delegation",
			id: `activity-${index}`,
			requestId: `turn-${index}`,
			sourceMemberId: "leader",
			targetMemberId: index % 2 === 0 ? "worker" : "reviewer",
			objective: `目标 ${index}`,
			state: index % 3 === 0 ? "completed" : "running",
			timestamp: index,
		}),
	);
	return {
		session: perfSession(),
		conversationRevision: 1,
		messages,
		activities,
		display: { memberConversations: [] },
	};
}

const members: readonly TeamMemberViewModel[] = [
	{
		id: "leader",
		kind: "agent",
		name: "Lead",
		handle: "lead",
		blueprintId: "leader",
		selected: false,
		status: "idle",
	},
	{
		id: "worker",
		kind: "agent",
		name: "Work",
		handle: "work",
		blueprintId: "worker",
		selected: false,
		status: "idle",
	},
	{
		id: "reviewer",
		kind: "agent",
		name: "Rev",
		handle: "rev",
		blueprintId: "reviewer",
		selected: false,
		status: "idle",
	},
];

const labels = { delegation: (from: string, to: string) => `${from} -> ${to}`, unknownMember: "?" };

function perfStreams(): Parameters<typeof projectTeamConversationTimeline>[0]["streams"] {
	const event: DesktopTeamSessionStreamEvent = {
		type: "conversation.agent-message-event",
		conversationId: "perf-session",
		messageId: "stream-1",
		turnId: "stream-turn-1",
		author: { kind: "agent", id: "worker" },
		sequence: 1,
		timestamp: 1,
		event: {
			type: "text_delta",
			contentIndex: 0,
			delta: AGENT_TEXT,
			partial: {
				...createAssistantMessage({ api: "perf", provider: "perf", model: "fixture" }, { timestamp: 1 }),
				content: [{ type: "text", text: AGENT_TEXT }],
			},
		},
	};
	return reduceTeamStreamState({}, event);
}

describe("projectTeamConversationTimeline 性能预算", () => {
	it("5000 消息 × 1000 活动的聚合投影维持在可复现预算内", () => {
		const snapshot = buildPerfSnapshot(5000, 1000);
		const startedAt = performance.now();
		const items = projectTeamConversationTimeline({
			snapshot,
			pending: undefined,
			streams: perfStreams(),
			members,
			labels,
		});
		const elapsedMs = performance.now() - startedAt;
		// 输出正确性兜底：防止「空结果跑得快」的假绿。
		expect(items.length).toBeGreaterThan(1000);
		// 预算守数量级：索引化后本规模为个位毫秒；活动循环/文本兜底退化回 O(n²)
		// 会把 1000×5000 的谓词与全文比较推到数百毫秒。宽裕预算挡回归不挡抖动。
		expect(elapsedMs).toBeLessThan(150);
		console.log(`[teamChatModel] 5000 消息 × 1000 活动投影 ${elapsedMs.toFixed(2)}ms`);
	});

	it("带预计算基座时输出直接复用基座条目（引用共享，不重建）", () => {
		const snapshot = buildPerfSnapshot(5000, 1000);
		const base = computeTeamTimelineBase(snapshot, undefined);
		const startedAt = performance.now();
		const items = projectTeamConversationTimeline({
			snapshot,
			pending: undefined,
			streams: {},
			members,
			labels,
			base,
		});
		const elapsedMs = performance.now() - startedAt;
		expect(items.length).toBeGreaterThan(1000);
		// TASK-0292 机制护栏（确定性）：带基座的投影必须复用基座条目对象本身——
		// 若退化成重建（哪怕是等价重建），引用相等会失败。计时仅作量级参考记录。
		const sharedUserItem = base.annotatedCoordinationUserItems[0];
		expect(sharedUserItem).toBeDefined();
		const inOutput = items.find((item) => item.id === sharedUserItem?.id);
		expect(inOutput).toBe(sharedUserItem);
		const sharedAgentItem = base.aggregateCoordinationAgentItems[0];
		expect(sharedAgentItem).toBeDefined();
		const agentInOutput = items.find((item) => item.id === sharedAgentItem?.id);
		expect(agentInOutput).toBe(sharedAgentItem);
		expect(elapsedMs).toBeLessThan(150);
		console.log(`[teamChatModel] 带预计算基座的投影 ${elapsedMs.toFixed(2)}ms`);
	});
});
