// Modified by The Open Forge contributors.
import type { AgentBlueprint, AgentProfile, AgentTeamDocument, TeamDefinition } from "@vetta/agent-team";
import { createAgentTeamFixture, pluginBlueprintId } from "@vetta/agent-team";
import { describe, expect, it } from "vitest";
import {
	type PluginPresetDeclarations,
	pluginAgentProfileId,
	pluginTeamId,
	reconcilePluginAgentPresets,
} from "./plugin-agent-preset-reconcile.js";
import type { PluginAgentPreset, PluginTeamPreset } from "./plugin-agent-presets.js";

const PLUGIN_ID = "vetta-ui-design";
const BLUEPRINT_ID = pluginBlueprintId(PLUGIN_ID, "designer");
const PROVIDER_ID = "preset-agent";
const DEVELOPER_BLUEPRINT = pluginBlueprintId(PROVIDER_ID, "developer");

const blueprint: AgentBlueprint = {
	id: BLUEPRINT_ID,
	nameKey: "",
	descriptionKey: "",
	name: "%agent.designer.name%",
	systemPrompt: "You are the design specialist.",
	defaultAbilities: { selectionMode: "all", skills: [], mcpServers: [], plugins: [] },
	source: { kind: "plugin", pluginId: PLUGIN_ID },
	avatarUrl: "data:image/webp;base64,ZmFrZQ==",
	pinnedPlugins: [PLUGIN_ID],
};

const agentPreset: PluginAgentPreset = {
	pluginId: PLUGIN_ID,
	agentId: "designer",
	blueprint,
	profileName: "设计师",
	profileDescription: "画布设计",
	profileTextKeys: { nameKey: "agent.designer.name" },
	mentionHandle: "designer",
	legacyBlueprintIds: [],
	roles: ["designer"],
};

const developerPreset: PluginAgentPreset = {
	pluginId: PROVIDER_ID,
	agentId: "developer",
	blueprint: { ...blueprint, id: DEVELOPER_BLUEPRINT, source: { kind: "plugin", pluginId: PROVIDER_ID } },
	profileName: "开发者",
	profileDescription: "写代码的",
	profileTextKeys: {},
	mentionHandle: "developer",
	legacyBlueprintIds: [],
	roles: ["developer"],
};

const teamPreset: PluginTeamPreset = {
	pluginId: PLUGIN_ID,
	teamId: "design-team",
	name: "设计团队",
	description: "把构想变成可评审的界面",
	textKeys: { nameKey: "team.design.name", descriptionKey: "team.design.description" },
	members: [
		{
			slotKey: "designer",
			blueprintId: BLUEPRINT_ID,
			providerPluginId: PLUGIN_ID,
			responsibility: "Builds the frames.",
		},
	],
	workflow: "Run this team as a design loop.",
	legacyTeamIds: [],
};

/** 同一支团队的下一版：改了名、换了任务书、加了一名由别的插件供货的成员。 */
const nextTeamPreset: PluginTeamPreset = {
	...teamPreset,
	name: "设计与实现团队",
	workflow: "Run this team as a design-then-build loop.",
	members: [
		{ ...teamPreset.members[0]!, responsibility: "Owns the visual result." },
		{
			slotKey: "developer",
			blueprintId: DEVELOPER_BLUEPRINT,
			providerPluginId: PROVIDER_ID,
			role: "developer",
			responsibility: "Implements the frames.",
			instructions: "Ship behind a flag.",
		},
	],
};

function baseDocument(): AgentTeamDocument {
	return createAgentTeamFixture();
}

/** 已安装插件声明过的一切：这一份等价于「presets 里这些就是全部」。 */
function declarationsOf(
	agents: readonly PluginAgentPreset[],
	teams: readonly PluginTeamPreset[],
): PluginPresetDeclarations {
	return {
		agentBlueprintIds: new Set(agents.flatMap((preset) => [preset.blueprint.id, ...preset.legacyBlueprintIds])),
		teamIds: new Set(
			teams.flatMap((preset) => [pluginTeamId(preset.pluginId, preset.teamId), ...preset.legacyTeamIds]),
		),
	};
}

function designTeam(document: AgentTeamDocument): TeamDefinition | undefined {
	return document.teams.find((team) => team.id === pluginTeamId(PLUGIN_ID, "design-team"));
}

