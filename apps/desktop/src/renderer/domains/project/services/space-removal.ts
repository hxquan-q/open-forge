// Copyright The Open Forge contributors.
import type { spacesAtom } from "@shared/store/spaces";
import { spaceOf } from "@shared/store/spaces";
import type { ExtractAtomValue } from "jotai";

/**
 * 工作空间破坏性移除的内容盘点。ADR-0156：团队会话不进空间，归属键统一为
 * 会话路径——本地裁剪版只覆盖普通维度（在册项目、归档项目、独立会话），
 * 不读侧栏团队会话、也不做团队路径排除。
 */
export async function readSpaceRemoval(state: ExtractAtomValue<typeof spacesAtom>, id: string, cwd: string) {
	const [config, sessions] = await Promise.all([
		window.vetta.config.get(),
		cwd ? window.vetta.session.listSessions(cwd) : Promise.resolve([]),
	]);
	const projectInSpace = (project: { path: string }) => spaceOf(state, { kind: "project", key: project.path }) === id;
	return {
		projects: config.projects.filter(projectInSpace),
		archived: config.archivedProjects.filter(projectInSpace),
		sessions: sessions.filter((session) => spaceOf(state, { kind: "conversation", key: session.path }) === id),
	};
}

export type SpaceRemovalContents = Awaited<ReturnType<typeof readSpaceRemoval>>;

/** 盘点内容里仍在运行的会话名称列表：有一个都不删，让用户先停掉或等它们结束。 */
export async function runningSpaceConversations(contents: SpaceRemovalContents): Promise<string[]> {
	const running = new Set(await window.vetta.session.listRunning());
	return contents.sessions
		.filter((session) => running.has(session.path))
		.map((session) => session.name || session.firstMessage || session.path);
}
