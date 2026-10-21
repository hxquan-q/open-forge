// Modified by The Open Forge contributors.
import chalk from "chalk";
import { CONFIG_DIR_NAME } from "../../identity.js";
import type { ResourceAccessPort } from "../contracts/resource-access.js";

export async function resolvePromptInput(
	access: ResourceAccessPort,
	input: string | undefined,
	description: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	if (!input) return undefined;
	if (!(await access.files.stat(input, { signal }))) return input;
	try {
		return await access.files.readText(input, { signal });
	} catch (error) {
		signal?.throwIfAborted();
		console.error(chalk.yellow(`Warning: Could not read ${description} file ${input}: ${error}`));
		return input;
	}
}

export async function loadProjectContextFiles(
	access: ResourceAccessPort,
	cwd: string,
	agentDir: string,
	signal?: AbortSignal,
): Promise<Array<{ path: string; content: string }>> {
	const ancestors: string[] = [];
	let currentDir = access.paths.resolve(cwd);
	while (true) {
		ancestors.unshift(currentDir);
		const parent = access.paths.dirname(currentDir);
		if (parent === currentDir) break;
		currentDir = parent;
	}
	const directories = [agentDir, ...ancestors.filter((dir) => dir !== agentDir)];
	const paths = [
		...new Set(directories.flatMap((dir) => ["CLAUDE.md", "AGENTS.md"].map((name) => access.paths.join(dir, name)))),
	];
	const results: Array<{ path: string; content: string } | undefined> = new Array(paths.length);
	let next = 0;
	const controller = new AbortController();
	const onAbort = (): void => controller.abort(signal?.reason);
	if (signal?.aborted) onAbort();
	else signal?.addEventListener("abort", onAbort, { once: true });
	const worker = async (): Promise<void> => {
		try {
			while (next < paths.length) {
				controller.signal.throwIfAborted();
				const index = next++;
				const filePath = paths[index];
				if (!(await access.files.stat(filePath, { signal: controller.signal }))) continue;
				try {
					results[index] = {
						path: filePath,
						content: await access.files.readText(filePath, { signal: controller.signal }),
					};
				} catch (error) {
					controller.signal.throwIfAborted();
					console.error(chalk.yellow(`Warning: Could not read ${filePath}: ${error}`));
				}
			}
		} catch (error) {
			controller.abort(error);
			throw error;
		}
	};
	try {
		// All admitted reads settle before returning; a failure cancels siblings and prevents new work.
		await Promise.allSettled(Array.from({ length: Math.min(4, paths.length) }, worker));
		controller.signal.throwIfAborted();
	} finally {
		signal?.removeEventListener("abort", onAbort);
	}

	return results.filter((result): result is { path: string; content: string } => result !== undefined);
}

export async function discoverPromptFile(
	access: ResourceAccessPort,
	cwd: string,
	agentDir: string,
	filename: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const projectPath = access.paths.join(cwd, CONFIG_DIR_NAME, filename);
	if (await access.files.stat(projectPath, { signal })) return projectPath;
	const globalPath = access.paths.join(agentDir, filename);
	return (await access.files.stat(globalPath, { signal })) ? globalPath : undefined;
}
