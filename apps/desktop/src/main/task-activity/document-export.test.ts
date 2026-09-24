// Copyright The Open Forge contributors.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ArtifactDescriptor } from "@vetta/runtime-core/task";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockShowSaveDialog } = vi.hoisted(() => ({ mockShowSaveDialog: vi.fn() }));

vi.mock("electron", () => ({ dialog: { showSaveDialog: mockShowSaveDialog } }));
vi.mock("../i18n/index.js", () => ({ mainT: (key: string) => key }));
vi.mock("../logger.js", () => ({ getAppLogger: () => ({ warn: () => undefined }) }));
vi.mock("../runtime.js", () => ({
	getSharedRuntime: () => ({
		getSessionPath: () => undefined,
	}),
}));

import { desktopDocumentExportService } from "./document-export.js";
import { desktopTaskActivityService } from "./task-activity-service.js";

const BASE_DESCRIPTOR: ArtifactDescriptor = {
	schemaVersion: 1,
	artifactId: "artifact-1",
	kind: "document",
	status: "accepted",
	title: "周报.md",
	version: 2,
	uri: "",
	sourceSessionId: "session-1",
	createdAt: 1,
	updatedAt: 1,
};

function makeState(artifacts: readonly ArtifactDescriptor[]) {
	return { tasks: [], artifacts, pendingApprovals: [], approvalDecisions: new Map() };
}

describe("DesktopDocumentExportService", () => {
	let root: string;
	let sourcePath: string;
	let mockState: ReturnType<typeof makeState>;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "vetta-doc-export-"));
		sourcePath = join(root, "source.md");
		mockState = makeState([]);
		(desktopTaskActivityService as unknown as { getState: () => unknown }).getState = () => mockState;
	});

	afterEach(async () => {
		mockShowSaveDialog.mockReset();
		await rm(root, { force: true, recursive: true });
	});

	it("accepted 产物经保存对话框复制到目标路径，源文件保持不变", async () => {
		const target = join(root, "out.md");
		mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: target });
		await writeFile(sourcePath, "# 周报", "utf8");
		mockState = makeState([{ ...BASE_DESCRIPTOR, uri: sourcePath }]);

		const outcome = await desktopDocumentExportService.exportArtifact("session-1", "artifact-1");

		expect(outcome.status).toBe("exported");
		if (outcome.status !== "exported") return;
		expect(outcome.targetUri).toBe(target);
		expect(await readFile(target, "utf8")).toBe("# 周报");
		expect(await readFile(sourcePath, "utf8")).toBe("# 周报");
		expect(mockShowSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "周报.md" }));
	});

	it("not-exportable：产物尚未 accepted 时不允许导出", async () => {
		mockState = makeState([{ ...BASE_DESCRIPTOR, status: "generated", uri: sourcePath }]);

		const outcome = await desktopDocumentExportService.exportArtifact("session-1", "artifact-1");

		expect(outcome.status).toBe("not-exportable");
		expect(mockShowSaveDialog).not.toHaveBeenCalled();
	});

	it("source-missing：descriptor 有 uri 但源文件不存在", async () => {
		mockState = makeState([{ ...BASE_DESCRIPTOR, uri: join(root, "missing.md") }]);

		const outcome = await desktopDocumentExportService.exportArtifact("session-1", "artifact-1");

		expect(outcome.status).toBe("source-missing");
		expect(mockShowSaveDialog).not.toHaveBeenCalled();
	});

	it("cancelled：用户在保存对话框取消时不落盘", async () => {
		mockShowSaveDialog.mockResolvedValue({ canceled: true });
		await writeFile(sourcePath, "content", "utf8");
		mockState = makeState([{ ...BASE_DESCRIPTOR, uri: sourcePath }]);

		const outcome = await desktopDocumentExportService.exportArtifact("session-1", "artifact-1");

		expect(outcome.status).toBe("cancelled");
	});

	it("not-found：artifactId 不在会话投影中", async () => {
		const outcome = await desktopDocumentExportService.exportArtifact("session-1", "artifact-404");

		expect(outcome.status).toBe("not-found");
	});

	it("file:// scheme 的 uri 也能定位到本机源文件", async () => {
		const target = join(root, "file-scheme-target.md");
		mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: target });
		await writeFile(sourcePath, "file scheme", "utf8");
		mockState = makeState([{ ...BASE_DESCRIPTOR, uri: pathToFileURL(sourcePath).href }]);

		const outcome = await desktopDocumentExportService.exportArtifact("session-1", "artifact-1");

		expect(outcome.status).toBe("exported");
		if (outcome.status !== "exported") return;
		expect(await readFile(target, "utf8")).toBe("file scheme");
	});

	it("远程 SSH 产物不走本机复制，返回 not-exportable", async () => {
		mockState = makeState([{ ...BASE_DESCRIPTOR, uri: "ssh://host/project/notes.md" }]);

		const outcome = await desktopDocumentExportService.exportArtifact("session-1", "artifact-1");

		expect(outcome.status).toBe("not-exportable");
		expect(mockShowSaveDialog).not.toHaveBeenCalled();
	});
});
