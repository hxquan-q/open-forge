// Copyright The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "./cli.mjs";

const roots = [];
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "forge-autonomy-cli-"));
	roots.push(root);
	mkdirSync(join(root, "project/tasks"), { recursive: true });
	for (const file of ["autonomy-policy.json", "agents.json"])
		writeFileSync(
			join(root, "project", file),
			readFileSync(fileURLToPath(new URL(`../../project/${file}`, import.meta.url))),
		);
	const fixturePolicy = JSON.parse(readFileSync(join(root, "project/autonomy-policy.json"), "utf8"));
	fixturePolicy.level = 0;
	fixturePolicy.capabilities = [];
	fixturePolicy.allowedProviders = [];
	writeFileSync(join(root, "project/autonomy-policy.json"), JSON.stringify(fixturePolicy));
	writeFileSync(
		join(root, "project/tasks/TASK-0001-feature.md"),
		`---\nid: TASK-0001\ntype: task\nstatus: ready\npriority: P1\nowner: fixture\nsource: user-request\nexecution: serial\nbranch: unassigned\nworktree: unassigned\nbase_commit: ${"a".repeat(40)}\nread_paths: [feature.txt]\nwrite_paths: [feature.txt]\nexclusive_paths: []\ndepends_on: []\nconflicts_with: []\nintegration_status: pending\ncreated: 2026-10-19\nupdated: 2026-10-19\n---\n# Fix feature\n`,
	);
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("public autonomy command line", () => {
	it("doctor and uninitialized status remain read-only and report disabled execution honestly", async () => {
		const root = fixture();
		const state = join(root, "state");
		const before = readdirSync(root);
		const doctor = await main(["doctor", "--repo", root]);
		expect(doctor.contractValid).toBe(true);
		expect(doctor.readyForModelExecution).toBe(false);
		expect(await main(["status", "--repo", root, "--state-dir", state])).toMatchObject({ initialized: false });
		expect(existsSync(state)).toBe(false);
		expect(readdirSync(root)).toEqual(before);
		const output = execFileSync(
			process.execPath,
			[fileURLToPath(new URL("cli.mjs", import.meta.url)), "doctor", "--repo", root],
			{ encoding: "utf8", windowsHide: true },
		);
		expect(JSON.parse(output).targetLevel).toBe(4);
	});
	it("claims, reports, pauses, resumes, and releases one Task through the same CLI", async () => {
		const root = fixture();
		const common = ["--repo", root, "--state-dir", join(root, "controller")];
		const token = await main([
			"claim",
			...common,
			"--task",
			"TASK-0001",
			"--holder",
			"human:fixture",
			"--run-id",
			"run-one",
		]);
		expect(token.generation).toBe(1);
		expect((await main(["status", ...common])).leases[0].status).toBe("active");
		await main(["pause", ...common]);
		await expect(
			main(["claim", ...common, "--task", "TASK-0001", "--holder", "human:other", "--run-id", "run-two"]),
		).rejects.toThrow(/paused/);
		await main(["resume", ...common]);
		await main(["release", ...common, "--run-id", "run-one"]);
		expect((await main(["status", ...common])).leases[0].status).toBe("released");
	});
	it("does not reinterpret unknown options or duplicate flags as data", async () => {
		await expect(main(["doctor", "--shell", "true"])).rejects.toThrow(/invalid option/);
		await expect(main(["doctor", "--repo", "one", "--repo", "two"])).rejects.toThrow(/duplicate/);
	});
});
