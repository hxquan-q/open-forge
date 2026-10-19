// Copyright The Open Forge contributors.

/**
 * 智能客服页侧栏（历史会话栏）收起状态的落盘读写（A 组 AC-1~5，02-plan §2.5）。
 *
 * 介质是 renderer 的 localStorage：单个布尔的 UI 铬件状态，比 bottom-panel 的
 * entries map 还小一个数量级。sanitize 风格照 bottom-panel-persistence 先例，
 * 但刻意不复用其模块——那是底部面板的布局事实源，这里是单页面 UI 状态，
 * 不建 atom、不进 shared/store（无跨组件消费者）。
 */

export const WEKNORA_SIDEBAR_STORAGE_KEY = "vetta-weknora-sidebar";

/** 结构版本：形状变更时递增；旧版本一律按「无记录」处理（回落展开）。 */
const WEKNORA_SIDEBAR_SCHEMA_VERSION = 1;

interface PersistedWeKnoraSidebarState {
	readonly version: number;
	readonly collapsed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * 结构不可信（非对象 / 缺字段 / 版本不符 / 字段类型错）时返回 `null`；
 * 调方按「无记录」处理，而不是崩在渲染里（AC-3：畸形输入安全回落展开）。
 */
export function sanitizeWeKnoraSidebarState(value: unknown): boolean | null {
	if (!isRecord(value)) return null;
	if (value.version !== WEKNORA_SIDEBAR_SCHEMA_VERSION) return null;
	if (typeof value.collapsed !== "boolean") return null;
	return value.collapsed;
}

/** 解析落盘原文；一切不可信输入都回落「展开」（首次使用 / 记录损坏时的默认态）。 */
export function parseWeKnoraSidebarState(raw: string | null): boolean {
	if (!raw) return false;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return false;
	}
	return sanitizeWeKnoraSidebarState(parsed) ?? false;
}

export function serializeWeKnoraSidebarState(collapsed: boolean): string {
	const state: PersistedWeKnoraSidebarState = { version: WEKNORA_SIDEBAR_SCHEMA_VERSION, collapsed };
	return JSON.stringify(state);
}

export function readPersistedWeKnoraSidebarCollapsed(): boolean {
	try {
		return parseWeKnoraSidebarState(localStorage.getItem(WEKNORA_SIDEBAR_STORAGE_KEY));
	} catch {
		return false;
	}
}

export function persistWeKnoraSidebarCollapsed(collapsed: boolean): void {
	try {
		localStorage.setItem(WEKNORA_SIDEBAR_STORAGE_KEY, serializeWeKnoraSidebarState(collapsed));
	} catch {
		// ignore quota / private mode（照 bottom-panel 先例：落盘失败不阻断 UI 切换）
	}
}
