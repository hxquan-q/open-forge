// Copyright The Open Forge contributors.

import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

const WEKNORA_CHANNELS = {
	GET_CONFIG: "vetta:weknora:get-config",
	SET_CONFIG: "vetta:weknora:set-config",
	SET_API_KEY: "vetta:weknora:set-api-key",
	LIST_AGENTS: "vetta:weknora:list-agents",
	LIST_SESSIONS: "vetta:weknora:list-sessions",
	LOAD_MESSAGES: "vetta:weknora:load-messages",
	ASK: "vetta:weknora:ask",
	CANCEL: "vetta:weknora:cancel",
	STREAM_EVENT: "vetta:weknora:stream-event",
} as const;

export function createWeKnoraApi(ipc: IpcRenderer): Pick<DesktopApi, "weknora"> {
	return {
		weknora: {
			getConfig: () => ipc.invoke(WEKNORA_CHANNELS.GET_CONFIG),
			setConfig: (patch) => ipc.invoke(WEKNORA_CHANNELS.SET_CONFIG, patch),
			setApiKey: (apiKey) => ipc.invoke(WEKNORA_CHANNELS.SET_API_KEY, apiKey),
			listAgents: (params) => ipc.invoke(WEKNORA_CHANNELS.LIST_AGENTS, params),
			listSessions: (params) => ipc.invoke(WEKNORA_CHANNELS.LIST_SESSIONS, params),
			loadMessages: (input) => ipc.invoke(WEKNORA_CHANNELS.LOAD_MESSAGES, input),
			ask: (input) => ipc.invoke(WEKNORA_CHANNELS.ASK, input),
			cancel: (requestId) => ipc.invoke(WEKNORA_CHANNELS.CANCEL, { requestId }),
			onStreamEvent: (handler) => onIpcEvent(ipc, WEKNORA_CHANNELS.STREAM_EVENT, handler),
		},
	};
}
