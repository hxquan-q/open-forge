// Modified by The Open Forge contributors.
import { randomUUID } from "node:crypto";
import { parseProjectLocation } from "@vetta/ssh-transport";
import type { DesktopConfig, DesktopConfigUpdater, ProjectEntry } from "../config/desktop-config-store.js";
import { getSharedRuntime } from "../runtime.js";
import { emitAutomationHostEvent } from "../scheduler/automation-event-dispatcher.js";
import { sameProjectPath } from "./project-path.js";

export interface ProjectServiceDependencies {
	readonly allowProjectRoot: (path: string) => void;
	readonly createDirectory: (path: string) => Promise<void>;
	readonly readConfig: () => Promise<DesktopConfig>;
	readonly updateConfig: (update: DesktopConfigUpdater) => Promise<DesktopConfig>;
	/**
	 * 这个 hostId 是否对应一台已登记的 SSH 主机。
	 *
	 * 注册时就要挡住未知主机：放进去的条目在侧边栏看起来和正常项目一样，点开才发现
	 * 永远连不上，而那时已经看不出它指向的是一台早就被删掉的主机。
	 */
	readonly isKnownSshHost: (hostId: string) => Promise<boolean>;
	/**
	 * 项目列表落盘后通知渲染进程重读。写入与广播必须成对，否则侧边栏会停在旧快照上
	 * （插件/Action 改完项目要等重启才可见），所以统一走 {@link ProjectService.commit}。
	 */
	readonly broadcastChanged: () => void;
	/**
	 * 这个路径当前是不是一个**已存在的非目录**（文件、软链等）。用于挡住「把文件注册成
	 * 项目」——不存在的路径仍然放行，`open` 本来就允许登记一个还没建出来的目录。
	 */
	readonly isExistingNonDirectory: (path: string) => Promise<boolean>;
}

export interface ProjectListSnapshot {
	readonly workspacePath: string;
	readonly projects: readonly ProjectEntry[];
	readonly archivedProjects: readonly ProjectEntry[];
	/** ADR-0151 第二册：Allstar 自主开发版块的项目册（与 projects 独立）。 */
	readonly allstarProjects: readonly ProjectEntry[];
	readonly allstarArchivedProjects: readonly ProjectEntry[];
}

/**
 * 项目册（ADR-0151）：普通册与版块册是两套独立条目；同路径可两册各一条、条目 id 不同。
 * 所有按册操作的服务方法都以此参数区分落点，批次内不引入第二套校验/广播路径。
 */
export type ProjectBookKind = "default" | "allstar";

interface BookFields {
	readonly projectsKey: "projects" | "allstarProjects";
	readonly archivedKey: "archivedProjects" | "allstarArchivedProjects";
}

/** 读取册内清单；版块册字段是可选的，缺省空数组。 */
function bookEntries(
	config: DesktopConfig,
	key: BookFields["projectsKey"] | BookFields["archivedKey"],
): ProjectEntry[] {
	const entries = config[key];
	return Array.isArray(entries) ? entries : [];
}

function bookFields(book: ProjectBookKind): BookFields {
	return book === "allstar"
		? { projectsKey: "allstarProjects", archivedKey: "allstarArchivedProjects" }
		: { projectsKey: "projects", archivedKey: "archivedProjects" };
}

function isAbsolutePath(path: string): boolean {
	return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/** 这个项目标识指向远程主机吗。远程项目的 path 是 `ssh://<hostId>/<路径>`（ADR-0124）。 */
function resolveLocation(path: string): ReturnType<typeof parseProjectLocation> {
	try {
		return parseProjectLocation(path);
	} catch {
		// 畸形的 ssh:// 串不能当成本地相对路径放行，否则会落到本机某个同名目录上。
		throw new Error(`Invalid project path: ${path}`);
	}
}

function joinPath(base: string, name: string): string {
	const separator = base.includes("\\") ? "\\" : "/";
	return `${base.replace(/[\\/]+$/, "")}${separator}${name}`;
}

function pathBasename(path: string): string {
	const normalized = path.replace(/[\\/]+$/, "");
	const parts = normalized.split(/[\\/]/);
	return parts[parts.length - 1] || path;
}

function findProject(entries: readonly ProjectEntry[], path: string): ProjectEntry | undefined {
	return entries.find((entry) => sameProjectPath(entry.path, path));
}

function assertProjectName(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0 || trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\")) {
		throw new Error("Invalid project name.");
	}
	return trimmed;
}

