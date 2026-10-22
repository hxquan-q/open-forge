// Modified by The Open Forge contributors.
import type { IpcRenderer } from "electron";
import type {
	MemoryForgetRequest,
	MemoryListRequest,
	MemoryPolicyState,
	MemorySearchRequest,
} from "../../shared/memory.js";
import { MEMORY_CONTROL_CHANNELS } from "../../shared/memory.js";
import type { DesktopApi } from "../api.js";

export function createMemoryControlApi(ipc: IpcRenderer): Pick<DesktopApi, "memoryControl"> {
	return {
		memoryControl: {
			listMemories: (request?: MemoryListRequest) => ipc.invoke(MEMORY_CONTROL_CHANNELS.LIST, request ?? {}),
			searchMemories: (request: MemorySearchRequest) => ipc.invoke(MEMORY_CONTROL_CHANNELS.SEARCH, request),
			getMemoryDetail: (memoryId: string) =>
				ipc.invoke(MEMORY_CONTROL_CHANNELS.DETAIL, { memoryId } satisfies { memoryId: string }),
			correctMemory: (request: { memoryId: string; expectedRevision: number; content: string }) =>
				ipc.invoke(MEMORY_CONTROL_CHANNELS.CORRECT, request),
			forgetMemory: (request: MemoryForgetRequest) => ipc.invoke(MEMORY_CONTROL_CHANNELS.FORGET, request),
			getMemoryPolicy: () => ipc.invoke(MEMORY_CONTROL_CHANNELS.POLICY, null),
			setMemoryPolicy: (state: MemoryPolicyState) => ipc.invoke(MEMORY_CONTROL_CHANNELS.POLICY, state),
		},
	};
}
