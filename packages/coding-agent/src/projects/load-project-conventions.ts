import { readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
	CURRENT_VETTA_PROJECT_SCHEMA_VERSION,
	conventionsFromManifest,
	gitignoreAdditionForVettaLocal,
	legacyProjectConventions,
	readVettaProjectManifest,
	type SharedProjectConventions,
	VETTA_LOCAL_PROJECT_DIRECTORY,
	VETTA_PROJECT_DIRECTORY,
	VETTA_PROJECT_MANIFEST_FILE,
	VettaProjectManifestError,
} from "./shared-project-conventions.js";

/**
 * 项目约定的磁盘装载（TASK-0020）。读取/写入都限定在 project root：
 * 清单路径经 `resolve`+`relative` 判界，任何越界请求直接拒绝。
 */

const GITIGNORE_FILE = ".gitignore";

/** 读取项目共享约定；无 `.vetta/` 或无清单时返回 v0 兼容默认。 */
export async function loadProjectConventions(projectRoot: string): Promise<SharedProjectConventions> {
	const root = resolve(projectRoot);
	const manifestPath = join(root, VETTA_PROJECT_DIRECTORY, VETTA_PROJECT_MANIFEST_FILE);
	if (!isWithinRoot(root, manifestPath)) {
		throw new VettaProjectManifestError("path-escape", `manifest path escapes project root: ${manifestPath}`);
	}
	try {
		await stat(manifestPath);
	} catch {
		return legacyProjectConventions(root);
	}
	const raw = await readFile(manifestPath, "utf8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new VettaProjectManifestError(
			"invalid-manifest",
			`project manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return conventionsFromManifest(root, readVettaProjectManifest(parsed));
}

/**
 * `.vetta-local/` 忽略引导：项目还没有忽略规则时追加标记段。
 * 已手写忽略的用户文件不被改动；`.gitignore` 不存在时创建仅含标记段的文件。
 */
export async function ensureVettaLocalGitignore(projectRoot: string): Promise<{
	readonly added: boolean;
	readonly gitignorePath: string;
}> {
	const root = resolve(projectRoot);
	const gitignorePath = join(root, GITIGNORE_FILE);
	let contents = "";
	try {
		contents = await readFile(gitignorePath, "utf8");
	} catch {
		// 无 .gitignore：新建仅含标记段的文件。
	}
	const addition = gitignoreAdditionForVettaLocal(contents);
	if (addition === "") return { added: false, gitignorePath };
	const next = contents.length > 0 && !contents.endsWith("\n") ? `${contents}\n${addition}` : `${contents}${addition}`;
	await writeFile(gitignorePath, next, "utf8");
	return { added: true, gitignorePath };
}

function isWithinRoot(root: string, path: string): boolean {
	const resolved = resolve(path);
	const relativePath = relative(root, resolved);
	return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

/** 供文档与校验共用的当前版本常量重导出。 */
export const SUPPORTED_PROJECT_SCHEMA_VERSION = CURRENT_VETTA_PROJECT_SCHEMA_VERSION;
export const VETTA_LOCAL_DIRECTORY_NAME = VETTA_LOCAL_PROJECT_DIRECTORY;