/** 版块册条目的稳定 id（ADR-0151）：同路径双册登记时用于区分两个项目实体。 */
function createProjectEntryId(): string {
	return randomUUID();
}

export class ProjectService {
	constructor(private readonly dependencies: ProjectServiceDependencies) {}

	/** 唯一的写路径：落盘 + 广播。任何改动项目列表的地方都必须经由它。 */
	private async commit(update: DesktopConfigUpdater): Promise<DesktopConfig> {
		const config = await this.dependencies.updateConfig(update);
		this.dependencies.broadcastChanged();
		return config;
	}

	async list(): Promise<ProjectListSnapshot> {
		const config = await this.dependencies.readConfig();
		return {
			workspacePath: config.workspacePath,
			projects: config.projects.map((entry) => ({ ...entry })),
			archivedProjects: config.archivedProjects.map((entry) => ({ ...entry })),
			allstarProjects: (config.allstarProjects ?? []).map((entry) => ({ ...entry })),
			allstarArchivedProjects: (config.allstarArchivedProjects ?? []).map((entry) => ({ ...entry })),
		};
	}

	async create(name: string, path?: string): Promise<ProjectEntry> {
		const normalizedName = assertProjectName(name);
		const config = await this.dependencies.readConfig();
		const projectPath = path?.trim() ? path.trim() : joinPath(config.workspacePath, normalizedName);
		// 「新建项目」是在本地工作区里造一个目录；远端主机上没有这个工作区的概念，
		// 要登记远端已有目录走 open。
		if (resolveLocation(projectPath).kind === "ssh") {
			throw new Error("Remote projects must be registered with open(), not create().");
		}
		if (!isAbsolutePath(projectPath)) throw new Error("Project path must be absolute.");

		await this.dependencies.createDirectory(projectPath);
		let changed = false;
		await this.dependencies.updateConfig((current) => {
			const projects = current.projects.map((entry) => ({ ...entry }));
			const archivedProjects = current.archivedProjects.map((entry) => ({ ...entry }));
			if (!findProject(projects, projectPath) && !findProject(archivedProjects, projectPath)) {
				projects.push({ path: projectPath, name: normalizedName });
				changed = true;
			}
			return changed ? { ...current, projects, archivedProjects } : current;
		});
		if (changed) this.dependencies.broadcastChanged();
		this.dependencies.allowProjectRoot(projectPath);
		return { path: projectPath, name: normalizedName };
	}

	/**
	 * 登记一个已存在目录（ADR-0151）。
	 *
	 * 默认册行为与既有实现完全一致（含「已在册则幂等」）。`book: "allstar"` 时把条目写进
	 * 版块册并生成稳定条目 id——同路径可同时存在于普通册，两者是不同项目实体。
	 */
	async open(path: string, name?: string, book: ProjectBookKind = "default"): Promise<ProjectEntry> {
		const location = resolveLocation(path);
		if (location.kind === "ssh") {
			// 主机不存在时立刻拒绝，而不是留下一条永远打不开的条目。
			if (!(await this.dependencies.isKnownSshHost(location.hostId))) {
				throw new Error(`Unknown SSH host: ${location.hostId}`);
			}
		} else if (!isAbsolutePath(path)) {
			throw new Error("Project path must be absolute.");
		}
		// 项目必须是目录。放进来一个文件不会当场报错，而是等到有人去 readdir 它时才炸
		// （ENOTDIR），且从此每次扫描都炸一次——现场就出现过一个 v1 时代的 `x.vetd`
		// **文件**被登记成项目，之后每轮项目扫描都刷一条主进程 error。
		if (await this.dependencies.isExistingNonDirectory(path)) {
			throw new Error("Project path must be a directory.");
		}
		const fields = bookFields(book);
		const entry: ProjectEntry = {
			path,
			name: name?.trim() || pathBasename(path),
			...(book === "allstar" ? { id: createProjectEntryId() } : {}),
		};
		await this.commit((current) => {
			const projects = bookEntries(current, fields.projectsKey).map((item) => ({ ...item }));
			const archivedProjects = bookEntries(current, fields.archivedKey)
				.filter((item) => !sameProjectPath(item.path, path))
				.map((item) => ({ ...item }));
			if (!findProject(projects, path)) projects.push(entry);
			return { ...current, [fields.projectsKey]: projects, [fields.archivedKey]: archivedProjects };
		});
		this.dependencies.allowProjectRoot(path);
		emitAutomationHostEvent("project.opened", { cwd: path }, getSharedRuntime);
		return entry;
	}

