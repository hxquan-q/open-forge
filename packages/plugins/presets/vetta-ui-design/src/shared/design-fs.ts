// Copyright The Open Forge contributors.

/**
 * 设计目录级的写串行 + 单文件原子替换（TASK-0309 P0）。
 *
 * 同一份设计的落盘来自多个并发源：agent 工具（vetd_create / 改稿）、画布清单、
 * 导入、备注。插件 fs API 是逐文件 IPC，没有事务性——交错写会留下半写文件，清单
 * 与源码也可能互相脱节。这里按设计目录挂一条 promise 链：同目录写操作排队执行，
 * 不同目录互不阻塞。
 *
 * 原子性靠「写临时文件 → rename 覆盖」：宿主的 writeFile 不是一个原子动作，中断
 * （进程退出、IPC 断开）会留下截断的目标文件；rename 在同一卷上是原子的。队列不
 * 可重入——不要在队列任务里再排同一目录的任务（会等自己）；需要复合操作时把整段
 * 包进一个 withDesignWrite，叶子写直接用 atomicWriteFile。
 */
import type { PluginFsApi } from "@vetta-org/plugin-sdk";

const writeQueues = new Map<string, Promise<unknown>>();

/** 把对同一设计目录的一段（叶子）写操作排进串行队列，返回这段操作的结果。 */
export function withDesignWrite<T>(designDir: string, operation: () => Promise<T>): Promise<T> {
	const previous = writeQueues.get(designDir) ?? Promise.resolve();
	const run = previous.catch(() => undefined).then(operation);
	writeQueues.set(designDir, run.catch(() => undefined));
	return run;
}

let tempCounter = 0;

/**
 * 原子写单个文件：先写 `${path}.tmp-*` 再 rename 覆盖。
 *
 * 失败时尽力删掉临时文件；目标文件要么是旧内容、要么是完整新内容，不会是半截。
 * 父目录由宿主 writeFile 递归创建，临时文件与目标同目录、同卷。
 */
export async function atomicWriteFile(
	fs: PluginFsApi,
	filePath: string,
	content: string,
	encoding?: "utf8" | "base64",
): Promise<void> {
	const tempPath = `${filePath}.tmp-${Date.now().toString(36)}-${(tempCounter += 1).toString(36)}`;
	try {
		await fs.writeFile(tempPath, content, encoding);
		await fs.rename(tempPath, filePath);
	} catch (error) {
		await fs.delete(tempPath).catch(() => undefined);
		throw error;
	}
}

/** 排队 + 原子写的常用组合：一次调用就是一个队列任务。 */
export function queuedAtomicWrite(
	fs: PluginFsApi,
	designDir: string,
	filePath: string,
	content: string,
	encoding?: "utf8" | "base64",
): Promise<void> {
	return withDesignWrite(designDir, () => atomicWriteFile(fs, filePath, content, encoding));
}
