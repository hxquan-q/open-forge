// Copyright The Open Forge contributors.
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import type { EditPathPolicy, ReadPathPolicy, WritePathPolicy } from "@vetta/runtime-node/coding";

export interface CodeProjectFilePolicies {
	readonly read: ReadPathPolicy;
	readonly edit: EditPathPolicy;
	readonly write: WritePathPolicy;
}

function canonicalRoot(root: string): string {
	return normalizePath(realpathSync(resolve(root)));
}

function canonicalBoundary(targetPath: string): string {
	const missingSegments: string[] = [];
	let current = resolve(targetPath);
	while (!existsSync(current)) {
		missingSegments.push(basename(current));
		const parent = dirname(current);
		if (parent === current) throw new Error("Path has no existing ancestor");
		current = parent;
	}
	return normalizePath(resolve(realpathSync(current), ...missingSegments.reverse()));
}

function normalizePath(value: string): string {
	const resolved = resolve(value);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithinRoot(targetPath: string, rootPath: string): boolean {
	const pathOffset = relative(rootPath, targetPath);
	return pathOffset === "" || (!pathOffset.startsWith("..") && !isAbsolute(pathOffset));
}

export function createCodeProjectFilePolicies(
	projectRoot: string,
	aiWorkspaceRoot: string,
	base: { readonly edit: EditPathPolicy; readonly write: WritePathPolicy },
): CodeProjectFilePolicies {
	const roots = [canonicalRoot(projectRoot), canonicalRoot(aiWorkspaceRoot)];
	const getRejectionReason = (absolutePath: string): string | undefined => {
		let target: string;
		try {
			target = canonicalBoundary(absolutePath);
		} catch {
			return `Access denied: cannot resolve file path "${absolutePath}".`;
		}
		if (!roots.some((root) => isWithinRoot(target, root))) {
			return `Access denied: Code file tools are limited to the current project and its AI workspace: "${absolutePath}".`;
		}
		return undefined;
	};
	return {
		read: { getRejectionReason },
		edit: {
			getRejectionReason: (absolutePath) =>
				getRejectionReason(absolutePath) ?? base.edit.getRejectionReason(absolutePath),
		},
		write: {
			getRejectionReason: (absolutePath) =>
				getRejectionReason(absolutePath) ?? base.write.getRejectionReason(absolutePath),
		},
	};
}
