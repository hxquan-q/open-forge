// Modified by The Open Forge contributors.
import type {
	MemoryCorrectRequest,
	MemoryDetailResult,
	MemoryForgetRequest,
	MemoryListRequest,
	MemoryListResult,
	MemoryPolicyState,
	MemorySearchRequest,
	MemorySearchResult,
} from "@/shared/memory";

/**
 * 记忆控制面 Renderer 取数口（TASK-0377）：只包 window.vetta.memoryControl，
 * 不缓存负结果（遗忘/更正后立即重读），错误原样上抛由页面呈现。
 */
export const memoryControlClient = {
	listMemories: (request?: MemoryListRequest): Promise<MemoryListResult> =>
		window.vetta.memoryControl.listMemories(request),
	searchMemories: (request: MemorySearchRequest): Promise<MemorySearchResult> =>
		window.vetta.memoryControl.searchMemories(request),
	getMemoryDetail: (memoryId: string): Promise<MemoryDetailResult> =>
		window.vetta.memoryControl.getMemoryDetail(memoryId),
	correctMemory: (request: MemoryCorrectRequest) => window.vetta.memoryControl.correctMemory(request),
	forgetMemory: (request: MemoryForgetRequest) => window.vetta.memoryControl.forgetMemory(request),
	getMemoryPolicy: (): Promise<MemoryPolicyState> => window.vetta.memoryControl.getMemoryPolicy(),
	setMemoryPolicy: (state: MemoryPolicyState): Promise<MemoryPolicyState> =>
		window.vetta.memoryControl.setMemoryPolicy(state),
};
