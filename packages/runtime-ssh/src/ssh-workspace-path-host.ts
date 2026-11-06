// Modified by The Open Forge contributors.
import { existsSync, readdirSync } from "node:fs";
import nodePath, { posix } from "node:path";
import type { ToolPathHost, ToolPathSyntax } from "@vetta/runtime-node/coding";

export interface LocalWorkspaceToolPath {
	readonly directory: string;
	readonly toolRoot: string;
}

export function createSshWorkspaceToolPathHost(
	workspace: LocalWorkspaceToolPath,
	localReadRoots: readonly string[] = [],
): ToolPathHost {
	return createSshPathHost(localReadRoots, workspace);
}

export function createSshLocalToolPathHost(localReadRoots: readonly string[]): ToolPathHost {
	return createSshPathHost(localReadRoots);
}

function createSshPathHost(localReadRoots: readonly string[], workspace?: LocalWorkspaceToolPath): ToolPathHost {
	const localPath = nodePath;
	const localRoots = localReadRoots
		.filter((root) => localPath.isAbsolute(root))
		.map((root) => localPath.resolve(root));
	const workspaceRoot = workspace?.toolRoot;
	const isWorkspacePath = (value: string): boolean => {
		if (!workspaceRoot) return false;
		return value === workspaceRoot.slice(0, -1) || value.startsWith(workspaceRoot);
	};
	const workspaceSuffix = (value: string): string =>
		value === workspaceRoot?.slice(0, -1) ? "" : value.slice(workspaceRoot?.length ?? 0);
	const localRootFor = (value: string): string | undefined => {
		if (!localPath.isAbsolute(value)) return undefined;
		const absolute = localPath.resolve(value);
		return localRoots.find((root) => {
			const offset = localPath.relative(root, absolute);
			return offset === "" || (!offset.startsWith("..") && !localPath.isAbsolute(offset));
		});
	};
	const isLocalPath = (value: string): boolean => localRootFor(value) !== undefined;
	const workspaceFilePath = (value: string): string | undefined => {
		if (!workspace || !isWorkspacePath(value)) return undefined;
		const suffix = workspaceSuffix(value);
		if (suffix.split("/").includes("..")) return undefined;
		const target = localPath.resolve(workspace.directory, suffix);
		const offset = localPath.relative(localPath.resolve(workspace.directory), target);
		if (offset.startsWith("..") || localPath.isAbsolute(offset)) return undefined;
		return target;
	};
	const virtualPath: ToolPathSyntax = {
		isAbsolute: (value) => isWorkspacePath(value) || isLocalPath(value) || posix.isAbsolute(value),
		resolve: (...segments) => {
			const workspaceIndex = segments.findIndex(isWorkspacePath);
			if (workspaceIndex >= 0 && workspaceRoot) {
				const rootPath = segments[workspaceIndex] ?? workspaceRoot;
				const suffix = posix.resolve("/", workspaceSuffix(rootPath), ...segments.slice(workspaceIndex + 1));
				return suffix === "/" ? workspaceRoot : `${workspaceRoot}${suffix.slice(1)}`;
			}
			const localSegment = segments.find(isLocalPath);
			if (localSegment !== undefined) return localPath.resolve(...segments);
			return posix.resolve(...segments);
		},
		join: (...segments) => {
			const first = segments[0] ?? "";
			if (isWorkspacePath(first) && workspaceRoot) {
				const suffix = posix.normalize(posix.join(workspaceSuffix(first), ...segments.slice(1)));
				return suffix === "." ? workspaceRoot : `${workspaceRoot}${suffix.replace(/^\/+/, "")}`;
			}
			if (isLocalPath(first)) return localPath.join(...segments);
			return posix.join(...segments);
		},
		dirname: (value) => {
			if (isWorkspacePath(value) && workspaceRoot) {
				const suffix = workspaceSuffix(value).replace(/\/+$/, "");
				if (!suffix) return workspaceRoot;
				const parent = posix.dirname(suffix);
				return parent === "." ? workspaceRoot : `${workspaceRoot}${parent.replace(/^\/+/, "")}/`;
			}
			return isLocalPath(value) ? localPath.dirname(value) : posix.dirname(value);
		},
		basename: (value) => {
			if (isWorkspacePath(value)) return posix.basename(workspaceSuffix(value).replace(/\/+$/, ""));
			return isLocalPath(value) ? localPath.basename(value) : posix.basename(value);
		},
		relative: (from, to) => {
			if (isWorkspacePath(from) && isWorkspacePath(to)) {
				return posix.relative(workspaceSuffix(from), workspaceSuffix(to));
			}
			if (isLocalPath(from) && isLocalPath(to)) return localPath.relative(from, to);
			return posix.relative(from, to);
		},
		parse: (value) => {
			if (isWorkspacePath(value) && workspaceRoot) return { root: workspaceRoot };
			return isLocalPath(value) ? localPath.parse(value) : posix.parse(value);
		},
		sep: "/",
	};
	return {
		path: virtualPath,
		homeDirectory: () => undefined,
		exists: (value) => {
			const workspacePath = workspaceFilePath(value);
			if (workspacePath !== undefined) return existsSync(workspacePath);
			const root = localRootFor(value);
			return root !== undefined ? existsSync(localPath.resolve(value)) : false;
		},
		listDirectory: (value) => {
			if (isWorkspacePath(value)) return undefined;
			if (localRootFor(value) === undefined) return undefined;
			try {
				return readdirSync(localPath.resolve(value));
			} catch {
				return undefined;
			}
		},
	};
}
