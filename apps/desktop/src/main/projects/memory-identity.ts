// Modified by The Open Forge contributors.
import { randomUUID } from "node:crypto";

/**
 * 记忆身份解析（TASK-0370，REQ-0027 S1「身份与作用域」）。
 *
 * 原则（PLAN-0021 / ADR-0150）：
 * - 记忆身份独立映射：不改 ProjectEntry/cwd/会话主键；本模块产出
 *   `@vetta/runtime-memory` 的 scope 输入，由宿主注入存储层。
 * - `git-common-dir` 只产生关联候选；未确认的 Worktree 不共享项目 scope，
 *   确认后共享项目事实并按 workspaceView 隔离任务/分支假设。
 * - 不凭 remote URL/basename 自动共享（同名独立仓库隔离）。
 * - 移动目录走显式重新关联（保留 ID）；复制/新 clone 默认新 ID；
 *   历史会话记录内路径不重写。
 */

export interface MemoryPrincipalIdentity {
	readonly principalId: string;
}

export type MemoryAuthority =
	| { readonly kind: "local-dir" }
	| { readonly kind: "git-common-dir"; readonly value: string }
	| { readonly kind: "ssh"; readonly hostId: string; readonly remotePath: string };

export interface MemoryProjectBinding {
	readonly projectId: string;
	readonly principalId: string;
	/** 规范化 location alias 集合（大小写不敏感比较，保留原大小写）。 */
	readonly locationAliases: readonly string[];
	readonly authority: MemoryAuthority;
	/** 确认同仓关联的 common-dir 集合（显式确认后才有）。 */
	readonly confirmedCommonDirs: readonly string[];
	readonly createdAt: string;
}

export interface MemoryWorkspaceView {
	readonly workspaceViewId: string;
	readonly projectId: string;
	/** 该视图绑定的会话内工作目录 alias（Worktree/子目录）。 */
	readonly locationAlias: string;
	readonly createdAt: string;
}

/** 身份注册表（持久化形状见 memory-identity-storage）。 */
export interface MemoryIdentityRegistry {
	readonly principal: MemoryPrincipalIdentity;
	readonly projects: readonly MemoryProjectBinding[];
	readonly workspaceViews: readonly MemoryWorkspaceView[];
}

export interface MemoryIdentityResolution {
	readonly projectId: string;
	/** 是否新建立绑定（首次解析该目录）。 */
	readonly created: boolean;
	/** 同仓 Worktree 关联状态。 */
	readonly worktreeAssociation: "unshared" | "candidate" | "confirmed";
	/** 该 cwd 对应的 workspaceViewId（无则空串，表示项目级）。 */
	readonly workspaceViewId: string;
	/** 解析出的授权 scope 输入（宿主注入存储层用）。 */
	readonly allowedScopes: readonly { name: "user" | "project" | "task"; principalId: string; projectId?: string }[];
}

/** 路径 alias 规范化：盘符小写、正斜杠、去尾斜杠；比较一律小写。 */
export function normalizeLocationAlias(path: string): string {
	const replaced = path.replaceAll("\\", "/");
	const withDrive = /^([A-Z]):(\/.*)?$/.exec(replaced);
	const normalized = withDrive ? `${withDrive[1].toLowerCase()}:${withDrive[2] ?? ""}` : replaced;
	return normalized.replace(/\/+$/, "") || normalized;
}

export function locationAliasEquals(left: string, right: string): boolean {
	return normalizeLocationAlias(left).toLowerCase() === normalizeLocationAlias(right).toLowerCase();
}

/** SSH location 保留 `(hostId, remote path)` 客户端命名空间，不回落本机目录。 */
export function sshAuthorityKey(hostId: string, remotePath: string): string {
	return `ssh:${hostId.toLowerCase()}:${remotePath.replace(/\/+$/, "").toLowerCase()}`;
}

export function authorityKey(authority: MemoryAuthority): string {
	switch (authority.kind) {
		case "local-dir":
			return "local-dir";
		case "git-common-dir":
			return `git:${normalizeLocationAlias(authority.value).toLowerCase()}`;
		case "ssh":
			return sshAuthorityKey(authority.hostId, authority.remotePath);
	}
}

