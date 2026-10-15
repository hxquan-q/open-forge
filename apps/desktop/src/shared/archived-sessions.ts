// Copyright The Open Forge contributors.
/**
 * 会话归档的纯领域模型。
 *
 * 归档是「列表整理」而不是数据操作：它把会话从侧边栏隐藏，磁盘上的 JSONL 原样保留，
 * 与加密导出（.ofar，session-archive）毫无关系。记录落在
 * ~/.vetta/desktop-app/archived-sessions.json —— 与会话标签同属「用户资产」，
 * 只读来源（远端/已归档项目）的会话一样能被归档，重装应用也不丢失。
 *
 * label 是归档那一刻的显示名快照：设置页据此直接列出行，无需扫描磁盘或连接远端
 * （会话可能属于已归档项目或远端工作区，那时读盘/连远端都不可靠）。
 *
 * 这里只放不依赖 fs/electron 的纯函数，主进程仓库与渲染进程共用同一套语义。
 */

export const ARCHIVED_SESSIONS_SCHEMA_VERSION = 1;

/** 归档变更广播通道：主进程在每次写盘后推送最新快照。 */
export const ARCHIVED_SESSIONS_CHANGED_CHANNEL = "vetta:archived-sessions:changed";

/** 团队会话的身份快照：设置页据此走团队级删除（连同成员会话与团队记录）。 */
export interface ArchivedSessionTeam {
	readonly teamId: string;
	readonly teamSessionId: string;
}

export interface ArchivedSessionEntry {
	/** 会话 JSONL 的磁盘路径，同时是条目标识。 */
	path: string;
	/** 归档时的会话显示名快照；设置页在磁盘不可达时也能列出条目。 */
	label: string;
	/** 会话所属工作目录，用于在设置页区分同名会话。 */
	cwd: string;
	/** epoch ms；一律按它倒序（最近归档在前），让新归档的条目稳定停在最上面。 */
	archivedAt: number;
	/** 仅团队会话携带；普通会话删除走会话运行时，不需要它。 */
	team?: ArchivedSessionTeam;
}

export interface ArchivedSessionsSnapshot {
	sessions: readonly ArchivedSessionEntry[];
}

export function emptyArchivedSessions(): ArchivedSessionsSnapshot {
	return { sessions: [] };
}

function sortByArchivedAtDesc(sessions: ArchivedSessionEntry[]): ArchivedSessionEntry[] {
	return [...sessions].sort((a, b) => b.archivedAt - a.archivedAt || a.path.localeCompare(b.path));
}

/** 团队身份要么两个字段都在、要么不要：半个身份会让设置页把团队会话交给普通删除。 */
export function normalizeArchiveTeam(
	team: { readonly teamId?: string; readonly teamSessionId?: string } | undefined,
): ArchivedSessionTeam | undefined {
	if (!team) return undefined;
	const teamId = team.teamId?.trim() ?? "";
	const teamSessionId = team.teamSessionId?.trim() ?? "";
	return teamId.length > 0 && teamSessionId.length > 0 ? { teamId, teamSessionId } : undefined;
}

function sanitizeTeam(value: unknown): ArchivedSessionTeam | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const input = value as Partial<ArchivedSessionTeam>;
	return normalizeArchiveTeam({
		teamId: typeof input.teamId === "string" ? input.teamId : "",
		teamSessionId: typeof input.teamSessionId === "string" ? input.teamSessionId : "",
	});
}

/** 坏条目只丢自己：一个写坏的字段不该让用户的整份归档列表消失。 */
function sanitizeEntry(value: unknown): ArchivedSessionEntry | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	const input = value as Partial<ArchivedSessionEntry>;
	if (typeof input.path !== "string" || input.path.trim().length === 0) return null;
	const archivedAt =
		typeof input.archivedAt === "number" && Number.isFinite(input.archivedAt) && input.archivedAt > 0
			? input.archivedAt
			: 0;
	// 团队标记写坏只丢标记不丢条目：会话本身照样能从设置页恢复。
	const team = sanitizeTeam(input.team);
	return {
		path: input.path,
		label: typeof input.label === "string" ? input.label : "",
		cwd: typeof input.cwd === "string" ? input.cwd : "",
		archivedAt,
		...(team ? { team } : {}),
	};
}