describe("plugin agent preset reconcile", () => {
	it("installs a plugin agent and its team, stamped with the provider", () => {
		const result = reconcilePluginAgentPresets({
			document: baseDocument(),
			agents: [agentPreset],
			teams: [teamPreset],
		});

		if (!result) throw new Error("expected a reconcile result");
		const installed = result.document.agents.find((agent) => agent.blueprintId === BLUEPRINT_ID);
		expect(installed?.id).toBe(pluginAgentProfileId(PLUGIN_ID, "designer"));
		expect(installed?.name).toBe("设计师");
		// 语言包 key 随档案落盘：字面量只有默认语言，界面靠 key 跟随切换。
		expect(installed?.source).toEqual({ kind: "plugin", pluginId: PLUGIN_ID, nameKey: "agent.designer.name" });
		// 头像不落档案：它是一条内联 data URL，既超出 avatar 字段的长度约定，也会让提供方换图之后
		// 所有存量用户停在旧图上。
		expect(installed?.avatar).toBeUndefined();
		// 人设同样留空，提供方升级提示词时没手改过的用户才跟得上。
		expect(installed?.systemPrompt).toBeUndefined();

		const team = designTeam(result.document);
		expect(team?.source).toEqual({
			kind: "plugin",
			pluginId: PLUGIN_ID,
			nameKey: "team.design.name",
			descriptionKey: "team.design.description",
		});
		expect(team?.members).toHaveLength(1);
		expect(team?.members[0]?.assignment?.instructions).toBe(teamPreset.workflow);
	});

	it("stamps the declared workspace mode on the agent profile and the team, and propagates changes", () => {
		const first = reconcilePluginAgentPresets({
			document: baseDocument(),
			agents: [{ ...agentPreset, mode: "coding" }],
			teams: [{ ...teamPreset, mode: "coding" }],
		});
		if (!first) throw new Error("expected a reconcile result");
		expect(first.document.agents.find((agent) => agent.blueprintId === BLUEPRINT_ID)?.mode).toBe("coding");
		expect(first.document.teams.find((team) => team.id === pluginTeamId(PLUGIN_ID, "design-team"))?.mode).toBe(
			"coding",
		);

		// 清单撤掉声明 → 档位归属随之消失（比较含 mode，改了就要落新修订）。
		const second = reconcilePluginAgentPresets({
			document: first.document,
			agents: [agentPreset],
			teams: [teamPreset],
		});
		if (!second) throw new Error("expected a second reconcile result");
		expect(second.document.agents.find((agent) => agent.blueprintId === BLUEPRINT_ID)?.mode).toBeUndefined();
		expect(
			second.document.teams.find((team) => team.id === pluginTeamId(PLUGIN_ID, "design-team"))?.mode,
		).toBeUndefined();
	});

	it("does nothing on a second run", () => {
		const first = reconcilePluginAgentPresets({
			document: baseDocument(),
			agents: [agentPreset],
			teams: [teamPreset],
		});
		if (!first) throw new Error("expected a reconcile result");

		expect(
			reconcilePluginAgentPresets({ document: first.document, agents: [agentPreset], teams: [teamPreset] }),
		).toBeUndefined();
	});

	it("replaces the plugin's team with the version the manifest now declares", () => {
		const installed = reconcilePluginAgentPresets({
			document: baseDocument(),
			agents: [agentPreset, developerPreset],
			teams: [teamPreset],
		});
		if (!installed) throw new Error("expected a reconcile result");
		const before = designTeam(installed.document)!;

		const updated = reconcilePluginAgentPresets({
			document: installed.document,
			agents: [agentPreset, developerPreset],
			teams: [nextTeamPreset],
		});

		if (!updated) throw new Error("expected the team to be rewritten");
		const team = designTeam(updated.document)!;
		expect(team.name).toBe("设计与实现团队");
		expect(team.members).toHaveLength(2);
		// 队长的任务书跟着团队级 workflow 走，队员各带自己的交待。
		expect(team.members[0]?.assignment?.instructions).toBe(nextTeamPreset.workflow);
		expect(team.members[1]?.assignment?.instructions).toBe("Ship behind a flag.");
		expect(team.members[1]?.assignment?.responsibility).toBe("Implements the frames.");
		// 既有成员的 id 不变：运行时状态与会话记录都按成员 id 索引。
		expect(team.members[0]?.id).toBe(before.members[0]?.id);
		expect(team.leaderMemberId).toBe(team.members[0]?.id);
	});

	it("overwrites what the user edited on a plugin-owned agent and team", () => {
		const installed = reconcilePluginAgentPresets({
			document: baseDocument(),
			agents: [agentPreset],
			teams: [teamPreset],
		});
		if (!installed) throw new Error("expected a reconcile result");
		const edited: AgentTeamDocument = {
			...installed.document,
			agents: installed.document.agents.map((agent) =>
				agent.blueprintId === BLUEPRINT_ID ? { ...agent, name: "我改的名字", systemPrompt: "mine" } : agent,
			),
			teams: installed.document.teams.map((team) =>
				team.id === pluginTeamId(PLUGIN_ID, "design-team") ? { ...team, name: "我改的队名" } : team,
			),
		};

		const result = reconcilePluginAgentPresets({
			document: edited,
			agents: [agentPreset],
			teams: [teamPreset],
		});

		if (!result) throw new Error("expected the manifest to win");
		const agent = result.document.agents.find((candidate) => candidate.blueprintId === BLUEPRINT_ID);
		expect(agent?.name).toBe("设计师");
		expect(agent?.systemPrompt).toBeUndefined();
		expect(designTeam(result.document)?.name).toBe("设计团队");
	});

	it("puts a missing preset back, because the provider owns it", () => {
		const first = reconcilePluginAgentPresets({ document: baseDocument(), agents: [agentPreset], teams: [] });
		if (!first) throw new Error("expected a reconcile result");
		const withoutAgent = {
			...first.document,
			agents: first.document.agents.filter((agent) => agent.blueprintId !== BLUEPRINT_ID),
		};

		const second = reconcilePluginAgentPresets({ document: withoutAgent, agents: [agentPreset], teams: [] });
		expect(second?.document.agents.some((agent) => agent.blueprintId === BLUEPRINT_ID)).toBe(true);
	});

	it("drops a team the plugin no longer declares", () => {
		const installed = reconcilePluginAgentPresets({
			document: baseDocument(),
			agents: [agentPreset],
			teams: [teamPreset],
		});
		if (!installed) throw new Error("expected a reconcile result");

		// 新版本只保留智能体，团队被作者撤掉了。
		const result = reconcilePluginAgentPresets({
			document: installed.document,
			agents: [agentPreset],
			teams: [],
			declarations: declarationsOf([agentPreset], []),
		});

		if (!result) throw new Error("expected the retired team to be dropped");
		expect(designTeam(result.document)).toBeUndefined();
		expect(result.removedTeamIds).toEqual([pluginTeamId(PLUGIN_ID, "design-team")]);
		// 智能体还被声明着，留在库里。
		expect(result.document.agents.some((agent) => agent.blueprintId === BLUEPRINT_ID)).toBe(true);
	});

	it("drops a retired plugin agent and takes it out of the teams the user built", () => {
		const installed = reconcilePluginAgentPresets({
			document: baseDocument(),
			agents: [agentPreset, developerPreset],
			teams: [],
		});
		if (!installed) throw new Error("expected a reconcile result");
		const designer = installed.document.agents.find((agent) => agent.blueprintId === BLUEPRINT_ID)!;
		const developer = installed.document.agents.find((agent) => agent.blueprintId === DEVELOPER_BLUEPRINT)!;
		// 用户把两位插件智能体拉进了自己的团队。
		const userTeam: TeamDefinition = {
			id: "user-team",
			revision: 1,
			name: "我的队",
			description: "",
			leaderMemberId: "member-developer",
			members: [
				{
					id: "member-developer",
					handle: "dev",
					binding: { kind: "reference", agentProfileId: developer.id },
				},
				{
					id: "member-designer",
					handle: "designer-mine",
					binding: { kind: "reference", agentProfileId: designer.id },
				},
			],
			orchestrationPolicyId: "leader-delegates-v1",
			contextPolicyId: "public-results-v1",
			createdAt: 1,
			updatedAt: 1,
		};

		const result = reconcilePluginAgentPresets({
			document: { ...installed.document, teams: [...installed.document.teams, userTeam] },
			agents: [developerPreset],
			teams: [],
			declarations: declarationsOf([developerPreset], []),
		});

		if (!result) throw new Error("expected the retired agent to be dropped");
		expect(result.document.agents.some((agent) => agent.blueprintId === BLUEPRINT_ID)).toBe(false);
		expect(result.removedAgentIds).toEqual([designer.id]);
		// 用户自建的团队活着，只是少了那名跑不起来的成员。
		const survived = result.document.teams.find((team) => team.id === "user-team");
		expect(survived?.members.map((member) => member.id)).toEqual(["member-developer"]);
	});

	it("keeps the assets of a plugin that is merely disabled", () => {
		const installed = reconcilePluginAgentPresets({
			document: baseDocument(),
			agents: [agentPreset],
			teams: [teamPreset],
		});
		if (!installed) throw new Error("expected a reconcile result");

		// 插件被禁用：它这一轮解析不出任何预设，但清单还在，声明也还在。
		const result = reconcilePluginAgentPresets({
			document: installed.document,
			agents: [],
			teams: [],
			declarations: declarationsOf([agentPreset], [teamPreset]),
		});

		expect(result).toBeUndefined();
	});

	it("claims an existing profile by its legacy blueprint id instead of laying down a duplicate", () => {
		const document = baseDocument();
		// 夹具里的 Developer 仍写着历史 id `executor`，正是存量安装的形状。
		const legacy = document.agents.find((agent) => agent.blueprintId === "executor");
		expect(legacy).toBeDefined();

		const result = reconcilePluginAgentPresets({
			document,
			agents: [{ ...agentPreset, legacyBlueprintIds: ["executor"] }],
			teams: [],
		});

		if (!result) throw new Error("expected a reconcile result");
		expect(result.document.agents).toHaveLength(document.agents.length);
		const claimed = result.document.agents.find((agent) => agent.id === legacy?.id);
		// 档案 id 保住了（用户的团队与会话都挂在它上面），内容换成清单这一份。
		expect(claimed?.blueprintId).toBe(BLUEPRINT_ID);
		expect(claimed?.source).toEqual({ kind: "plugin", pluginId: PLUGIN_ID, nameKey: "agent.designer.name" });
		expect(claimed?.name).toBe("设计师");
	});

	it("leaves a user-created profile alone even when it shares the preset blueprint", () => {
		// 用户从蓝图新建的自建档案：blueprintId 与预设相同但没有提供方戳。按 blueprintId 认领会把
		// 它改写成预设档案——用户的人设与 handle 被吃掉，存量团队还会因 handle 撞库整份读不出来。
		const document = baseDocument();
		const clone: AgentProfile = {
			id: "8f9a1b2c-3d4e-4f50-8a9b-0c1d2e3f4a5b",
			revision: 1,
			name: "馆长",
			description: "用户自建的人设",
			mentionHandle: "agent-7",
			blueprintId: BLUEPRINT_ID,
			abilities: { selectionMode: "all", skills: [], mcpServers: [], plugins: [] },
			scope: { kind: "library" },
			createdAt: 1,
			updatedAt: 1,
		};

		const result = reconcilePluginAgentPresets({
			document: { ...document, agents: [clone, ...document.agents] },
			agents: [agentPreset],
			teams: [],
		});

		if (!result) throw new Error("expected the preset to install its own profile");
		const survived = result.document.agents.find((agent) => agent.id === clone.id);
		expect(survived?.name).toBe("馆长");
		expect(survived?.mentionHandle).toBe("agent-7");
		expect(survived?.source).toBeUndefined();
		// 预设照常落自己的档案，用的是确定性 id 而不是抢来的那份。
		expect(
			result.document.agents.some(
				(agent) => agent.id === pluginAgentProfileId(PLUGIN_ID, "designer") && agent.source?.kind === "plugin",
			),
		).toBe(true);
	});

	it("keeps the provider-stamped instance and a lookalike clone distinct", () => {
		// 线上事故形状：被认领过的预设实例与用户克隆同 blueprintId 共存，克隆在目录序里排在前面
		// 时会被认领并改写成同一个 handle，校验直接判整份配置作废。
		const installed = reconcilePluginAgentPresets({
			document: baseDocument(),
			agents: [agentPreset],
			teams: [],
		});
		if (!installed) throw new Error("expected the preset to install");
		const clone: AgentProfile = {
			id: "8f9a1b2c-3d4e-4f50-8a9b-0c1d2e3f4a5b",
			revision: 1,
			name: "馆长",
			description: "用户自建的人设",
			mentionHandle: "agent-7",
			blueprintId: BLUEPRINT_ID,
			abilities: { selectionMode: "all", skills: [], mcpServers: [], plugins: [] },
			scope: { kind: "library" },
			createdAt: 1,
			updatedAt: 1,
		};

		const input: AgentTeamDocument = {
			...installed.document,
			agents: [clone, ...installed.document.agents],
		};
		const result = reconcilePluginAgentPresets({ document: input, agents: [agentPreset], teams: [] });

		const agents = result?.document.agents ?? input.agents;
		const handles = agents.filter((agent) => agent.scope.kind === "library").map((agent) => agent.mentionHandle);
		expect(new Set(handles).size).toBe(handles.length);
		expect(agents.find((agent) => agent.id === clone.id)?.mentionHandle).toBe("agent-7");
	});

	it("skips a team whose member profiles cannot be resolved", () => {
		const result = reconcilePluginAgentPresets({ document: baseDocument(), agents: [], teams: [teamPreset] });
		expect(result).toBeUndefined();
	});

	it("gives a preset agent a free handle when the user already took it", () => {
		const document = baseDocument();
		const taken: AgentTeamDocument = {
			...document,
			agents: document.agents.map((agent, index) => (index === 0 ? { ...agent, mentionHandle: "designer" } : agent)),
		};

		const result = reconcilePluginAgentPresets({ document: taken, agents: [agentPreset], teams: [] });

		if (!result) throw new Error("expected a reconcile result");
		const installed = result.document.agents.find((agent) => agent.blueprintId === BLUEPRINT_ID);
		expect(installed?.mentionHandle).toBe("designer-2");
	});
});
