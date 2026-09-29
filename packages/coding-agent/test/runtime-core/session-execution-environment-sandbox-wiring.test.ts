// ADR-0133 §5(TM-07):mode flip 时 session runtime 调 sandbox.clearSessionGrants 清本会话
// grant 缓存。session-execution-runtime.test.ts 的 fixture 手工覆盖了 sandbox 字段,锁定不到
// Node SDK 环境的这处生产接线——若有人从 node-session-execution-environment.ts 删掉它,
// 只有这里会红。
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSessionGrant, clearSessionGrants, findSessionGrant } from "@vetta/runtime-node/sandbox";
import { afterEach, describe, expect, it } from "vitest";
import { createCodingAgentNodeSessionExecutionEnvironment } from "../../src/host/tool-environment/node/node-session-execution-environment.js";

const GRANT_SESSION = "node-env-clear-grants-session";
const OTHER_SESSION = "node-env-clear-grants-other";

const grantRequest = {
	capability: "file.write" as const,
	toolName: "write",
	target: "outside.txt",
	resolvedTarget: `${process.cwd()}-outside`,
	grantRoot: `${process.cwd()}-outside`,
	reason: "wiring test",
};

describe("Node SDK 会话执行环境的沙箱授权缓存接线", () => {
	const temporaryRoots: string[] = [];

	afterEach(async () => {
		clearSessionGrants(GRANT_SESSION);
		clearSessionGrants(OTHER_SESSION);
		for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
	});

	it("环境暴露的 clearSessionGrants 清掉本会话缓存且不影响其他会话", async () => {
		const root = await mkdtemp(join(tmpdir(), "node-env-clear-grants-"));
		temporaryRoots.push(root);
		const environment = createCodingAgentNodeSessionExecutionEnvironment({
			sessionId: GRANT_SESSION,
			cwd: root,
			scenario: "cli",
		});
		try {
			addSessionGrant(GRANT_SESSION, grantRequest);
			addSessionGrant(OTHER_SESSION, grantRequest);
			expect(environment.sandbox.clearSessionGrants).toBeTypeOf("function");

			environment.sandbox.clearSessionGrants?.(GRANT_SESSION);

			expect(findSessionGrant(GRANT_SESSION, grantRequest)).toBeUndefined();
			expect(findSessionGrant(OTHER_SESSION, grantRequest)).toBeDefined();
		} finally {
			await environment.dispose();
		}
	});
});
