// Modified by The Open Forge contributors.

import type { ProjectMigrationApplyReport } from "@preload/api-types/session-archive";
import { type MigrationImportWizardState, projectsAtom } from "@shared/store/atoms";
import { isSshProjectUri } from "@vetta/ssh-transport/project-uri";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { applyProjectMigrationArchive } from "../services/session-archive";

/** 报告的视图形态：会话按决策分桶，产物按恢复策略计数并保留失败路径清单。 */
export interface MigrationWizardReport {
	readonly importedSessions: number;
	readonly skippedSessions: number;
	readonly written: number;
	readonly skipped: number;
	readonly overwritten: number;
	readonly failed: readonly string[];
}

export interface UseMigrationImportWizardModelResult {
	readonly localProjects: { cwd: string; name: string }[];
	readonly selectedCwd: string | null;
	readonly newPath: string;
	readonly overwrite: boolean;
	readonly applying: boolean;
	readonly report: MigrationWizardReport | null;
	readonly error: string | null;
	/** 当前生效的目标：新路径输入优先，其次是下拉选中的现有项目。 */
	readonly targetCwd: string | null;
	readonly canApply: boolean;
	readonly bytesLabel: string;
	selectExisting: (cwd: string) => void;
	setNewPath: (value: string) => void;
	setOverwrite: (value: boolean) => void;
	browse: () => Promise<void>;
	apply: () => void;
}

/** 字节量的用户可读形式；单位是通用缩写，不做本地化。 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function toReport(result: ProjectMigrationApplyReport): MigrationWizardReport {
	return {
		importedSessions: result.sessions.filter(
			(decision) => decision.conflict.action === "create-copy" || decision.conflict.action === "overwrite",
		).length,
		skippedSessions: result.sessions.filter((decision) => decision.conflict.action === "skip-idempotent").length,
		written: result.workspace.written,
		skipped: result.workspace.skipped,
		overwritten: result.workspace.overwritten,
		failed: result.workspace.failed,
	};
}

/**
 * 迁移向导模型：目标选择（现有本地项目下拉 + 新路径输入，新路径优先）、
 * 冲突策略（默认 skip-existing，复选覆盖）、执行态与结果报告。
 * 新路径目标在成功后登记为项目，让侧栏即时可见（主进程广播 projects-changed）。
 */
export function useMigrationImportWizardModel(state: MigrationImportWizardState): UseMigrationImportWizardModelResult {
	const projects = useAtomValue(projectsAtom);
	const localProjects = useMemo(
		() =>
			projects
				.filter((project) => project.isDefault !== true && !isSshProjectUri(project.cwd))
				.map((project) => ({ cwd: project.cwd, name: project.name || project.cwd })),
		[projects],
	);
	const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
	const [newPath, setNewPath] = useState("");
	const [overwrite, setOverwrite] = useState(false);
	const [applying, setApplying] = useState(false);
	const [report, setReport] = useState<MigrationWizardReport | null>(null);
	const [error, setError] = useState<string | null>(null);

	const trimmedNewPath = newPath.trim();
	const targetCwd = trimmedNewPath || selectedCwd;
	const canApply = !applying && report === null && targetCwd !== null && targetCwd.length > 0;
	const bytesLabel = formatBytes(state.preview.workspaceBytes);

	const selectExisting = useCallback((cwd: string) => {
		setSelectedCwd(cwd);
		// 下拉选择即放弃手输路径：两个入口互斥，目标始终无歧义。
		setNewPath("");
	}, []);

	const browse = useCallback(async () => {
		const picked = await window.vetta.dialog.selectFolder();
		if (picked) {
			setNewPath(picked);
			setSelectedCwd(null);
		}
	}, []);

	const apply = useCallback(() => {
		if (!targetCwd || applying || report !== null) return;
		setApplying(true);
		setError(null);
		void (async () => {
			try {
				const result = await applyProjectMigrationArchive({
					archivePath: state.preview.archivePath,
					passphrase: state.passphrase,
					targetCwd,
					overwriteWorkspace: overwrite,
				});
				// 新路径目标：登记为项目，侧栏经 projects-changed 即时出现目标项目。
				if (trimmedNewPath && !projects.some((project) => project.cwd === trimmedNewPath)) {
					await window.vetta.project.open({ path: trimmedNewPath });
				}
				setReport(toReport(result));
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : String(cause));
			} finally {
				setApplying(false);
			}
		})();
	}, [applying, overwrite, projects, report, state.passphrase, state.preview.archivePath, targetCwd, trimmedNewPath]);

	return {
		localProjects,
		selectedCwd,
		newPath,
		overwrite,
		applying,
		report,
		error,
		targetCwd,
		canApply,
		bytesLabel,
		selectExisting,
		setNewPath: (value: string) => {
			setNewPath(value);
			// 手输路径时清掉下拉选择，目标以输入为准。
			if (value.trim()) setSelectedCwd(null);
		},
		setOverwrite,
		browse,
		apply,
	};
}