export interface ResolveMemoryIdentityOptions {
	readonly registry: MemoryIdentityRegistry;
	readonly cwd: string;
	/** 可选：宿主探测到的 git common dir（worktree 主仓共享 `.git`）。 */
	readonly gitCommonDir?: string;
	/** SSH 会话：远端 hostId 与路径；提供时不再按本地目录解析。 */
	readonly ssh?: { readonly hostId: string; readonly remotePath: string };
	/** 对话子 cwd 归属的项目根（Desktop 会话空间解析结果）。 */
	readonly conversationProjectRoot?: string;
	/** 是否为候选同仓关联补建 workspaceView（需要确认动作另行调用）。 */
	readonly ensureWorkspaceView?: boolean;
}

function authorityFor(options: ResolveMemoryIdentityOptions): { authority: MemoryAuthority; alias: string } {
	if (options.ssh) {
		return {
			authority: { kind: "ssh", hostId: options.ssh.hostId, remotePath: options.ssh.remotePath },
			alias: sshAuthorityKey(options.ssh.hostId, options.ssh.remotePath),
		};
	}
	const alias = normalizeLocationAlias(options.conversationProjectRoot ?? options.cwd);
	if (options.gitCommonDir) {
		return { authority: { kind: "git-common-dir", value: normalizeLocationAlias(options.gitCommonDir) }, alias };
	}
	return { authority: { kind: "local-dir" }, alias };
}

/**
 * 解析 cwd → 记忆身份。已绑定目录直接复用（大小写不敏感）；未绑定时
 * 新建 projectId。`git-common-dir` 命中其他绑定时仅返回 candidate——
 * 必须经 confirmWorktreeAssociation 显式确认后才共享。
 */
export function resolveMemoryIdentity(
	options: ResolveMemoryIdentityOptions,
): MemoryIdentityResolution & { readonly registry: MemoryIdentityRegistry } {
	const { registry } = options;
	const { authority, alias } = authorityFor(options);
	const existing = registry.projects.find((project) =>
		project.locationAliases.some((candidate) => locationAliasEquals(candidate, alias)),
	);
	const commonDirKey = authority.kind === "git-common-dir" ? authorityKey(authority) : null;
	const candidateBindings = commonDirKey
		? registry.projects.filter(
				(project) =>
					project.confirmedCommonDirs.some((key) => key.toLowerCase() === commonDirKey) ||
					authorityKey(project.authority).toLowerCase() === commonDirKey,
			)
		: [];

	let binding = existing;
	let created = false;
	let workingRegistry = registry;
	if (!binding) {
		binding = {
			projectId: `prj-${randomUUID()}`,
			principalId: registry.principal.principalId,
			locationAliases: [alias],
			authority,
			confirmedCommonDirs: [],
			createdAt: new Date().toISOString(),
		};
		created = true;
	}

	// Worktree 语义：该 alias 已登记 workspaceView → 是视图而非项目根；
	// 否则命中既有绑定 alias 或新建普通目录时是项目根；共享 git-common-dir
	// 下的平行目录（Worktree）是 view。
	const existingView = workingRegistry.workspaceViews.find((entry) => locationAliasEquals(entry.locationAlias, alias));
	let workspaceViewId = existingView?.workspaceViewId ?? "";
	const isProjectRoot = existingView
		? false
		: existing
			? existing.locationAliases.some((candidate) => locationAliasEquals(candidate, alias))
			: !commonDirKey || candidateBindings.length === 0;
	if (!isProjectRoot) {
		if (existingView) {
			workspaceViewId = existingView.workspaceViewId;
		} else if (options.ensureWorkspaceView) {
			workspaceViewId = `wv-${randomUUID()}`;
			workingRegistry = {
				...registry,
				workspaceViews: [
					...registry.workspaceViews,
					{
						workspaceViewId,
						projectId: binding.projectId,
						locationAlias: alias,
						createdAt: new Date().toISOString(),
					},
				],
			};
		}
	}

	const association: MemoryIdentityResolution["worktreeAssociation"] = candidateBindings.some(
		(project) => project.projectId === binding?.projectId,
	)
		? "confirmed"
		: candidateBindings.length > 0
			? "candidate"
			: "unshared";

	const projects = created ? [...workingRegistry.projects, binding] : workingRegistry.projects;
	return {
		projectId: binding.projectId,
		created,
		worktreeAssociation: association,
		workspaceViewId,
		allowedScopes: [
			{ name: "user", principalId: registry.principal.principalId },
			{ name: "project", principalId: registry.principal.principalId, projectId: binding.projectId },
		],
		registry: { ...workingRegistry, projects },
	};
}

