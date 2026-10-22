// Modified by The Open Forge contributors.
import type {
	MemoryCorrectRequest,
	MemoryCorrectResult,
	MemoryDetailResult,
	MemoryForgetRequest,
	MemoryForgetResult,
	MemoryListRequest,
	MemoryListResult,
	MemoryPolicyState,
	MemorySearchRequest,
	MemorySearchResult,
} from "../../shared/memory.js";

export interface DesktopMemoryControlApi {
	listMemories: (request?: MemoryListRequest) => Promise<MemoryListResult>;
	searchMemories: (request: MemorySearchRequest) => Promise<MemorySearchResult>;
	getMemoryDetail: (memoryId: string) => Promise<MemoryDetailResult>;
	correctMemory: (request: MemoryCorrectRequest) => Promise<MemoryCorrectResult>;
	forgetMemory: (request: MemoryForgetRequest) => Promise<MemoryForgetResult>;
	getMemoryPolicy: () => Promise<MemoryPolicyState>;
	setMemoryPolicy: (state: MemoryPolicyState) => Promise<MemoryPolicyState>;
}
