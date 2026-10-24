// Copyright The Open Forge contributors.
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeManager } from "./manager.js";
import { registryPath } from "./paths.js";

const probe = vi.hoisted(() => ({
	controller: new AbortController(),
	finish: undefined as (() => void) | undefined,
	started: undefined as (() => void) | undefined,
}));

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("./runtime-command.js", () => ({
	getRuntimePreparationSignal: () => probe.controller.signal,
	runRuntimeCommand: async () => {
		await new Promise<void>((resolve) => {
			probe.finish = resolve;
			probe.started?.();
		});
		return { status: null, stdout: "", stderr: "", error: new Error("cancelled") };
	},
}));

let root = "";
let originalAgentDir: string | undefined;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "runtime-shutdown-"));
	originalAgentDir = process.env.VETTA_CODING_AGENT_DIR;
	process.env.VETTA_CODING_AGENT_DIR = join(root, "agent");
	probe.controller = new AbortController();
});

afterEach(async () => {
	probe.finish?.();
	probe.finish = undefined;
	probe.started = undefined;
	if (originalAgentDir === undefined) delete process.env.VETTA_CODING_AGENT_DIR;
	else process.env.VETTA_CODING_AGENT_DIR = originalAgentDir;
	await rm(root, { recursive: true, force: true });
});

describe("runtime preparation shutdown", () => {
	it("does not begin installation, download or registry writes after an interrupted startup probe", async () => {
		const fetchImpl = vi.fn<typeof fetch>();
		const manager = new RuntimeManager({ fetchImpl });
		const started = new Promise<void>((resolve) => {
			probe.started = resolve;
		});
		const initialization = manager.initialize();
		await started;
		probe.controller.abort();
		probe.finish?.();
		await initialization;
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(existsSync(registryPath())).toBe(false);
	});

	it("cancels a settings refresh without publishing partial detection results", async () => {
		const manager = new RuntimeManager({ fetchImpl: vi.fn<typeof fetch>() });
		const started = new Promise<void>((resolve) => {
			probe.started = resolve;
		});
		const refresh = manager.redetect();
		const cancelled = expect(refresh).rejects.toMatchObject({ name: "AbortError" });
		await started;
		probe.controller.abort();
		probe.finish?.();
		await cancelled;
		expect(existsSync(registryPath())).toBe(false);
	});
});
