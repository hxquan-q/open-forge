// Copyright The Open Forge contributors.
/**
 * ac-fence fence-log 追加器（ac-fence-spec §5）——纯模块，fs 经 FenceLogIo 注入。
 *
 * 位置：项目仓 docs/ac/fence-log.jsonl（每行一条 JSON）。
 * 写入时机：judge 返回 block 时；fire-and-forget（handler 返回之后执行，失败仅 console.warn——
 * fail-open 语义下日志丢失可容忍，L1.5 审计仍会抓到同一越权）。
 *
 * inputDigest = 关键输入字段的短摘要（path 原样 / command 截断 200 字符 / spawn 只留标识），
 * 不落完整 toolInput（防泄密钥类内容）。
 *
 * 为什么不直接 import node:fs：插件 bundle 运行在宿主 renderer realm（浏览器环境），
 * node 内建会被 externalize 成空壳；文件能力一律走 ctx.fs（宿主中转，见 src/fence.ts 装配）。
 */

export interface FenceLogEntry {
	/** ISO 8601 时间戳。 */
	ts: string;
	sessionId: string;
	agentId?: string;
	taskName?: string;
	/** 宿主工具名（event.tool.hostName）。 */
	tool: string;
	/** 关键输入字段的短摘要（不落完整 toolInput）。 */
	inputDigest: string;
	/** block reason。 */
	reason: string;
	/** 项目根（event.cwd）。 */
	project: string;
}

/** fence-log 落盘所需的最小 fs 能力（由 src/fence.ts 用 ctx.fs 装配；测试用 node:fs 装配）。 */
export interface FenceLogIo {
	readFile(path: string): Promise<string>;
	writeFile(path: string, content: string): Promise<void>;
	createDirectory(path: string): Promise<void>;
	stat(path: string): Promise<{ size: number } | null>;
}

/** 摘要生成：file-edit 取 path 原样；shell 取 command 截断 200 字符；spawn 只留 task_name/agent_type；其余取 JSON 截断。 */
export function inputDigest(toolKind: string, hostName: string, input: unknown): string {
	if (typeof input === "object" && input !== null) {
		const record = input as Record<string, unknown>;
		if (toolKind === "agent" || hostName === "spawn_agent") {
			// spawn 输入含完整任务书（task/constraints 等）——只留标识字段，不落全文
			const parts: string[] = [];
			if (typeof record.task_name === "string") parts.push(`task_name=${record.task_name}`);
			if (typeof record.agent_type === "string") parts.push(`agent_type=${record.agent_type}`);
			return parts.length > 0 ? parts.join(" ") : "spawn=<no identifiers>";
		}
		const path = typeof record.path === "string" ? record.path : typeof record.file_path === "string" ? record.file_path : null;
		if (path !== null) return `path=${path}`;
		const command = typeof record.command === "string" ? record.command : null;
		if (command !== null) return `command=${command.slice(0, 200)}`;
	}
	try {
		return `input=${JSON.stringify(input).slice(0, 200)}`;
	} catch {
		return `input=<unserializable ${toolKind}/${hostName}>`;
	}
}

/**
 * 创建追加器：appendFenceLog(project, entry) fire-and-forget。
 * 宿主 fs 无 appendFile——读旧拼接重写（单会话写者下足够；并发丢行可容忍，spec §5）。
 */
export function createFenceLogAppender(io: FenceLogIo): (project: string, entry: Omit<FenceLogEntry, "ts" | "project">) => void {
	return (project, entry) => {
		// 异步任务不 await——判定 handler 返回后再落盘
		void (async () => {
			try {
				const dir = `${project}/docs/ac`;
				const file = `${dir}/fence-log.jsonl`;
				let previous = "";
				const stat = await io.stat(file).catch(() => null);
				if (stat && stat.size > 0) {
					previous = await io.readFile(file);
					if (previous.length > 0 && !previous.endsWith("\n")) previous += "\n";
				} else {
					await io.createDirectory(dir).catch(() => undefined);
				}
				const line = `${JSON.stringify({ ts: new Date().toISOString(), project, ...entry })}\n`;
				await io.writeFile(file, previous + line);
			} catch (error) {
				console.warn(
					`[ac-fence] fence-log append failed for ${entry.tool}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		})();
	};
}