	async rename(path: string, name: string): Promise<ProjectEntry> {
		let renamed: ProjectEntry | undefined;
		await this.commit((current) => {
			const projects = current.projects.map((entry) => ({ ...entry }));
			const archivedProjects = current.archivedProjects.map((entry) => ({ ...entry }));
			const entry = findProject(projects, path) ?? findProject(archivedProjects, path);
			if (!entry) throw new Error(`Project not found: ${path}`);
			entry.name = name;
			renamed = { ...entry };
			return { ...current, projects, archivedProjects };
		});
		if (!renamed) throw new Error(`Project not found: ${path}`);
		return renamed;
	}

	async archive(path: string, book: ProjectBookKind = "default"): Promise<void> {
		const fields = bookFields(book);
		await this.commit((current) => {
			const entry = findProject(bookEntries(current, fields.projectsKey), path);
			if (!entry) throw new Error(`Active project not found: ${path}`);
			const projects = bookEntries(current, fields.projectsKey)
				.filter((item) => !sameProjectPath(item.path, path))
				.map((item) => ({ ...item }));
			const archivedProjects = bookEntries(current, fields.archivedKey).map((item) => ({ ...item }));
			if (!findProject(archivedProjects, path)) archivedProjects.push({ ...entry });
			return { ...current, [fields.projectsKey]: projects, [fields.archivedKey]: archivedProjects };
		});
	}

	async unarchive(path: string, book: ProjectBookKind = "default"): Promise<void> {
		const fields = bookFields(book);
		await this.commit((current) => {
			const entry = findProject(bookEntries(current, fields.archivedKey), path);
			if (!entry) throw new Error(`Archived project not found: ${path}`);
			const archivedProjects = bookEntries(current, fields.archivedKey)
				.filter((item) => !sameProjectPath(item.path, path))
				.map((item) => ({ ...item }));
			const projects = bookEntries(current, fields.projectsKey).map((item) => ({ ...item }));
			if (!findProject(projects, path)) projects.push({ ...entry });
			return { ...current, [fields.projectsKey]: projects, [fields.archivedKey]: archivedProjects };
		});
		this.dependencies.allowProjectRoot(path);
	}

	async remove(path: string, book: ProjectBookKind = "default"): Promise<void> {
		const fields = bookFields(book);
		await this.commit((current) => {
			const projects = bookEntries(current, fields.projectsKey)
				.filter((item) => !sameProjectPath(item.path, path))
				.map((item) => ({ ...item }));
			const archivedProjects = bookEntries(current, fields.archivedKey)
				.filter((item) => !sameProjectPath(item.path, path))
				.map((item) => ({ ...item }));
			if (
				projects.length === bookEntries(current, fields.projectsKey).length &&
				archivedProjects.length === bookEntries(current, fields.archivedKey).length
			) {
				throw new Error(`Project not found: ${path}`);
			}
			return { ...current, [fields.projectsKey]: projects, [fields.archivedKey]: archivedProjects };
		});
	}
}
