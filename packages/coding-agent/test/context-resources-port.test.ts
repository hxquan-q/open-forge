// Modified by The Open Forge contributors.
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ResourceAccessPort } from "../src/resources/contracts/resource-access.js";
import {
	discoverPromptFile,
	loadProjectContextFiles,
	resolvePromptInput,
} from "../src/resources/runtime/context-resources.js";

function createMemoryResourceAccess(
	entries: Readonly<Record<string, string>>,
	readFailures: ReadonlySet<string> = new Set(),
): ResourceAccessPort {
	const files = new Map(Object.entries(entries));
	return {
		files: {
			async stat(resourcePath) {
				if (files.has(resourcePath))
					return { kind: "file", modifiedAtMs: 0, size: files.get(resourcePath)!.length };
				const prefix = resourcePath.endsWith("/") ? resourcePath : `${resourcePath}/`;
				return [...files].some(([candidate]) => candidate.startsWith(prefix))
					? { kind: "directory", modifiedAtMs: 0, size: 0 }
					: undefined;
			},
			async readText(resourcePath) {
				if (readFailures.has(resourcePath)) throw new Error("unreadable");
				const content = files.get(resourcePath);
				if (content === undefined) throw new Error("missing");
				return content;
			},
			async readDirectory() {
				return [];
			},
			async realPath(resourcePath) {
				return resourcePath;
			},
		},
		paths: {
			separator: path.posix.sep,
			homeDirectory: () => "/home/test",
			basename: path.posix.basename,
			dirname: path.posix.dirname,
			isAbsolute: path.posix.isAbsolute,
			join: path.posix.join,
			relative: path.posix.relative,
			resolve: path.posix.resolve,
		},
	};
}

describe("context resources host port", () => {
	it("deduplicates normalized global paths and stops fan-out after a metadata failure", async () => {
		const base = createMemoryResourceAccess({ "/workspace/AGENTS.md": "only once" });
		const stat = vi.fn(base.files.stat);
		const access: ResourceAccessPort = { ...base, files: { ...base.files, stat } };
		const loaded = await loadProjectContextFiles(access, "/workspace/project", "/workspace/");
		expect(loaded).toEqual([{ path: "/workspace/AGENTS.md", content: "only once" }]);
		expect(stat.mock.calls.filter(([path]) => path === "/workspace/AGENTS.md")).toHaveLength(1);
		const failed = vi.fn(async (_path: string, options?: { signal?: AbortSignal }) => {
			if (failed.mock.calls.length === 1) throw new Error("metadata unavailable");
			return new Promise<undefined>((_resolve, reject) =>
				options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true }),
			);
		});
		await expect(
			loadProjectContextFiles({ ...base, files: { ...base.files, stat: failed } }, "/a/b/c", "/agent"),
		).rejects.toThrow("metadata unavailable");
		expect(failed).toHaveBeenCalledTimes(4);
		await expect(loadProjectContextFiles(base, "/workspace/project", "/workspace/")).resolves.toHaveLength(1);
	});

	it("overlaps bounded metadata reads while preserving global, ancestor and filename order", async () => {
		vi.useFakeTimers();
		try {
			const entries = {
				"/agent/AGENTS.md": "global",
				"/CLAUDE.md": "root",
				"/workspace/AGENTS.md": "workspace",
				"/workspace/project/CLAUDE.md": "project",
			};
			const access = createMemoryResourceAccess(entries);
			const stat = access.files.stat;
			let active = 0;
			let peak = 0;
			const delayed: ResourceAccessPort = {
				...access,
				files: {
					...access.files,
					stat: async (resourcePath, options) => {
						active++;
						peak = Math.max(peak, active);
						await new Promise((resolve) => setTimeout(resolve, 10));
						active--;
						return stat(resourcePath, options);
					},
				},
			};
			const start = Date.now();
			const loading = loadProjectContextFiles(delayed, "/workspace/project", "/agent");
			await vi.runAllTimersAsync();
			const result = await loading;
			expect(result.map((item) => item.path)).toEqual(Object.keys(entries));
			expect(peak).toBeGreaterThan(1);
			expect(peak).toBeLessThanOrEqual(4);
			expect(Date.now() - start).toBeLessThanOrEqual(20);
		} finally {
			vi.useRealTimers();
		}
	});

	it("loads both instruction files from global and project directories, with local AGENTS.md last", async () => {
		const access = createMemoryResourceAccess({
			"/agent/AGENTS.md": "global agents",
			"/agent/CLAUDE.md": "global claude",
			"/workspace/CLAUDE.md": "workspace claude",
			"/workspace/project/AGENTS.md": "project agents",
			"/workspace/project/CLAUDE.md": "project claude",
		});

		await expect(loadProjectContextFiles(access, "/workspace/project", "/agent")).resolves.toEqual([
			{ path: "/agent/CLAUDE.md", content: "global claude" },
			{ path: "/agent/AGENTS.md", content: "global agents" },
			{ path: "/workspace/CLAUDE.md", content: "workspace claude" },
			{ path: "/workspace/project/CLAUDE.md", content: "project claude" },
			{ path: "/workspace/project/AGENTS.md", content: "project agents" },
		]);
	});

	it("loads CLAUDE.md alone and continues after an unreadable instruction file", async () => {
		const agentsPath = "/workspace/AGENTS.md";
		const access = createMemoryResourceAccess(
			{ [agentsPath]: "unavailable", "/workspace/CLAUDE.md": "usable" },
			new Set([agentsPath]),
		);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await expect(loadProjectContextFiles(access, "/workspace", "/agent")).resolves.toEqual([
				{ path: "/workspace/CLAUDE.md", content: "usable" },
			]);
			expect(error).toHaveBeenCalledOnce();
		} finally {
			error.mockRestore();
		}
	});

	it("prefers the project prompt and resolves file or literal input through the port", async () => {
		const access = createMemoryResourceAccess({
			"/agent/SYSTEM.md": "global prompt",
			"/workspace/.vetta/SYSTEM.md": "project prompt",
		});

		await expect(discoverPromptFile(access, "/workspace", "/agent", "SYSTEM.md")).resolves.toBe(
			"/workspace/.vetta/SYSTEM.md",
		);
		await expect(resolvePromptInput(access, "/workspace/.vetta/SYSTEM.md", "system prompt")).resolves.toBe(
			"project prompt",
		);
		await expect(resolvePromptInput(access, "literal prompt", "system prompt")).resolves.toBe("literal prompt");
	});

	it("preserves the input path when an existing prompt file cannot be read", async () => {
		const promptPath = "/workspace/.vetta/SYSTEM.md";
		const access = createMemoryResourceAccess({ [promptPath]: "unavailable" }, new Set([promptPath]));
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await expect(resolvePromptInput(access, promptPath, "system prompt")).resolves.toBe(promptPath);
			expect(error).toHaveBeenCalledOnce();
		} finally {
			error.mockRestore();
		}
	});

	it("propagates cancellation instead of treating it as a recoverable read failure", async () => {
		const promptPath = "/workspace/.vetta/SYSTEM.md";
		const access = createMemoryResourceAccess({ [promptPath]: "unavailable" }, new Set([promptPath]));
		const controller = new AbortController();
		controller.abort();

		await expect(resolvePromptInput(access, promptPath, "system prompt", controller.signal)).rejects.toMatchObject({
			name: "AbortError",
		});
	});
});
