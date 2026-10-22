// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import { migrationImportWizardAtom, projectsAtom } from "@shared/store/atoms";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installVettaBridge } from "../../../../test/vetta-bridge.js";
import { MigrationImportWizardDialog } from "./MigrationImportWizardDialog";
import { useMigrationImportWizardModel } from "../hooks/useMigrationImportWizardModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, unknown>) => {
			if (!values) return key;
			return `${key}:${JSON.stringify(values)}`;
		},
	}),
}));

const applyMigration = vi.fn(async () => ({
	sessions: [
		{ fingerprint: "fp1", sessionId: "s1", conflict: { action: "create-copy", reason: "default" } },
		{ fingerprint: "fp2", sessionId: "s2", conflict: { action: "skip-idempotent", reason: "fingerprint-match" } },
	],
	workspace: { written: 3, skipped: 1, overwritten: 0, failed: ["nested/dir.txt"] },
}));
const projectOpen = vi.fn(async () => undefined);
const selectFolder = vi.fn(async (): Promise<string | null> => null);

const { formatBytes } = await import("../hooks/useMigrationImportWizardModel");

// jsdom 未实现 Pointer Capture 与 scrollIntoView；Radix Select 的展开依赖它们（仓库既有测试同样打桩）。
const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.scrollIntoView = () => undefined;

const PREVIEW = {
	archivePath: "C:/pkg/mig.ofar",
	sourceCwd: "C:/source/proj",
	sessionCount: 2,
	sessions: [
		{ sessionId: "s1", name: "A" },
		{ sessionId: "s2" },
	],
	workspaceFileCount: 5,
	workspaceBytes: 2048,
	formatVersion: 2,
};

function openWizard(preview = PREVIEW): void {
	getDefaultStore().set(migrationImportWizardAtom, { preview, passphrase: "pw" });
}

function applyButton(): HTMLButtonElement {
	return screen.getByRole("button", { name: "migrationWizard.apply" }) as HTMLButtonElement;
}

describe("MigrationImportWizardDialog", () => {
	beforeEach(() => {
		applyMigration.mockClear();
		projectOpen.mockClear();
		selectFolder.mockClear();
		getDefaultStore().set(migrationImportWizardAtom, null);
		getDefaultStore().set(projectsAtom, [
			{ cwd: "C:/work/repo", name: "repo", sessionCount: 0, type: "normal" },
			{ cwd: "C:/work/other", name: "other", sessionCount: 0, type: "normal" },
			// 默认项目与远程项目不进入目标下拉。
			{ cwd: "C:/conversations", sessionCount: 0, type: "normal", isDefault: true },
			{ cwd: "ssh://host/srv", name: "remote", sessionCount: 0, type: "normal" },
		]);
		installVettaBridge({
			sessionArchive: { applyMigration },
			project: { open: projectOpen },
			dialog: { selectFolder },
		});
	});

	it("renders nothing until the wizard atom is set", () => {
		const { container } = render(<MigrationImportWizardDialog />);
		expect(container.childElementCount).toBe(0);
	});

	it("shows the migration preview summary (source, sessions, workspace files and size)", () => {
		openWizard();
		render(<MigrationImportWizardDialog />);
		expect(screen.getByText("migrationWizard.title")).toBeTruthy();
		expect(screen.getByText("C:/source/proj")).toBeTruthy();
		expect(screen.getByText(`migrationWizard.count:${JSON.stringify({ count: 2 })}`)).toBeTruthy();
		expect(
			screen.getByText(`migrationWizard.workspaceSummary:${JSON.stringify({ count: 5, size: formatBytes(2048) })}`),
		).toBeTruthy();
	});

	it("keeps apply disabled until a target is chosen", () => {
		openWizard();
		render(<MigrationImportWizardDialog />);
		expect(applyButton().disabled).toBe(true);
	});


	it("registers a brand-new path as a project after a successful apply", async () => {
		const user = userEvent.setup();
		openWizard();
		render(<MigrationImportWizardDialog />);

		const input = screen.getByLabelText("migrationWizard.newPath");
		await user.clear(input);
		await user.type(input, "C:/fresh/checkout");
		await user.click(applyButton());

		await waitFor(() =>
			expect(applyMigration).toHaveBeenCalledWith(expect.objectContaining({ targetCwd: "C:/fresh/checkout" })),
		);
		await waitFor(() => expect(projectOpen).toHaveBeenCalledWith({ path: "C:/fresh/checkout" }));
		expect(
			(screen.getByRole("button", { name: "migrationWizard.done" }) as HTMLButtonElement).disabled,
		).toBe(false);
	});

	it("fills the new path via the folder picker", async () => {
		selectFolder.mockResolvedValueOnce("C:/picked/dir");
		const user = userEvent.setup();
		openWizard();
		render(<MigrationImportWizardDialog />);

		await user.click(screen.getByRole("button", { name: "migrationWizard.browse" }));
		await user.click(applyButton());

		expect(selectFolder).toHaveBeenCalled();
		await waitFor(() =>
			expect(applyMigration).toHaveBeenCalledWith(expect.objectContaining({ targetCwd: "C:/picked/dir" })),
		);
	});

	it("forwards the overwrite checkbox to apply", async () => {
		const user = userEvent.setup();
		openWizard();
		render(<MigrationImportWizardDialog />);

		await user.click(screen.getByLabelText("migrationWizard.overwrite"));
		const input = screen.getByLabelText("migrationWizard.newPath");
		await user.clear(input);
		await user.type(input, "C:/target");
		await user.click(applyButton());

		await waitFor(() =>
			expect(applyMigration).toHaveBeenCalledWith(expect.objectContaining({ overwriteWorkspace: true })),
		);
	});

	it("shows the error message and keeps the wizard open when apply fails", async () => {
		applyMigration.mockRejectedValueOnce(new Error("bad passphrase"));
		const user = userEvent.setup();
		openWizard();
		render(<MigrationImportWizardDialog />);

		const input = screen.getByLabelText("migrationWizard.newPath");
		await user.clear(input);
		await user.type(input, "C:/target");
		await user.click(applyButton());

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("bad passphrase");
		// 失败后仍停留在表单态，可换目标重试。
		expect(applyButton().disabled).toBe(false);
	});

	it("closes (clears the atom) from the cancel button", async () => {
		const user = userEvent.setup();
		openWizard();
		render(<MigrationImportWizardDialog />);

		await user.click(screen.getByRole("button", { name: "migrationWizard.cancel" }));
		expect(getDefaultStore().get(migrationImportWizardAtom)).toBeNull();
	});

});

