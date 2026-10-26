// @vitest-environment jsdom
/**
 * 档位归属过滤（TASK-0406）：声明了 mode 的团队/智能体只出现在对应档的下拉里；
 * 未声明两档可见；已选中的 chip 不过滤（切档后身份仍完整回显，发送不拦）。
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentTeamDocument } from "@vetta/agent-team";
import { NewSessionAgentSelector } from "./NewSessionAgentSelector";
import { teamTargetKey } from "./target";

const currentDocument = vi.hoisted(() => ({ current: undefined as AgentTeamDocument | undefined }));

vi.mock("./agent-team-directory", () => ({
	loadAgentTeamDocument: vi.fn(async () => currentDocument.current),
}));
vi.mock("@shared/agent-teams/agent-team-localization", () => ({
	useLocalizedAgentTeamDocument: (document: unknown) => document,
}));
vi.mock("@shared/agent-teams/agent-avatar", () => ({
	useAgentAvatarResolver: () => () => "avatar://stub",
	teamMemberAvatarUrls: () => ["avatar://stub"],
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const now = 1_700_000_000_000;

function profile(id: string, name: string, mode?: "work" | "coding") {
	return {
		id,
		revision: 1,
		name,
		description: "",
		mentionHandle: id,
		blueprintId: `bp-${id}`,
		abilities: { selectionMode: "all" as const, skills: [], mcpServers: [], plugins: [] },
		scope: { kind: "library" as const },
		createdAt: now,
		updatedAt: now,
		...(mode ? { mode } : {}),
	};
}

function team(id: string, name: string, memberIds: readonly string[], mode?: "work" | "coding") {
	return {
		id,
		revision: 1,
		name,
		description: "",
		leaderMemberId: `${id}-m0`,
		members: memberIds.map((agentId, index) => ({
			id: `${id}-m${index}`,
			handle: `${id}-m${index}`,
			binding: { kind: "reference" as const, agentProfileId: agentId },
		})),
		orchestrationPolicyId: "leader-delegates-v1",
		contextPolicyId: "public-results-v1",
		createdAt: now,
		updatedAt: now,
		...(mode ? { mode } : {}),
	};
}

/** 名册：通用智能体（无声明）、开发团队+开发智能体（coding）、研究智能体（work）。 */
const roster: AgentTeamDocument = {
	schemaVersion: 1,
	revision: 1,
	agents: [
		profile("agent-general", "通用助手"),
		profile("agent-dev", "表单匠", "coding"),
		profile("agent-research", "资料研究员", "work"),
	],
	teams: [team("team-eform", "电子表单工坊", ["agent-dev"], "coding")],
} as unknown as AgentTeamDocument;

beforeEach(() => {
	currentDocument.current = roster;
});

afterEach(cleanup);

async function openPicker() {
	// 触发器是唯一原生 button；aria-label 恒为 triggerLabel 的 i18n key（identity mock）。
	fireEvent.click(screen.getByRole("button", { name: "newSession.agentSelector.triggerLabel" }));
	await waitFor(() => expect(screen.getByText("通用助手")).toBeDefined());
}

describe("NewSessionAgentSelector 档位过滤", () => {
	it("work 档：coding 归属的团队与智能体不出现，未声明与 work 归属可见", async () => {
		render(
			<NewSessionAgentSelector selectedKey={null} onSelect={vi.fn()} workspaceMode="work" />,
		);
		await openPicker();

		expect(screen.getByText("通用助手")).toBeDefined();
		expect(screen.getByText("资料研究员")).toBeDefined();
		expect(screen.queryByText("电子表单工坊")).toBeNull();
		expect(screen.queryByText("表单匠")).toBeNull();
	});

	it("coding 档：coding 归属可见，work 归属不出现", async () => {
		render(
			<NewSessionAgentSelector selectedKey={null} onSelect={vi.fn()} workspaceMode="coding" />,
		);
		await openPicker();

		expect(screen.getByText("电子表单工坊")).toBeDefined();
		expect(screen.getByText("表单匠")).toBeDefined();
		expect(screen.getByText("通用助手")).toBeDefined();
		expect(screen.queryByText("资料研究员")).toBeNull();
	});

	it("已选中的 coding 团队在 work 档仍完整回显（chip 不做调用时校验）", async () => {
		render(
			<NewSessionAgentSelector
				selectedKey={teamTargetKey("team-eform")}
				onSelect={vi.fn()}
				workspaceMode="work"
			/>,
		);
		// 触发器上仍是完整身份（名录异步加载完成后）：名字可见，且列表里不再出现该团队。
		await waitFor(() => expect(screen.getByText("电子表单工坊")).toBeDefined());
		await openPicker();
		expect(screen.queryByText("表单匠")).toBeNull();
	});
});
