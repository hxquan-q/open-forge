// Modified by The Open Forge contributors.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	applyDownloadFailureRecord,
	type CodingToolArchiveOperations,
	type CodingToolCommandProbe,
	type CodingToolHttpResponse,
	type CodingToolInspection,
	createCodingToolDownloadPlan,
	createManagedCodingToolExecutableResolver,
	downloadCodingToolArchiveWithRetry,
	fetchLatestCodingToolVersion,
	inspectManagedCodingToolExecutable,
	installCodingToolArchive,
	type ManagedCodingToolExecutableDependencies,
	type ManagedCodingToolInspectionDependencies,
	parseCodingToolVersionOutput,
	parseLatestReleaseVersion,
	resolveManagedCodingToolExecutable,
} from "../../src/coding/index.js";

function createDependencies(
	overrides: Partial<ManagedCodingToolExecutableDependencies> = {},
): ManagedCodingToolExecutableDependencies {
	return {
		getPath: () => null,
		isOffline: () => false,
		platform: () => "linux",
		download: async (tool) => `${tool}-downloaded`,
		...overrides,
	};
}

describe("managed coding-tool executables", () => {
	it("adapts custom resolution and preserves unavailable tools", async () => {
		const calls: string[] = [];
		const resolver = createManagedCodingToolExecutableResolver({
			toolsDirectory: "C:/vetta/bin",
			resolveExecutable: async (tool, silent) => {
				calls.push(`${tool}:${silent}`);
				return tool === "rg" ? "rg-path" : undefined;
			},
		});
		await expect(resolver.resolve("rg")).resolves.toBe("rg-path");
		await expect(resolver.resolve("fd")).resolves.toBeUndefined();
		expect(calls).toEqual(["rg:true", "fd:true"]);
	});

	it("prefers existing tools and skips downloads while offline or on Android", async () => {
		let downloads = 0;
		const download = async () => {
			downloads += 1;
			return "/downloaded/tool";
		};
		await expect(
			resolveManagedCodingToolExecutable("rg", true, createDependencies({ getPath: () => "/managed/rg", download })),
		).resolves.toBe("/managed/rg");
		await expect(
			resolveManagedCodingToolExecutable("rg", true, createDependencies({ isOffline: () => true, download })),
		).resolves.toBeUndefined();
		await expect(
			resolveManagedCodingToolExecutable("fd", true, createDependencies({ platform: () => "android", download })),
		).resolves.toBeUndefined();
		expect(downloads).toBe(0);
	});

	it("returns downloaded paths and maps download failures to unavailable", async () => {
		await expect(
			resolveManagedCodingToolExecutable("fd", true, createDependencies({ download: async () => "/downloaded/fd" })),
		).resolves.toBe("/downloaded/fd");
		const failures: Array<[string, string]> = [];
		await expect(
			resolveManagedCodingToolExecutable(
				"rg",
				true,
				createDependencies({
					download: async () => Promise.reject(new Error("offline")),
					recordFailure: (tool, message) => failures.push([tool, message]),
				}),
			),
		).resolves.toBeUndefined();
		expect(failures).toEqual([["rg", "offline"]]);
	});

	it.each([
		["fd", "1.0.0", "darwin", "arm64", "fd-v1.0.0-aarch64-apple-darwin.tar.gz", "fd"],
		["fd", "1.0.0", "win32", "x64", "fd-v1.0.0-x86_64-pc-windows-msvc.zip", "fd.exe"],
		["rg", "14.1.0", "linux", "arm64", "ripgrep-14.1.0-aarch64-unknown-linux-gnu.tar.gz", "rg"],
		["rg", "14.1.0", "linux", "x64", "ripgrep-14.1.0-x86_64-unknown-linux-musl.tar.gz", "rg"],
	] as const)("creates the %s %s %s/%s download plan", (tool, version, platform, architecture, asset, binary) => {
		const plan = createCodingToolDownloadPlan({
			tool,
			version,
			platform,
			architecture,
			toolsDirectory: "C:/vetta/bin",
		});
		expect(plan?.assetName).toBe(asset);
		expect(plan?.binaryFileName).toBe(binary);
		expect(plan?.version).toBe(version);
		expect(plan?.downloadUrl).toContain(`/releases/download/${tool === "fd" ? "v" : ""}${version}/`);
	});

	it("returns no plan for unsupported platforms", () => {
		expect(
			createCodingToolDownloadPlan({
				tool: "rg",
				version: "14.1.0",
				platform: "freebsd",
				architecture: "x64",
				toolsDirectory: "C:/vetta/bin",
			}),
		).toBeUndefined();
	});

	it.each([
		["darwin", ".tar.gz", true],
		["win32", ".zip", false],
	] as const)("installs %s archives and always cleans staging files", async (platform, extension, chmod) => {
		const plan = createCodingToolDownloadPlan({
			tool: platform === "win32" ? "rg" : "fd",
			version: platform === "win32" ? "14.1.0" : "1.0.0",
			platform,
			architecture: "x64",
			toolsDirectory: "C:/vetta/bin",
		});
		if (!plan || !plan.assetName.endsWith(extension)) throw new Error("expected matching plan");
		const extractDirectory = "C:/vetta/extract";
		const binary = join(extractDirectory, plan.binaryFileName);
		const calls: string[] = [];
		const operations: CodingToolArchiveOperations = {
			extractTarGz: () => calls.push("tar"),
			extractZip: async () => {
				calls.push("zip");
			},
			fileExists: (path) => path === binary,
			findBinary: () => null,
			moveFile: () => calls.push("move"),
			makeExecutable: () => calls.push("chmod"),
			removeFile: () => calls.push("remove-file"),
			removeDirectory: () => calls.push("remove-directory"),
			writeVersionMarker: (markerPath, version) => calls.push(`version:${markerPath}:${version}`),
		};
		await expect(installCodingToolArchive({ plan, extractDirectory, platform, operations })).resolves.toBe(
			plan.binaryPath,
		);
		expect(calls).toEqual([
			platform === "win32" ? "zip" : "tar",
			"move",
			...(chmod ? ["chmod"] : []),
			`version:${join("C:/vetta/bin", `${plan.binaryFileName.replace(/\.exe$/, "")}.version`)}:${plan.version}`,
			"remove-file",
			"remove-directory",
		]);
	});

	it("keeps the install successful when the version marker write fails", async () => {
		const plan = createCodingToolDownloadPlan({
			tool: "rg",
			version: "14.1.0",
			platform: "linux",
			architecture: "x64",
			toolsDirectory: "C:/vetta/bin",
		});
		if (!plan) throw new Error("expected plan");
		const cleanup: string[] = [];
		const operations: CodingToolArchiveOperations = {
			extractTarGz: () => {},
			extractZip: async () => {},
			fileExists: () => true,
			findBinary: () => null,
			moveFile: () => {},
			makeExecutable: () => {},
			removeFile: () => cleanup.push("file"),
			removeDirectory: () => cleanup.push("directory"),
			writeVersionMarker: () => {
				throw new Error("disk full");
			},
		};
		await expect(
			installCodingToolArchive({ plan, extractDirectory: "C:/extract", platform: "linux", operations }),
		).resolves.toBe(plan.binaryPath);
		expect(cleanup).toEqual(["file", "directory"]);
	});

	it("cleans staging files when an archive has no binary", async () => {
		const plan = createCodingToolDownloadPlan({
			tool: "rg",
			version: "14.1.0",
			platform: "linux",
			architecture: "x64",
			toolsDirectory: "C:/vetta/bin",
		});
		if (!plan) throw new Error("expected plan");
		const cleanup: string[] = [];
		const operations: CodingToolArchiveOperations = {
			extractTarGz: () => {},
			extractZip: async () => {},
			fileExists: () => false,
			findBinary: () => null,
			moveFile: () => {},
			makeExecutable: () => {},
			removeFile: () => cleanup.push("file"),
			removeDirectory: () => cleanup.push("directory"),
			writeVersionMarker: () => cleanup.push("version"),
		};
		await expect(
			installCodingToolArchive({ plan, extractDirectory: "C:/extract", platform: "linux", operations }),
		).rejects.toThrow("Binary not found in archive");
		expect(cleanup).toEqual(["file", "directory"]);
	});

	describe("managed coding-tool inspection", () => {
		function createInspectionDependencies(overrides: Partial<ManagedCodingToolInspectionDependencies> = {}): {
			dependencies: ManagedCodingToolInspectionDependencies;
			probedCommands: string[];
		} {
			const probedCommands: string[] = [];
			const overrideProbe = overrides.probeCommand;
			return {
				probedCommands,
				dependencies: {
					getCachedPath: () => null,
					readVersionMarker: () => null,
					isOffline: () => false,
					...overrides,
					probeCommand: (command: string): CodingToolCommandProbe => {
						probedCommands.push(command);
						return overrideProbe ? overrideProbe(command) : { exists: false };
					},
				},
			};
		}

		it("reports cache hits from the version marker without probing the binary", () => {
			const { dependencies, probedCommands } = createInspectionDependencies({
				getCachedPath: () => "/managed/rg",
				readVersionMarker: () => "14.1.0",
			});
			expect(inspectManagedCodingToolExecutable("rg", dependencies)).toEqual({
				tool: "rg",
				source: "cache",
				path: "/managed/rg",
				version: "14.1.0",
				offline: false,
			});
			expect(probedCommands).toEqual([]);
		});

		it("falls back to one probe for legacy caches without a marker", () => {
			const { dependencies, probedCommands } = createInspectionDependencies({
				getCachedPath: () => "/managed/fd",
				readVersionMarker: () => null,
				probeCommand: () => ({ exists: true, version: "9.0.0" }),
			});
			expect(inspectManagedCodingToolExecutable("fd", dependencies)).toEqual({
				tool: "fd",
				source: "cache",
				path: "/managed/fd",
				version: "9.0.0",
				offline: false,
			});
			expect(probedCommands).toEqual(["/managed/fd"]);
		});

		it("reports PATH tools with their probed version", () => {
			const { dependencies, probedCommands } = createInspectionDependencies({
				probeCommand: (command) => (command === "rg" ? { exists: true, version: "14.1.0" } : { exists: false }),
			});
			expect(inspectManagedCodingToolExecutable("rg", dependencies)).toEqual({
				tool: "rg",
				source: "path",
				path: "rg",
				version: "14.1.0",
				offline: false,
			});
			expect(probedCommands).toEqual(["rg"]);
		});

		it("reports missing tools with the offline flag", () => {
			const { dependencies } = createInspectionDependencies({ isOffline: () => true });
			expect(inspectManagedCodingToolExecutable("fd", dependencies)).toEqual({
				tool: "fd",
				source: "missing",
				offline: true,
			});
		});

		it("exposes inspection through the resolver and upgrades recorded download failures", async () => {
			const { dependencies } = createInspectionDependencies();
			const resolver = createManagedCodingToolExecutableResolver({
				toolsDirectory: "C:/vetta/bin",
				resolveExecutable: async () => undefined,
				inspectionDependencies: dependencies,
			});
			await expect(resolver.inspect?.("rg")).resolves.toEqual({ tool: "rg", source: "missing", offline: false });
		});

		it("merges failure history without overriding resolvable sources", () => {
			const cache: CodingToolInspection = {
				tool: "rg",
				source: "cache",
				path: "/managed/rg",
				version: "1.0.0",
				offline: false,
			};
			expect(applyDownloadFailureRecord(cache, undefined)).toBe(cache);
			expect(applyDownloadFailureRecord(cache, "boom")).toEqual({ ...cache, lastError: "boom" });
			const missing: CodingToolInspection = { tool: "rg", source: "missing", offline: false };
			expect(applyDownloadFailureRecord(missing, "boom")).toEqual({
				...missing,
				source: "download-failed",
				lastError: "boom",
			});
		});

		it("parses versions from --version outputs", () => {
			expect(parseCodingToolVersionOutput("ripgrep 14.1.0\nfeatures: +pcre2\n")).toBe("14.1.0");
			expect(parseCodingToolVersionOutput("fd 9.0.0\n")).toBe("9.0.0");
			expect(parseCodingToolVersionOutput("v1.2.3-rc1\n")).toBe("1.2.3-rc1");
			expect(parseCodingToolVersionOutput("fd v10.2.0\n")).toBe("10.2.0");
			expect(parseCodingToolVersionOutput("")).toBeUndefined();
		});
	});

	it("parses latest releases and retries transient downloads", async () => {
		expect(parseLatestReleaseVersion({ tag_name: "v1.2.3" })).toBe("1.2.3");
		expect(() => parseLatestReleaseVersion({ tag_name: 14 })).toThrow("missing tag_name");
		let releaseUrl = "";
		const releaseRequest = async (url: string): Promise<CodingToolHttpResponse> => {
			releaseUrl = url;
			return {
				ok: true,
				status: 200,
				json: async () => ({ tag_name: "v1.2.3" }),
				arrayBuffer: async () => new ArrayBuffer(0),
			};
		};
		await expect(fetchLatestCodingToolVersion("sharkdp/fd", releaseRequest)).resolves.toBe("1.2.3");
		expect(releaseUrl).toContain("sharkdp/fd/releases/latest");

		const directory = mkdtempSync(join(tmpdir(), "runtime-node-download-"));
		const destination = join(directory, "tool.archive");
		let requests = 0;
		const downloadRequest = async (): Promise<CodingToolHttpResponse> => {
			requests += 1;
			if (requests < 3) throw new TypeError("temporary network failure");
			return {
				ok: true,
				status: 200,
				json: async () => ({}),
				arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
			};
		};
		try {
			await downloadCodingToolArchiveWithRetry("https://example.test/tool", destination, downloadRequest, {
				retryDelayMs: 0,
			});
			expect(requests).toBe(3);
			expect(readFileSync(destination)).toEqual(Buffer.from([1, 2, 3]));
			expect(existsSync(destination)).toBe(true);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
