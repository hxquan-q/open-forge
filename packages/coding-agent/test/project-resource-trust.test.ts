// Modified by The Open Forge contributors.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeResourceAccess, NodeProjectTrustStore } from "@vetta/runtime-node/host";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG_DIR_NAME } from "../src/config.js";
import { createNonInteractiveProjectResourceTrustPort } from "../src/host/sdk-session/resource-runtime.js";
import type {
	ProjectResourceTrustDecision,
	ProjectResourceTrustPort,
} from "../src/resources/contracts/project-resource-trust.js";
import {
	type CreateTestSessionResourceRuntimeOptions,
	createTestSessionResourceRuntime,
} from "./fixtures/node-resource-runtime.js";

function portFor(decision: ProjectResourceTrustDecision): ProjectResourceTrustPort {
	return { decideProjectResourceTrust: async () => decision };
}

function failingPort(): ProjectResourceTrustPort {
	return {
		decideProjectResourceTrust: async () => {
			throw new Error("boom");
		},
	};
}

function createRuntime(options: CreateTestSessionResourceRuntimeOptions = {}) {
	const isolatedRoot = options.agentDir ?? options.cwd ?? process.cwd();
	const baseResourceAccess = options.resourceAccess ?? createNodeResourceAccess();
	const resourceAccess = {
		...baseResourceAccess,
		paths: { ...baseResourceAccess.paths, homeDirectory: () => isolatedRoot },
	};
	return createTestSessionResourceRuntime({
		...options,
		resourceAccess,
		skillLocations: {
			sceneDir: join(isolatedRoot, "scene"),
			managedSkillsDir: join(isolatedRoot, "managed-skills"),
			manifestPath: join(isolatedRoot, "skills-manifest.json"),
		},
	});
}

describe("工作区信任门禁（GHSA-mqxh）", () => {
	let tempDir: string;
	let agentDir: string;
	let cwd: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `prt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		cwd = join(tempDir, "project");
		mkdirSync(join(agentDir, "skills"), { recursive: true });
		mkdirSync(join(cwd, CONFIG_DIR_NAME, "skills"), { recursive: true });
		writeFileSync(
			join(agentDir, "skills", "user-skill.md"),
			`---
name: user-skill
description: user scope
---
user content`,
		);
		writeFileSync(
			join(cwd, CONFIG_DIR_NAME, "skills", "project-skill.md"),
			`---
name: project-skill
description: project scope
---
project content`,
		);
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("未信任：项目技能不加载，用户技能不受影响，诊断可见", async () => {
		const runtime = createRuntime({
			cwd,
			agentDir,
			projectResourceTrust: portFor({ trusted: false, reason: "user-denied" }),
		});
		await runtime.reload();

		const names = runtime.getSkills().skills.map((skill) => skill.name);
		expect(names).toContain("user-skill");
		expect(names).not.toContain("project-skill");
		expect(runtime.getProjectResourceTrust()).toEqual({ trusted: false, reason: "user-denied" });
		expect(
			runtime
				.getSkills()
				.diagnostics.some(
					(diagnostic) => diagnostic.type === "warning" && diagnostic.message.includes("workspace trust denied"),
				),
		).toBe(true);
	});

	it("已信任：项目技能正常加载", async () => {
		const runtime = createRuntime({
			cwd,
			agentDir,
			projectResourceTrust: portFor({ trusted: true, reason: "trusted" }),
		});
		await runtime.reload();

		const names = runtime.getSkills().skills.map((skill) => skill.name);
		expect(names).toContain("project-skill");
		expect(names).toContain("user-skill");
	});

	it("未注入端口：保持域层中性放行（兼容既有组合）", async () => {
		const runtime = createRuntime({ cwd, agentDir });
		await runtime.reload();

		expect(runtime.getSkills().skills.map((skill) => skill.name)).toContain("project-skill");
	});

	it("端口抛错：fail closed，项目资源不加载", async () => {
		const runtime = createRuntime({ cwd, agentDir, projectResourceTrust: failingPort() });
		await runtime.reload();

		expect(runtime.getSkills().skills.map((skill) => skill.name)).not.toContain("project-skill");
		expect(runtime.getProjectResourceTrust().trusted).toBe(false);
		expect(runtime.getProjectResourceTrust().reason).toContain("port-error");
	});
});

describe("createNonInteractiveProjectResourceTrustPort（决策④）", () => {
	let tempDir: string;
	let cwd: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `prt-ni-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		cwd = join(tempDir, "project");
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("默认拒绝", async () => {
		const port = createNonInteractiveProjectResourceTrustPort({ env: {} });
		await expect(port.decideProjectResourceTrust(cwd)).resolves.toEqual({
			trusted: false,
			reason: "non-interactive-untrusted",
		});
	});

	it("OPENFORGE_TRUST_PROJECT=1 显式信任", async () => {
		const port = createNonInteractiveProjectResourceTrustPort({ env: { OPENFORGE_TRUST_PROJECT: "1" } });
		await expect(port.decideProjectResourceTrust(cwd)).resolves.toEqual({ trusted: true, reason: "env-override" });
	});

	it("读取项目本地 trust.json 的既有授权（桌面端「信任并记住」写入）", async () => {
		const store = new NodeProjectTrustStore({ projectRoot: cwd });
		await store.grant({ capabilities: ["resources:project-load"] });
		const port = createNonInteractiveProjectResourceTrustPort({ env: {} });
		await expect(port.decideProjectResourceTrust(cwd)).resolves.toEqual({ trusted: true, reason: "trusted" });
	});
});
