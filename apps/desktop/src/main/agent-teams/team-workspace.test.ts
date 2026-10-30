// Copyright The Open Forge contributors.
/**
 * Team 会话工作区解析的校验名单合同（BUG-0163）：开发册（config.allstarProjects）
 * 项目与普通册项目一样可作为 Team 会话工作区——F08 后版块新建目标取自开发册，
 * 名单不含开发册时 code 模式团队会话直接创建失败。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/desktop-config-store.js", () => ({
	readDesktopConfig: async () => ({
		projects: [{ path: "C:/ordinary" }],
		allstarProjects: [{ path: "C:/dev-only" }],
	}),
}));

import { resolveTeamSessionWorkspace } from "./team-workspace.js";

describe("resolveTeamSessionWorkspace", () => {
	it("开发册项目可作为 Team 会话工作区", async () => {
		const workspace = await resolveTeamSessionWorkspace("team-1", "session-1", {
			kind: "project",
			path: "C:/dev-only",
		});
		expect(workspace).toEqual({ kind: "project", id: "C:/dev-only", cwd: "C:/dev-only" });
	});

	it("普通册项目照常解析；名单外路径仍拒绝", async () => {
		const workspace = await resolveTeamSessionWorkspace("team-1", "session-1", {
			kind: "project",
			path: "C:/ordinary",
		});
		expect(workspace).toEqual({ kind: "project", id: "C:/ordinary", cwd: "C:/ordinary" });

		await expect(
			resolveTeamSessionWorkspace("team-1", "session-1", { kind: "project", path: "C:/unknown" }),
		).rejects.toThrow("Selected Team workspace project is unavailable");
	});
});
