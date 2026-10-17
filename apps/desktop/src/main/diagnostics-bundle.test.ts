// Modified by The Open Forge contributors.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodingToolInspection } from "@vetta/runtime-node/coding";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it, vi } from "vitest";

let tempRoot: string | undefined;

vi.mock("electron", () => ({
	app: {
		getPath: (_kind: string) => tempRoot ?? tmpdir(),
		getVersion: () => "0.0.0-test",
		getLocale: () => "en-US",
	},
}));

vi.mock("./logger", () => ({
	APP_LOG_TYPE_LIST: [],
	getAppLogBaseDir: () => tempRoot ?? tmpdir(),
	getAppLogger: () => ({ warn: vi.fn() }),
}));

vi.mock("./logger/log-ring-buffer", () => ({
	logRingBuffer: { snapshot: () => [] },
}));

vi.mock("./app-monitor/perf-monitor-service", () => ({
	getPerfMonitorReport: () => ({ note: "test" }),
}));

import { buildDiagnosticsBundle } from "./diagnostics-bundle";

afterEach(() => {
	if (tempRoot) {
		rmSync(tempRoot, { recursive: true, force: true });
		tempRoot = undefined;
	}
});

function inspection(overrides: Partial<CodingToolInspection>): CodingToolInspection {
	return { tool: "fd", source: "missing", offline: false, ...overrides };
}

describe("diagnostics bundle managed tools", () => {
	it("includes managed-tools.json with the inspected records", async () => {
		tempRoot = mkdtempSync(join(tmpdir(), "diagnostics-bundle-"));
		const { zipPath } = await buildDiagnosticsBundle({
			managedToolsInspector: async (tool) =>
				tool === "fd"
					? inspection({ tool: "fd", source: "cache", path: join(tempRoot as string, "fd.exe"), version: "9.9.9" })
					: inspection({ tool: "rg", source: "missing", offline: true }),
		});
		const zip = new AdmZip(zipPath);
		const entry = zip.getEntry("managed-tools.json");
		expect(entry).toBeDefined();
		const record = JSON.parse(entry!.getData().toString("utf-8")) as {
			toolsDirectory: string;
			tools: CodingToolInspection[];
		};
		expect(record.toolsDirectory).toContain(join("bin"));
		expect(record.tools).toHaveLength(2);
		expect(record.tools[0]).toMatchObject({ tool: "fd", source: "cache", version: "9.9.9" });
		expect(record.tools[1]).toMatchObject({ tool: "rg", source: "missing", offline: true });
		expect(zip.getEntry("system-info.json")).toBeDefined();
		expect(zip.getEntry("ring-buffer.ndjson")).toBeDefined();
	});

	it("keeps the export usable when managed tool collection fails", async () => {
		tempRoot = mkdtempSync(join(tmpdir(), "diagnostics-bundle-"));
		const { zipPath } = await buildDiagnosticsBundle({
			managedToolsInspector: async () => {
				throw new Error("tools directory unreadable");
			},
		});
		const zip = new AdmZip(zipPath);
		expect(zip.getEntry("managed-tools.json")).toBeNull();
		expect(zip.getEntry("system-info.json")).toBeDefined();
	});
});
