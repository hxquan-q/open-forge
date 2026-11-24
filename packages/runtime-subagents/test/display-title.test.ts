// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { SubagentCoordinator, type SubagentTypeDefinition, SubagentTypeRegistry } from "../src/index.js";
import { TestChild } from "./support/test-child.js";

interface TestProfile {
	readonly kind: string;
}

function typeWith(id: string, displayTitle?: string): SubagentTypeDefinition<TestProfile> {
	return {
		id,
		label: id,
		description: `${id} agent`,
		profile: { kind: id },
		...(displayTitle ? { displayTitle } : {}),
	};
}

/** REQ-0034：成员子代理靠类型上的 displayTitle 在快照里呈成员名（UI 顶栏呈现成员名）。 */
describe("spawn snapshot display title", () => {
	it("defaults the snapshot title to the type displayTitle when the request carries none", async () => {
		const coordinator = new SubagentCoordinator({
			factory: {
				async create() {
					return new TestChild("child-1");
				},
			},
			typeRegistry: new SubagentTypeRegistry<TestProfile>()
				.register(typeWith("general"))
				.register(typeWith("member:agent-1", "Eform Developer")),
			parentSessionId: "root-session",
		});
		const snapshot = await coordinator.spawn({
			taskName: "m_agent_1",
			agentType: "member:agent-1",
			message: "contract",
		});
		expect(snapshot.title).toBe("Eform Developer");
		await coordinator.dispose();
	});

	it("keeps an explicit request title ahead of the type displayTitle", async () => {
		const coordinator = new SubagentCoordinator({
			factory: {
				async create() {
					return new TestChild("child-2");
				},
			},
			typeRegistry: new SubagentTypeRegistry<TestProfile>().register(typeWith("member:agent-1", "Eform Developer")),
			parentSessionId: "root-session",
		});
		const snapshot = await coordinator.spawn({
			taskName: "m_agent_1",
			agentType: "member:agent-1",
			message: "contract",
			title: "Custom title",
		});
		expect(snapshot.title).toBe("Custom title");
		await coordinator.dispose();
	});

	it("leaves titles undefined for types without displayTitle (existing display behaviour)", async () => {
		const coordinator = new SubagentCoordinator({
			factory: {
				async create() {
					return new TestChild("child-3");
				},
			},
			typeRegistry: new SubagentTypeRegistry<TestProfile>().register(typeWith("general")),
			parentSessionId: "root-session",
		});
		const snapshot = await coordinator.spawn({ taskName: "probe", agentType: "general", message: "work" });
		expect(snapshot.title).toBeUndefined();
		await coordinator.dispose();
	});
});