/**
 * 显式确认同仓 Worktree 关联：把 common-dir 登记进双方 confirmedCommonDirs。
 * 未确认前共享不发生；确认只共享项目事实，不合并 task/view。
 */
export function confirmWorktreeAssociation(
	registry: MemoryIdentityRegistry,
	options: { readonly leftProjectId: string; readonly rightProjectId: string; readonly gitCommonDir: string },
): MemoryIdentityRegistry {
	const key = authorityKey({ kind: "git-common-dir", value: options.gitCommonDir });
	const projects = registry.projects.map((project) => {
		if (project.projectId !== options.leftProjectId && project.projectId !== options.rightProjectId) {
			return project;
		}
		const already = project.confirmedCommonDirs.some((entry) => entry.toLowerCase() === key.toLowerCase());
		return already ? project : { ...project, confirmedCommonDirs: [...project.confirmedCommonDirs, key] };
	});
	return { ...registry, projects };
}

/** 显式移动：保留 projectId，登记新 alias；旧 alias 保留用于显示，不自动迁移会话。 */
export function moveProjectBinding(
	registry: MemoryIdentityRegistry,
	options: { readonly projectId: string; readonly newLocation: string },
): MemoryIdentityRegistry {
	const alias = normalizeLocationAlias(options.newLocation);
	return {
		...registry,
		projects: registry.projects.map((project) =>
			project.projectId === options.projectId &&
			!project.locationAliases.some((entry) => locationAliasEquals(entry, alias))
				? { ...project, locationAliases: [...project.locationAliases, alias] }
				: project,
		),
	};
}

/** 显式复制/新 clone：新 projectId，与原项目零共享。 */
export function copyProjectAsNewBinding(
	registry: MemoryIdentityRegistry,
	options: { readonly templateProjectId: string; readonly newLocation: string },
): MemoryIdentityResolution & { readonly registry: MemoryIdentityRegistry } {
	const template = registry.projects.find((project) => project.projectId === options.templateProjectId);
	if (!template) {
		throw new Error(`复制来源项目不存在：${options.templateProjectId}`);
	}
	const alias = normalizeLocationAlias(options.newLocation);
	const binding: MemoryProjectBinding = {
		projectId: `prj-${randomUUID()}`,
		principalId: template.principalId,
		locationAliases: [alias],
		authority: { kind: "local-dir" },
		confirmedCommonDirs: [],
		createdAt: new Date().toISOString(),
	};
	const nextRegistry = { ...registry, projects: [...registry.projects, binding] };
	return {
		projectId: binding.projectId,
		created: true,
		worktreeAssociation: "unshared",
		workspaceViewId: "",
		allowedScopes: [
			{ name: "user", principalId: binding.principalId },
			{ name: "project", principalId: binding.principalId, projectId: binding.projectId },
		],
		registry: nextRegistry,
	};
}

/** 对话子 cwd（uuid 目录等）归属项目根解析：返回项目根 alias，未命中回退 cwd。 */
export function resolveConversationProjectRoot(projectRoots: readonly string[], cwd: string): string | undefined {
	const normalizedCwd = normalizeLocationAlias(cwd).toLowerCase();
	return projectRoots.find((root) => normalizedCwd.startsWith(`${normalizeLocationAlias(root).toLowerCase()}/`));
}
