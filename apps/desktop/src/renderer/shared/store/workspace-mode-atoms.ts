import { atom } from "jotai";

/**
 * 工作区模式（IA 定稿：apps/desktop/.impeccable/surfaces/workspace-modes.md）。
 * coding 即现状布局；work 把会话右栏换成 Plan/Sources/Artifacts/Review 插槽面板。
 * 模式是项目级 UI 偏好——只决定布局与面板内容，不改变会话、不中断执行。
 */

export const WORKSPACE_MODES = ["coding", "work"] as const;
export type WorkspaceMode = (typeof WORKSPACE_MODES)[number];
export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = "coding";
export const WORKSPACE_MODE_STORAGE_KEY = "vetta-workspace-mode";

export function normalizeWorkspaceMode(value: unknown): WorkspaceMode | null {
	return value === "coding" || value === "work" ? value : null;
}

function readWorkspaceModeMap(): Map<string, WorkspaceMode> {
	try {
		const raw = localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY);
		if (!raw) return new Map();
		const parsed: unknown = JSON.parse(raw);
		if (parsed == null || typeof parsed !== "object") return new Map();
		const map = new Map<string, WorkspaceMode>();
		for (const [cwd, value] of Object.entries(parsed)) {
			const mode = normalizeWorkspaceMode(value);
			if (mode) map.set(cwd, mode);
		}
		return map;
	} catch {
		return new Map();
	}
}

/** 不可变写入：默认模式不落盘，保持记录最小化。 */
export function writeWorkspaceMode(
	map: Map<string, WorkspaceMode>,
	cwd: string,
	mode: WorkspaceMode,
): Map<string, WorkspaceMode> {
	const next = new Map(map);
	if (mode === DEFAULT_WORKSPACE_MODE) {
		next.delete(cwd);
	} else {
		next.set(cwd, mode);
	}
	return next;
}

export function readWorkspaceModeFor(map: Map<string, WorkspaceMode>, cwd: string | null | undefined): WorkspaceMode {
	return (cwd ? map.get(cwd) : undefined) ?? DEFAULT_WORKSPACE_MODE;
}

const workspaceModeBaseAtom = atom<Map<string, WorkspaceMode>>(readWorkspaceModeMap());

/**
 * cwd → WorkspaceMode 的持久化映射（与 activity-atoms 的 localStorage 直写模式一致）。
 * 写入时同步落盘；接受 Map 或 (prev) => Map 更新函数。
 */
export const workspaceModeByProjectAtom = atom(
	(get) => get(workspaceModeBaseAtom),
	(
		get,
		set,
		next: Map<string, WorkspaceMode> | ((prev: Map<string, WorkspaceMode>) => Map<string, WorkspaceMode>),
	) => {
		const value = typeof next === "function" ? next(get(workspaceModeBaseAtom)) : next;
		set(workspaceModeBaseAtom, value);
		localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, JSON.stringify(Object.fromEntries(value)));
	},
);
