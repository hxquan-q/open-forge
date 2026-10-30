// Copyright The Open Forge contributors.
import { atom, getDefaultStore } from "jotai";

/**
 * 工作区模式（IA 定稿：apps/desktop/.impeccable/surfaces/workspace-modes.md）。
 * coding 是「Allstar自主开发」版块（原「代码」档）：会话右栏保持执行/预览面板；
 * work（文档与研究）把会话右栏换成 Plan/Sources/Artifacts/Review 插槽面板，是默认档。
 * 档位是项目级偏好，只在新会话创建时决定解释模式与工具面，不改变已开会话、不中断执行；
 * 写入一律走 {@link enterWorkspaceSection}（「新会话」类入口回落 work；coding 由版块内的
 * 创建动作写入——版块入口本身已改为导航 /allstar 首页，不再直接落新会话页）。
 */

export const WORKSPACE_MODES = ["coding", "work"] as const;
export type WorkspaceMode = (typeof WORKSPACE_MODES)[number];
/**
 * 默认档是 work（文档与研究）。存量存储只可能有 work 记录（旧默认 coding 从不落盘，
 * writeWorkspaceMode 对默认档只删不写），翻转默认无需迁移。
 */
export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = "work";
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

/**
 * 版块入口的统一写入点：「新会话」类入口进 work（默认档，等于清除该项目记录），
 * 侧边栏「Allstar自主开发」入口进 coding。集中在此，入口侧不再各自手写 atom 更新。
 */
export function enterWorkspaceSection(cwd: string, mode: WorkspaceMode): void {
	getDefaultStore().set(workspaceModeByProjectAtom, (prev) => writeWorkspaceMode(prev, cwd, mode));
}

/**
 * 新建 code 会话的创建意图（BUG-0158 / 审计 F01-F02）：由创建入口经
 * {@link beginCodingSessionCreation} 登记，版块态布局按 nonce 消费一次——贯穿
 * 新会话页到会话提交；连续新建各自产生新意图。打开既有会话不产生意图。
 */
export interface CodingSessionCreateIntent {
	readonly cwd: string;
	readonly nonce: number;
}

export const codingSessionCreateIntentAtom = atom<CodingSessionCreateIntent | null>(null);

let codingIntentNonce = 0;

/** 创建 code 会话的统一入口：写 coding 档并登记一次性布局初始化意图。 */
export function beginCodingSessionCreation(cwd: string): void {
	enterWorkspaceSection(cwd, "coding");
	codingIntentNonce += 1;
	getDefaultStore().set(codingSessionCreateIntentAtom, { cwd, nonce: codingIntentNonce });
}

/**
 * 版块态布局当前是否激活（code 语境：coding 会话、团队会话路由、开发档新会话页，
 * 判定见 root-layout 的 useCodingSessionLayout，唯一写入方也是它）。版块态布局是
 * 一次性初始化：进入时收左栏、开右栏，离开时不做任何回写（左右栏状态此后完全
 * 跟随用户手动操作）。活动面板宽度联动读它——active 期间不把临时收起的侧栏恢复
 * 展开。
 */
export const codingLayoutActiveAtom = atom<boolean>(false);