describe("useMigrationImportWizardModel 目标选择语义（组件内 Radix Select 在 jsdom 嵌套模态下不可展开，选择逻辑下沉到模型层验证）", () => {
	const STATE = { preview: PREVIEW, passphrase: "pw" };

	function renderModel() {
		const { result } = renderHook(() => useMigrationImportWizardModel(STATE));
		return result;
	}

	beforeEach(() => {
		getDefaultStore().set(projectsAtom, [
			{ cwd: "C:/work/repo", name: "repo", sessionCount: 0, type: "normal" },
			{ cwd: "C:/work/other", name: "other", sessionCount: 0, type: "normal" },
			{ cwd: "C:/conversations", sessionCount: 0, type: "normal", isDefault: true },
			{ cwd: "ssh://host/srv", name: "remote", sessionCount: 0, type: "normal" },
		]);
	});

	it("目标下拉只列本地非默认项目", () => {
		const result = renderModel();
		expect(result.current.localProjects.map((p) => p.cwd)).toEqual(["C:/work/repo", "C:/work/other"]);
	});

	it("选中现有项目成为目标且清空手输路径；apply 默认 skip-existing 并展示报告", async () => {
		const result = renderModel();
		act(() => result.current.selectExisting("C:/work/repo"));
		expect(result.current.targetCwd).toBe("C:/work/repo");
		expect(result.current.canApply).toBe(true);

		act(() => result.current.apply());
		await waitFor(() => expect(applyMigration).toHaveBeenCalledTimes(1));
		expect(applyMigration).toHaveBeenCalledWith({
			archivePath: "C:/pkg/mig.ofar",
			passphrase: "pw",
			targetCwd: "C:/work/repo",
			overwriteWorkspace: false,
		});
		// 现有项目目标不再登记项目。
		expect(projectOpen).not.toHaveBeenCalled();
		await waitFor(() => expect(result.current.report).not.toBeNull());
		expect(result.current.report).toEqual({
			importedSessions: 1,
			skippedSessions: 1,
			written: 3,
			skipped: 1,
			overwritten: 0,
			failed: ["nested/dir.txt"],
		});
	});

	it("手输新路径优先于下拉选择并清掉选中项目", () => {
		const result = renderModel();
		act(() => result.current.selectExisting("C:/work/other"));
		act(() => result.current.setNewPath("C:/newer/path"));
		expect(result.current.targetCwd).toBe("C:/newer/path");
		expect(result.current.selectedCwd).toBeNull();
	});
});
