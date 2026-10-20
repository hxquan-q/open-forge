// Copyright The Open Forge contributors.

import { ipcMain, type WebContents } from "electron";
import type { WeKnoraConfigPatch } from "../weknora/config.js";
import {
	getWeKnoraService,
	type WeKnoraAskInput,
	type WeKnoraDeleteSessionInput,
	type WeKnoraGetChunkInput,
	type WeKnoraGetFileInput,
	type WeKnoraListParams,
	type WeKnoraLoadMessagesInput,
	type WeKnoraService,
} from "../weknora/service.js";

/** 频道名遵循 `vetta:<domain>:<kebab-action>`（02-plan §3.2）。 */
export const WEKNORA_CHANNELS = {
	GET_CONFIG: "vetta:weknora:get-config",
	SET_CONFIG: "vetta:weknora:set-config",
	SET_API_KEY: "vetta:weknora:set-api-key",
	LIST_AGENTS: "vetta:weknora:list-agents",
	LIST_SESSIONS: "vetta:weknora:list-sessions",
	LOAD_MESSAGES: "vetta:weknora:load-messages",
	DELETE_SESSION: "vetta:weknora:delete-session",
	GET_CHUNK: "vetta:weknora:get-chunk",
	GET_FILE: "vetta:weknora:get-file",
	ASK: "vetta:weknora:ask",
	CANCEL: "vetta:weknora:cancel",
	STREAM_EVENT: "vetta:weknora:stream-event",
} as const;

/** 需要 teardown 注销的 invoke 频道；`stream-event` 是单向推送，不注册 handler。 */
export const WEKNORA_INVOKE_CHANNELS = [
	WEKNORA_CHANNELS.GET_CONFIG,
	WEKNORA_CHANNELS.SET_CONFIG,
	WEKNORA_CHANNELS.SET_API_KEY,
	WEKNORA_CHANNELS.LIST_AGENTS,
	WEKNORA_CHANNELS.LIST_SESSIONS,
	WEKNORA_CHANNELS.LOAD_MESSAGES,
	WEKNORA_CHANNELS.DELETE_SESSION,
	WEKNORA_CHANNELS.GET_CHUNK,
	WEKNORA_CHANNELS.GET_FILE,
	WEKNORA_CHANNELS.ASK,
	WEKNORA_CHANNELS.CANCEL,
] as const;

const MAX_API_KEY_LENGTH = 4096;

/**
 * 注册智能客服 IPC 频道，返回 teardown。
 *
 * 只做注册、最小入参校验、转调 `WeKnoraService`；业务逻辑不在这里（见 `main/ipc/AGENTS.md`）。
 * 流事件照抄 scheduler 三段式：主进程自产事件流 → `webContents.send`（02-plan §3.4）。
 */
export function registerWeKnoraIpc(
	webContents: WebContents,
	service: WeKnoraService = getWeKnoraService(),
): () => void {
	const unsubscribe = service.onStreamEvent((event) => {
		webContents.send(WEKNORA_CHANNELS.STREAM_EVENT, event);
	});

	ipcMain.handle(WEKNORA_CHANNELS.GET_CONFIG, async () => service.getConfig());

	ipcMain.handle(WEKNORA_CHANNELS.SET_CONFIG, async (_event, patch: unknown) => {
		await service.setConfig(parseConfigPatch(patch));
	});

	ipcMain.handle(WEKNORA_CHANNELS.SET_API_KEY, async (_event, apiKey: unknown) => {
		service.setApiKey(parseApiKey(apiKey));
	});

	ipcMain.handle(WEKNORA_CHANNELS.LIST_AGENTS, async (_event, params: unknown) =>
		service.listAgents(parseListParams(params)),
	);

	ipcMain.handle(WEKNORA_CHANNELS.LIST_SESSIONS, async (_event, params: unknown) =>
		service.listSessions(parseListParams(params)),
	);

	ipcMain.handle(WEKNORA_CHANNELS.LOAD_MESSAGES, async (_event, input: unknown) =>
		service.loadMessages(parseLoadMessagesInput(input)),
	);

	// AC-8：删除会话。薄层转调（删除的确认/禁删判定/失败反馈都在渲染层，这里零业务逻辑）。
	ipcMain.handle(WEKNORA_CHANNELS.DELETE_SESSION, async (_event, input: unknown) =>
		service.deleteSession(parseDeleteSessionInput(input)),
	);

	// AC-14：取 chunk 原文（只读数据面）。薄层转调（缓存与失败反馈在渲染层 chunkClient，这里零业务逻辑）。
	ipcMain.handle(WEKNORA_CHANNELS.GET_CHUNK, async (_event, input: unknown) =>
		service.getChunkById(parseGetChunkInput(input)),
	);

	// F3 v2：取内嵌图片（只读数据面，data URL）。薄层转调（缓存与失败回退在渲染层 fileClient / 弹层）。
	ipcMain.handle(WEKNORA_CHANNELS.GET_FILE, async (_event, input: unknown) =>
		service.getFileData(parseGetFileInput(input)),
	);

	ipcMain.handle(WEKNORA_CHANNELS.ASK, async (_event, input: unknown) => service.ask(parseAskInput(input)));

	ipcMain.handle(WEKNORA_CHANNELS.CANCEL, async (_event, input: unknown) => {
		service.cancel(parseCancelInput(input).requestId);
	});

	return () => {
		unsubscribe();
		for (const channel of WEKNORA_INVOKE_CHANNELS) ipcMain.removeHandler(channel);
	};
}

