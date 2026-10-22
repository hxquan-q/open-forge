// Modified by The Open Forge contributors.
import { ipcMain } from "electron";
import type {
	MemoryCorrectRequest,
	MemoryDetailRequest,
	MemoryForgetRequest,
	MemoryListRequest,
	MemoryPolicyState,
	MemorySearchRequest,
} from "../../shared/memory.js";
import { MEMORY_CONTROL_CHANNELS } from "../../shared/memory.js";
import type { MemoryControlService } from "../memory/memory-control-service.js";

/**
 * 记忆控制面 IPC（TASK-0376）。所有输入在主进程校验后转发服务；
 * 错误按 Error.message 原样返回（稳定错误码文本由服务层保证），不吞错。
 */
export function registerMemoryIpc(service: MemoryControlService): () => void {
	const handlers: [string, (input: unknown) => unknown][] = [
		[MEMORY_CONTROL_CHANNELS.LIST, (input) => service.list((input ?? {}) as MemoryListRequest)],
		[MEMORY_CONTROL_CHANNELS.SEARCH, (input) => service.search((input ?? {}) as MemorySearchRequest)],
		[MEMORY_CONTROL_CHANNELS.DETAIL, (input) => service.detail((input ?? {}) as MemoryDetailRequest)],
		[MEMORY_CONTROL_CHANNELS.CORRECT, (input) => service.correct((input ?? {}) as MemoryCorrectRequest)],
		[MEMORY_CONTROL_CHANNELS.FORGET, (input) => service.forget((input ?? {}) as MemoryForgetRequest)],
		[
			MEMORY_CONTROL_CHANNELS.POLICY,
			(input) =>
				input === null || input === undefined
					? service.readPolicy()
					: service.setPolicy((input ?? {}) as MemoryPolicyState),
		],
	];
	const disposers = handlers.map(([channel, handler]) => {
		const wrapped = (_event: Electron.IpcMainInvokeEvent, input: unknown) => handler(input);
		ipcMain.handle(channel, wrapped);
		return () => ipcMain.removeHandler(channel);
	});
	return () => {
		for (const dispose of disposers) dispose();
	};
}