export function parseArchivedSessionsFile(value: unknown): ArchivedSessionsSnapshot {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return emptyArchivedSessions();
	const input = value as { version?: unknown; sessions?: unknown };
	if (input.version !== ARCHIVED_SESSIONS_SCHEMA_VERSION) return emptyArchivedSessions();

	const sessions: ArchivedSessionEntry[] = [];
	const seen = new Set<string>();
	if (Array.isArray(input.sessions)) {
		for (const raw of input.sessions) {
			const entry = sanitizeEntry(raw);
			// 死路径保留：会话文件可能只是暂时不可见（外部盘未挂载），据此清理是危险的。
			if (!entry || seen.has(entry.path)) continue;
			seen.add(entry.path);
			sessions.push(entry);
		}
	}

	return { sessions: sortByArchivedAtDesc(sessions) };
}

export function serializeArchivedSessions(snapshot: ArchivedSessionsSnapshot): {
	version: typeof ARCHIVED_SESSIONS_SCHEMA_VERSION;
	sessions: readonly ArchivedSessionEntry[];
} {
	return { version: ARCHIVED_SESSIONS_SCHEMA_VERSION, sessions: snapshot.sessions };
}

export interface ArchiveSessionInput {
	path: string;
	label?: string;
	cwd?: string;
	/** 团队会话的身份；两个字段齐全才落盘（见 normalizeArchiveTeam）。 */
	teamId?: string;
	teamSessionId?: string;
	archivedAt: number;
}

/** 幂等：重复归档同一条会话不产生任何变化，调用方拿回同一个快照。 */
export function archiveSession(
	snapshot: ArchivedSessionsSnapshot,
	input: ArchiveSessionInput,
): ArchivedSessionsSnapshot {
	const path = input.path.trim();
	if (path.length === 0) return snapshot;
	if (snapshot.sessions.some((entry) => entry.path === path)) return snapshot;
	const team = normalizeArchiveTeam({ teamId: input.teamId, teamSessionId: input.teamSessionId });
	const entry: ArchivedSessionEntry = {
		path,
		label: input.label?.trim() ?? "",
		cwd: input.cwd ?? "",
		archivedAt: input.archivedAt,
		...(team ? { team } : {}),
	};
	return { sessions: sortByArchivedAtDesc([...snapshot.sessions, entry]) };
}

/** 恢复归档：条目回到侧边栏（置顶等本地状态原样保留，归档从未改动过它们）。 */
export function unarchiveSession(snapshot: ArchivedSessionsSnapshot, sessionPath: string): ArchivedSessionsSnapshot {
	const path = sessionPath.trim();
	if (path.length === 0) return snapshot;
	const sessions = snapshot.sessions.filter((entry) => entry.path !== path);
	return sessions.length === snapshot.sessions.length ? snapshot : { sessions };
}

/** 会话被删除时调用，清掉它留下的归档标记（与标签的 forget 语义一致）。 */
export function removeArchivedSessions(
	snapshot: ArchivedSessionsSnapshot,
	sessionPaths: Iterable<string>,
): ArchivedSessionsSnapshot {
	const doomed = new Set(sessionPaths);
	if (doomed.size === 0) return snapshot;
	let changed = false;
	const sessions = snapshot.sessions.filter((entry) => {
		if (!doomed.has(entry.path)) return true;
		changed = true;
		return false;
	});
	return changed ? { sessions } : snapshot;
}

/** 供侧边栏过滤使用的路径集合。 */
export function archivedSessionPaths(snapshot: ArchivedSessionsSnapshot): ReadonlySet<string> {
	return new Set(snapshot.sessions.map((entry) => entry.path));
}