// ── 入参最小校验：不信任 renderer（02-plan §3.4 / 票内要求 6） ──

function requireObject(value: unknown, channel: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${channel} requires an object argument`);
	}
	return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string`);
	return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
		throw new Error(`${field} must be a positive integer`);
	}
	return value;
}

function parseConfigPatch(value: unknown): WeKnoraConfigPatch {
	const input = requireObject(value, "set-config");
	const patch: WeKnoraConfigPatch = {};
	if (input.baseUrl !== undefined) patch.baseUrl = requireNonEmptyString(input.baseUrl, "baseUrl");
	if (input.defaultAgentId !== undefined) {
		patch.defaultAgentId = requireNonEmptyString(input.defaultAgentId, "defaultAgentId");
	}
	if (input.pageSize !== undefined) patch.pageSize = requirePositiveInteger(input.pageSize, "pageSize");
	return patch;
}

function parseApiKey(value: unknown): string {
	const apiKey = requireNonEmptyString(value, "apiKey");
	if (apiKey.length > MAX_API_KEY_LENGTH) throw new Error("apiKey is too long");
	return apiKey;
}

function parseListParams(value: unknown): WeKnoraListParams {
	if (value === undefined || value === null) return {};
	const input = requireObject(value, "list params");
	const params: WeKnoraListParams = {};
	if (input.page !== undefined) params.page = requirePositiveInteger(input.page, "page");
	if (input.pageSize !== undefined) params.pageSize = requirePositiveInteger(input.pageSize, "pageSize");
	return params;
}

function parseLoadMessagesInput(value: unknown): WeKnoraLoadMessagesInput {
	const input = requireObject(value, "load-messages");
	const parsed: WeKnoraLoadMessagesInput = { sessionId: requireNonEmptyString(input.sessionId, "sessionId") };
	if (input.limit !== undefined) parsed.limit = requirePositiveInteger(input.limit, "limit");
	// AC-6：翻页游标可选透出；一旦传入必须是合法非空字符串（畸形入参明确报错，不静默）。
	if (input.beforeTime !== undefined) {
		parsed.beforeTime = requireNonEmptyString(input.beforeTime, "beforeTime");
	}
	return parsed;
}

function parseDeleteSessionInput(value: unknown): WeKnoraDeleteSessionInput {
	const input = requireObject(value, "delete-session");
	return { sessionId: requireNonEmptyString(input.sessionId, "sessionId") };
}

function parseGetChunkInput(value: unknown): WeKnoraGetChunkInput {
	const input = requireObject(value, "get-chunk");
	return { chunkId: requireNonEmptyString(input.chunkId, "chunkId") };
}

function parseGetFileInput(value: unknown): WeKnoraGetFileInput {
	const input = requireObject(value, "get-file");
	return { fileRef: requireNonEmptyString(input.fileRef, "fileRef") };
}

function parseAskInput(value: unknown): WeKnoraAskInput {
	const input = requireObject(value, "ask");
	const query = requireNonEmptyString(input.query, "query");
	const parsed: WeKnoraAskInput = { query };
	if (input.sessionId !== undefined && input.sessionId !== null && input.sessionId !== "") {
		parsed.sessionId = requireNonEmptyString(input.sessionId, "sessionId");
	}
	// AC-18 v5：`agentId` 可选；一旦传入就必须是合法非空字符串。非法值（空串 / 非字符串）**明确报错，
	// 不静默吞掉**——「缺省」只指字段缺席（undefined），不含传了空串这种畸形入参。
	if (input.agentId !== undefined) parsed.agentId = requireNonEmptyString(input.agentId, "agentId");
	return parsed;
}

function parseCancelInput(value: unknown): { requestId: string } {
	const input = requireObject(value, "cancel");
	return { requestId: requireNonEmptyString(input.requestId, "requestId") };
}
