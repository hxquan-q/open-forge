// Modified by The Open Forge contributors.
import type { TeamSessionDocument } from "@vetta/agent-team";
import type { RuntimeHost } from "@vetta/runtime-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamSessionStateRepository } from "./team-session-state-repository.js";

const STATE_CUSTOM_TYPE = "agent-team.session-state.v1";

function sessionDocument(overrides?: Partial<TeamSessionDocument>): TeamSessionDocument {
	return {
		schemaVersion: 1,
		revision: 2,
		id: "team-session",
		teamId: "team",
		name: "Team",
		cwd: "C:/workspace",
		leaderMemberId: "leader",
		memberHandles: { leader: "leader" },
		createdAt: 1,
		updatedAt: 1,
		events: [],
		memberRuntime: {},
		coordinationRuntime: { sessionId: "coordination", sessionPath: "C:/sessions/coordination.jsonl" },
		...overrides,
	};
}

function runtimeHost(latestSession: TeamSessionDocument | undefined): {
	host: RuntimeHost;
	appendSessionMetadataEntry: ReturnType<typeof vi.fn>;
} {
	const appendSessionMetadataEntry = vi.fn(async () => undefined);
	const entries = latestSession
		? [
				{
					type: "custom" as const,
					id: "state-entry",
					customType: STATE_CUSTOM_TYPE,
					data: { customType: STATE_CUSTOM_TYPE, session: latestSession },
				},
			]
		: [];
	const host = {
		readSessionDocument: vi.fn(() => ({ entries })),
		appendSessionMetadataEntry,
	} as unknown as RuntimeHost;
	return { host, appendSessionMetadataEntry };
}

describe("TeamSessionStateRepository.persist", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("appends a fresh state record when the persisted revision is behind (BUG-0119 fast path)", async () => {
		// revision 是被序列化的字段：revision 不等 ⇒ 全文必不等，可直接追加。
		const { host, appendSessionMetadataEntry } = runtimeHost(sessionDocument({ revision: 1 }));
		const repository = new TeamSessionStateRepository({ runtime: () => host });

		await repository.persist(sessionDocument({ revision: 2 }));

		expect(appendSessionMetadataEntry).toHaveBeenCalledOnce();
	});

	it("skips the append when the session is already persisted unchanged", async () => {
		const persisted = sessionDocument({ revision: 2 });
		const { host, appendSessionMetadataEntry } = runtimeHost(persisted);
		const repository = new TeamSessionStateRepository({ runtime: () => host });

		await repository.persist(sessionDocument({ revision: 2 }));

		expect(appendSessionMetadataEntry).not.toHaveBeenCalled();
	});

	it("still appends when the revision matches but the content differs (stringify oracle stays)", async () => {
		// revision 相等不能只看 revision：同名同版本但内容不同仍要追加。
		const { host, appendSessionMetadataEntry } = runtimeHost(sessionDocument({ revision: 2, name: "Before" }));
		const repository = new TeamSessionStateRepository({ runtime: () => host });

		await repository.persist(sessionDocument({ revision: 2, name: "After" }));

		expect(appendSessionMetadataEntry).toHaveBeenCalledOnce();
	});

	it("appends the first state record when the coordination document has none yet", async () => {
		const { host, appendSessionMetadataEntry } = runtimeHost(undefined);
		const repository = new TeamSessionStateRepository({ runtime: () => host });

		await repository.persist(sessionDocument({ revision: 2 }));

		expect(appendSessionMetadataEntry).toHaveBeenCalledOnce();
	});
});
