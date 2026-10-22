// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import { confirmDialogAtom, migrationImportWizardAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installVettaBridge } from "../../../../../../test/vetta-bridge.js";

/**
 * BUG-0143 回归：项目侧「导入项目」与迁移包导出入口此前不对称——导出得到 .ofar，
 * 导入框只列 .zip。现在选中 .ofar 后要收集口令、按包版本分流：
 * v2 迁移包打开既有迁移向导；v1 会话归档只给「去会话页导入」的指引（通道语义不动）。
 */

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
	}),
}));

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
}));

const refreshProjects = vi.fn(async () => undefined);
vi.mock("../../../hooks/useProjects", () => ({
	useProjectActions: () => ({
		createProject: vi.fn(async () => undefined),
		openProject: vi.fn(async () => undefined),
		openProjectPath: vi.fn(async () => undefined),
		refreshProjects,
	}),
}));

const refreshBatchProjects = vi.fn(async () => undefined);
vi.mock("@domains/batch-tasks/hooks/useBatchTasks", () => ({
	useBatchTasks: () => ({ refreshProjects: refreshBatchProjects }),
}));

type ProjectImportOutcome =
	| { kind: "migration-archive"; archivePath: string }
	| { path: string; name: string; type: "normal"; missingSources?: string[] }
	| { error: { code: string; message: string } }
	| null;

const projectImport = vi.fn(
	async (): Promise<ProjectImportOutcome> => ({ path: "C:/work/proj", name: "proj", type: "normal" }),
);

type PreviewOutcome =
	| { canceled: true }
	| { canceled: false; classic: true; archivePath: string }
	| {
			canceled: false;
			classic: false;
			archivePath: string;
			sourceCwd?: string;
			sessionCount: number;
			sessions: Array<{ sessionId: string; name?: string }>;
			workspaceFileCount: number;
			workspaceBytes: number;
			formatVersion: number;
	  };

const previewMigration = vi.fn(
	async (_input?: { passphrase?: string; archivePath?: string }): Promise<PreviewOutcome> => ({
		canceled: false,
		classic: true,
		archivePath: "C:/dl/mig.ofar",
	}),
);

const MIGRATION_PREVIEW = {
	canceled: false as const,
	classic: false as const,
	archivePath: "C:/dl/mig.ofar",
	sourceCwd: "C:/source/proj",
	sessionCount: 2,
	sessions: [{ sessionId: "s1", name: "A" }, { sessionId: "s2" }],
	workspaceFileCount: 5,
	workspaceBytes: 4321,
	formatVersion: 2,
};

const { useAddProjectMenuModel } = await import("./useAddProjectMenuModel.js");

type MenuModel = ReturnType<typeof useAddProjectMenuModel>;

/** 从「添加项目」菜单点「导入项目」——用户真实入口，而不是直接调内部函数。 */
async function clickImportProject(result: { current: MenuModel }): Promise<void> {
	const item = result.current.items.find((entry) => entry.action === "importProject");
	expect(item).toBeDefined();
	await act(async () => {
		item?.onSelect();
	});
}

