// Modified by The Open Forge contributors.
import type { TeamSessionDocument } from "@vetta/agent-team";
import type { ConversationDocument, RuntimeHost } from "@vetta/runtime-core";
import type { ConversationDocumentEntry } from "@vetta/runtime-core/conversation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamSessionStateRepository } from "./team-session-state-repository.js";

interface RecordedAppend {
	readonly sessionId: string;
	readonly customType: string;
	readonly data: unknown;
}

/** 测试专用的可变协调文档形状：revision 与 entries 需要在追加时原地演进。 */
interface MutableCoordinationDocument {
	identity: { sessionId: string; createdAt: number };
	journalVersion: number;
	revision: number;
	entries: ConversationDocumentEntry[];
	activeLeafId: string | null;
}

interface Harness {
	readonly repository: TeamSessionStateRepository;
	readonly appends: RecordedAppend[];
	readonly document: MutableCoordinationDocument;
	/** 模拟一次 custom.append 落到协调文档（仓库自身追加或外部写入共用）。 */
	readonly pushCustomEntry: (customType: string, data: unknown) => void;
}

const STATE_CUSTOM_TYPE = "agent-team.session-state.v1";

function createSession(overrides: Partial<TeamSessionDocument> = {}): TeamSessionDocument {
	return {
		id: "team-session-1",
		teamId: "team-1",
		revision: 1,
		name: "团队会话",
		cwd: "C:/work",
		leaderMemberId: "leader",
		memberHandles: {},
		createdAt: 1,
		updatedAt: 1,
		events: [],
		memberRuntime: {},
		coordinationRuntime: { sessionId: "coordination-1" },
		...overrides,
	} as TeamSessionDocument;
}

function createHarness(): Harness {
	const appends: RecordedAppend[] = [];
	const document: MutableCoordinationDocument = {
		identity: { sessionId: "coordination-1", createdAt: 1 },
		journalVersion: 0,
		revision: 0,
		entries: [],
		activeLeafId: null,
	};
	const pushCustomEntry = (customType: string, data: unknown) => {
		document.revision += 1;
		document.entries.push({
			type: "custom",
			id: `entry-${document.entries.length}`,
			parentId: null,
			timestamp: "2026-10-17T00:00:00.000Z",
			customType,
			data,
		});
	};
	const runtime = {
		readSessionDocument: () => document as unknown as ConversationDocument,
		appendSessionMetadataEntry: async (sessionId: string, customType: string, data: unknown) => {
			appends.push({ sessionId, customType, data });
			pushCustomEntry(customType, data);
		},
	} as unknown as RuntimeHost;
	return {
		repository: new TeamSessionStateRepository({ runtime: () => runtime }),
		appends,
		document,
		pushCustomEntry,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("TeamSessionStateRepository persist", () => {
	it("appends on first persist and skips unchanged persists with a single serialization", async () => {
		const { repository, appends } = createHarness();
		const session = createSession();

		await repository.persist(session);
		expect(appends).toHaveLength(1);
		expect(appends[0]).toMatchObject({ sessionId: "coordination-1", customType: STATE_CUSTOM_TYPE });

		const stringify = vi.spyOn(JSON, "stringify");
		await repository.persist(session);
		expect(appends).toHaveLength(1); // 未变化不重复追加
		expect(stringify).toHaveBeenCalledTimes(1); // 热路径只序列化当前 session 一次
	});

	it("appends again when the session content changes and refreshes the fingerprint", async () => {
		const { repository, appends } = createHarness();
		const session = createSession();

		await repository.persist(session);
		const renamed = createSession({ name: "改名后的会话" });
		await repository.persist(renamed);

		expect(appends).toHaveLength(2);
		expect((appends[1]?.data as { session: { name: string } }).session.name).toBe("改名后的会话");

		const stringify = vi.spyOn(JSON, "stringify");
		await repository.persist(renamed);
		expect(appends).toHaveLength(2); // 指纹已刷新，同内容不再追加
		expect(stringify).toHaveBeenCalledTimes(1);
	});

	it("falls back to exact comparison when another command advanced the coordination revision", async () => {
		const { repository, appends, pushCustomEntry } = createHarness();
		const session = createSession();
		await repository.persist(session);
		expect(appends).toHaveLength(1);

		// 外部推进 revision（先落一条其他类型的 custom 条目，再落一条同内容状态条目）。
		pushCustomEntry("agent-team.work-item.v1", { id: "work-1" });
		pushCustomEntry(STATE_CUSTOM_TYPE, { customType: STATE_CUSTOM_TYPE, session });

		await repository.persist(session);
		expect(appends).toHaveLength(1); // 冷路径核对最新状态条目一致，不追加

		// 再推进一条内容不同的状态条目：冷路径必须识别差异并追加。
		pushCustomEntry(STATE_CUSTOM_TYPE, {
			customType: STATE_CUSTOM_TYPE,
			session: createSession({ name: "外部写入" }),
		});
		await repository.persist(session);
		expect(appends).toHaveLength(2);
	});

	it("re-verifies against the latest entry from the cold path after removeCached", async () => {
		const { repository, appends } = createHarness();
		const session = createSession();
		await repository.persist(session);
		expect(appends).toHaveLength(1);

		repository.removeCached("team-session-1");

		const stringify = vi.spyOn(JSON, "stringify");
		await repository.persist(session);
		expect(appends).toHaveLength(1); // 冷路径对磁盘最新条目精确核对后仍不追加
		expect(stringify.mock.calls.length).toBeGreaterThanOrEqual(2); // 冷路径保留精确比较的双序列化
	});

	it("throws when the coordination runtime is unavailable", async () => {
		const { repository } = createHarness();
		const orphan = createSession({ coordinationRuntime: undefined });

		await expect(repository.persist(orphan)).rejects.toThrow("Team coordination conversation is unavailable");
	});
});