describe("useAddProjectMenuModel 导入项目", () => {
	beforeEach(() => {
		projectImport.mockReset();
		projectImport.mockResolvedValue({ path: "C:/work/proj", name: "proj", type: "normal" });
		previewMigration.mockReset();
		previewMigration.mockResolvedValue({ canceled: false, classic: true, archivePath: "C:/dl/mig.ofar" });
		refreshProjects.mockClear();
		refreshBatchProjects.mockClear();
		navigate.mockClear();
		getDefaultStore().set(confirmDialogAtom, null);
		getDefaultStore().set(migrationImportWizardAtom, null);
		installVettaBridge({
			project: { import: projectImport },
			sessionArchive: { previewMigration },
		});
	});

	it("zip 项目包导入不回归：刷新项目与批量列表并展示完成确认框", async () => {
		projectImport.mockResolvedValueOnce({ path: "C:/work/proj", name: "proj", type: "normal" });
		const { result } = renderHook(() => useAddProjectMenuModel());

		await clickImportProject(result);

		expect(previewMigration).not.toHaveBeenCalled();
		expect(getDefaultStore().get(migrationImportWizardAtom)).toBeNull();
		await expect(refreshProjects).toHaveBeenCalled();
		await expect(refreshBatchProjects).toHaveBeenCalled();
		const dialog = getDefaultStore().get(confirmDialogAtom);
		expect(dialog?.title).toBe("importDialog.doneTitle");
		expect(dialog?.message).toContain("proj");
	});

	it("选中 .ofar 先要口令，再用同一个路径预览并打开迁移向导", async () => {
		projectImport.mockResolvedValueOnce({ kind: "migration-archive", archivePath: "C:/dl/mig.ofar" });
		previewMigration.mockResolvedValueOnce(MIGRATION_PREVIEW);
		const { result } = renderHook(() => useAddProjectMenuModel());

		await clickImportProject(result);

		// 迁移包不落盘：主进程只回传路径，这里也不能当 zip 导入成功去刷新列表。
		expect(refreshProjects).not.toHaveBeenCalled();
		const prompt = getDefaultStore().get(confirmDialogAtom);
		expect(prompt?.input?.password).toBe(true);
		expect(prompt?.title).toBe("importDialog.migrationTitle");
		expect(previewMigration).not.toHaveBeenCalled();

		await act(async () => {
			prompt?.onConfirm(false, "pw");
		});

		expect(previewMigration).toHaveBeenCalledWith({ passphrase: "pw", archivePath: "C:/dl/mig.ofar" });
		const wizard = getDefaultStore().get(migrationImportWizardAtom);
		expect(wizard?.passphrase).toBe("pw");
		expect(wizard?.preview.archivePath).toBe("C:/dl/mig.ofar");
		expect(wizard?.preview.sourceCwd).toBe("C:/source/proj");
		expect(wizard?.preview.sessionCount).toBe(2);
		expect(wizard?.preview.workspaceFileCount).toBe(5);
		expect(wizard?.preview.workspaceBytes).toBe(4321);
		expect(wizard?.preview.formatVersion).toBe(2);
	});

	it("v1 会话归档给出「去会话页导入」的指引，不打开向导", async () => {
		projectImport.mockResolvedValueOnce({ kind: "migration-archive", archivePath: "C:/dl/classic.ofar" });
		previewMigration.mockResolvedValueOnce({ canceled: false, classic: true, archivePath: "C:/dl/classic.ofar" });
		const { result } = renderHook(() => useAddProjectMenuModel());

		await clickImportProject(result);
		const prompt = getDefaultStore().get(confirmDialogAtom);
		await act(async () => {
			prompt?.onConfirm(false, "");
		});

		expect(previewMigration).toHaveBeenCalledWith({ passphrase: "", archivePath: "C:/dl/classic.ofar" });
		expect(getDefaultStore().get(migrationImportWizardAtom)).toBeNull();
		const guide = getDefaultStore().get(confirmDialogAtom);
		expect(guide?.title).toBe("importDialog.classicTitle");
		expect(guide?.message).toContain("classic.ofar");
	});

	it("预览失败（口令错误/文件损坏）以 danger 确认框呈现，不设置向导", async () => {
		projectImport.mockResolvedValueOnce({ kind: "migration-archive", archivePath: "C:/dl/mig.ofar" });
		previewMigration.mockRejectedValueOnce(new Error("bad passphrase"));
		const { result } = renderHook(() => useAddProjectMenuModel());

		await clickImportProject(result);
		const prompt = getDefaultStore().get(confirmDialogAtom);
		await act(async () => {
			prompt?.onConfirm(false, "wrong");
		});

		expect(getDefaultStore().get(migrationImportWizardAtom)).toBeNull();
		const failure = getDefaultStore().get(confirmDialogAtom);
		expect(failure?.variant).toBe("danger");
		expect(failure?.title).toBe("importDialog.failedTitle");
		expect(failure?.message).toContain("bad passphrase");
	});

	it("用户取消文件框时什么都不做", async () => {
		projectImport.mockResolvedValueOnce(null);
		const { result } = renderHook(() => useAddProjectMenuModel());

		await clickImportProject(result);

		expect(previewMigration).not.toHaveBeenCalled();
		expect(getDefaultStore().get(confirmDialogAtom)).toBeNull();
		expect(refreshProjects).not.toHaveBeenCalled();
	});
});
