import { describe, expect, it } from "vitest";
import {
	findIndexProblems,
	findRemovalBlockers,
	findScopeConflicts,
	findTaskProblems,
	findTreeProblems,
	findWorktreeCreateBlockers,
	hasDeclaredWorktree,
	isInside,
	normalizeContractPath,
	parseTaskDocument,
	pathsOverlap,
	resolveWorktreePath,
	scopePrefix,
	toDisplayPath,
	worktreeValue,
} from "./contract.mjs";

const ROOT = "C:\\repo";
const posix = (value) => value.replaceAll("\\", "/");

/** Build a Task document with only the frontmatter lines a case cares about. */
function task(fields) {
	const lines = Object.entries(fields).map(([key, value]) =>
		Array.isArray(value) ? `${key}: [${value.join(", ")}]` : `${key}: ${value}`,
	);
	return parseTaskDocument({
		file: `project/tasks/${fields.fileName ?? "TASK-0100-probe-task.md"}`,
		text: ["---", ...lines, "---", "", "# Body", ""].join("\n"),
	});
}

describe("task frontmatter parsing", () => {
	it("reads scalars, inline lists and block lists without interpreting prose", () => {
		const parsed = parseTaskDocument({
			file: "project/tasks/TASK-0100-probe-task.md",
			text: [
				"---",
				"id: TASK-0100",
				"status: in_progress",
				"integration_status: integrated（forge/dev 主工作区；随 f9a79d399 落地）",
				"write_paths:",
				"  - packages/ai/src",
				"  - packages/ai/test",
				"depends_on: [TASK-0002, TASK-0003]",
				"conflicts_with: []",
				"---",
				"",
				"# Body",
			].join("\n"),
		});

		expect(parsed.id).toBe("TASK-0100");
		expect(parsed.status).toBe("in_progress");
		expect(parsed.integrationStatus).toBe("integrated");
		expect(parsed.writePaths).toEqual(["packages/ai/src", "packages/ai/test"]);
		expect(parsed.dependsOn).toEqual(["TASK-0002", "TASK-0003"]);
		expect(parsed.conflictsWith).toEqual([]);
	});

	it("reports a missing frontmatter block instead of silently reading an empty contract", () => {
		const parsed = parseTaskDocument({ file: "project/tasks/TASK-0100-probe-task.md", text: "# No frontmatter\n" });
		expect(parsed.present).toBe(false);
		expect(findTaskProblems(parsed)).not.toEqual([]);
	});
});

describe("scope path validation", () => {
	it("accepts repository-relative files, directories and globs", () => {
		for (const input of ["packages/ai/src", "package.json", ".github/release-notes", "packages/**/package.json"]) {
			expect(normalizeContractPath(input), input).toEqual({ path: input });
		}
	});

	it("normalizes Windows separators, dot segments and trailing slashes", () => {
		expect(normalizeContractPath("packages\\ai\\src\\")).toEqual({ path: "packages/ai/src" });
		expect(normalizeContractPath("apps/desktop/./src")).toEqual({ path: "apps/desktop/src" });
		expect(normalizeContractPath("./.").problem).toContain("repository root");
	});

	it("rejects paths that leave the repository or name nothing", () => {
		for (const input of ["../outside", "packages/../../etc", "/absolute/path", "C:\\absolute", "", ".", "a//b"]) {
			const result = normalizeContractPath(input);
			expect(result.problem, input).toBeTruthy();
		}
	});

	it("reports an escaping path as a problem rather than throwing", () => {
		const parsed = task({ id: "TASK-0100", write_paths: ["../outside"] });
		expect(parsed.findings.map((finding) => finding.message).join("\n")).toContain("escapes the repository");
	});
});

describe("scope overlap", () => {
	it("computes the static prefix of a claim", () => {
		expect(scopePrefix("packages/ai/src")).toBe("packages/ai/src");
		expect(scopePrefix("packages/**/package.json")).toBe("packages");
		expect(scopePrefix("**/package.json")).toBe("");
	});

	const cases = [
		["packages/ai/src", "packages/ai/src", true],
		["packages/ai", "packages/ai/src", true],
		["packages/ai/src", "packages/ai", true],
		["packages/ai/src", "packages/ai/test", false],
		["packages/ai", "packages/agent", false],
		["packages/ai/src", "packages/ai/src-extra", false],
		["apps/desktop/./src", "apps/desktop/src", true],
		["packages/**/package.json", "packages/ai/src", true],
		["**/package.json", "apps/desktop/src/main.ts", true],
	];

	it.each(cases)("%s ∩ %s → %s", (left, right, expected) => {
		expect(pathsOverlap(left, right)).toBe(expected);
	});

	it("treats a Windows-separated claim as the same scope", () => {
		expect(pathsOverlap("packages\\ai\\src", "packages/ai/src")).toBe(true);
	});
});

describe("worktree field", () => {
	it("accepts annotated placeholders as 'no worktree'", () => {
		for (const value of [
			"unassigned",
			"unassigned（原 worktree 已淘汰）",
			"main-workspace",
			"shared-workspace",
			"none",
		]) {
			expect(hasDeclaredWorktree(value), value).toBe(false);
			expect(resolveWorktreePath(value, ROOT), value).toEqual({ kind: "none" });
		}
	});

	it("strips a trailing annotation from a real path", () => {
		expect(worktreeValue("..\\open-forge-wt\\task-0200-probe（已淘汰）")).toBe("..\\open-forge-wt\\task-0200-probe");
	});

	it("classifies a relative claim as portable and resolves it against the primary checkout", () => {
		const resolved = resolveWorktreePath("../open-forge-wt/task-0200-probe", ROOT);
		expect(resolved).toMatchObject({ kind: "path", portable: true });
		expect(posix(resolved.absolute).endsWith("/repo/../open-forge-wt/task-0200-probe")).toBe(false);
		expect(posix(resolved.absolute)).toContain("open-forge-wt/task-0200-probe");
	});

	it("flags an absolute claim as machine-specific", () => {
		expect(resolveWorktreePath("C:\\repo-wt\\task-0200-probe", ROOT)).toMatchObject({ portable: false });
	});

	it("takes the first token when a path carries trailing prose", () => {
		expect(resolveWorktreePath("forge/dev 主工作区", ROOT)).toMatchObject({ kind: "path", portable: true });
	});
});

describe("containment", () => {
	it("recognizes nested, equal, sibling and Windows-case variants", () => {
		expect(isInside("C:\\repo", "C:\\repo\\sub")).toBe(true);
		expect(isInside("C:\\repo", "C:\\repo")).toBe(true);
		expect(isInside("C:\\repo", "C:\\repo-wt")).toBe(false);
		expect(isInside("C:\\repo", "C:\\other\\repo\\sub")).toBe(false);
	});

	it("renders a display path relative to the primary checkout", () => {
		expect(toDisplayPath("C:\\repo\\project\\tasks\\TASK-0100-probe-task.md", ROOT)).toBe(
			"project/tasks/TASK-0100-probe-task.md",
		);
		expect(toDisplayPath("C:\\repo-wt\\x", ROOT)).toBe("C:/repo-wt/x");
	});
});

describe("per-task contract findings", () => {
	const base = {
		id: "TASK-0100",
		status: "ready",
		execution: "parallel",
		priority: "P2",
		owner: "packages/ai",
		created: "2026-09-24",
		updated: "2026-09-24",
		integration_status: "pending",
	};

	it("accepts a complete parallel task with a declared worktree", () => {
		const parsed = task({
			...base,
			branch: "task/TASK-0100-probe-task",
			worktree: "../open-forge-wt/task-0100-probe-task",
			base_commit: "abc1234",
			write_paths: ["packages/ai/src"],
		});
		expect(findTaskProblems(parsed, { knownIds: new Set(["TASK-0100"]), strict: true })).toEqual([]);
	});

	it("accepts a parallel task executed in the integration checkout", () => {
		const parsed = task({ ...base, branch: "forge/dev", worktree: "unassigned（forge/dev 主工作区）" });
		expect(findTaskProblems(parsed, { knownIds: new Set(["TASK-0100"]), strict: true })).toEqual([]);
	});

	it("rejects an active non-parallel task that declares a separate worktree", () => {
		const parsed = task({
			...base,
			execution: "serial",
			branch: "task/TASK-0100-probe-task",
			worktree: "../open-forge-wt/task-0100-probe-task",
			base_commit: "abc1234",
			write_paths: ["packages/ai/src"],
		});
		expect(
			findTaskProblems(parsed)
				.map((finding) => finding.message)
				.join("\\n"),
		).toContain("active serial task must not declare an independent worktree");
	});

	it("does not retroactively reject completed serial task worktree history", () => {
		const parsed = task({
			...base,
			status: "done",
			execution: "serial",
			branch: "forge/dev",
			worktree: "../open-forge-wt/task-0100-probe-task",
		});
		expect(findTaskProblems(parsed)).toEqual([]);
	});

	it("errors when id and filename disagree, because depends_on resolves by id", () => {
		const parsed = task({ ...base, id: "TASK-0101" });
		const messages = findTaskProblems(parsed)
			.map((finding) => finding.message)
			.join("\n");
		expect(messages).toContain("does not match filename prefix");
	});

	it("errors when a branch does not follow the task branch convention", () => {
		const parsed = task({ ...base, branch: "feature/whatever" });
		expect(
			findTaskProblems(parsed)
				.map((finding) => finding.message)
				.join("\n"),
		).toContain("must match task/TASK-");
	});

	it("errors on a dangling task dependency and accepts cross-module blockers", () => {
		const dangling = task({ ...base, depends_on: ["TASK-0500"] });
		expect(
			findTaskProblems(dangling, { knownIds: new Set(["TASK-0100"]) })
				.map((finding) => finding.message)
				.join("\n"),
		).toContain('unknown task "TASK-0500"');

		const crossModule = task({ ...base, depends_on: ["ISSUE-0008", "PLAN-0002"] });
		expect(findTaskProblems(crossModule, { knownIds: new Set(["TASK-0100"]) })).toEqual([]);
	});

	it("errors on a self-reference", () => {
		const parsed = task({ ...base, conflicts_with: ["TASK-0100"] });
		expect(
			findTaskProblems(parsed)
				.map((finding) => finding.message)
				.join("\n"),
		).toContain("references the task itself");
	});

	it("warns about enumeration drift, and escalates it in strict mode", () => {
		const parsed = task({ ...base, status: "backlog", integration_status: "done" });
		const lenient = findTaskProblems(parsed);
		expect(lenient.every((finding) => finding.level === "warn")).toBe(true);
		expect(lenient).toHaveLength(2);
		expect(findTaskProblems(parsed, { strict: true }).every((finding) => finding.level === "error")).toBe(true);
	});

	it("requires the fields the template guarantees only in strict mode", () => {
		const parsed = task({ id: "TASK-0100", execution: "parallel", write_paths: ["packages/ai/src"] });
		expect(findTaskProblems(parsed)).toEqual([]);
		const strict = findTaskProblems(parsed, { strict: true }).map((finding) => finding.message);
		expect(strict.join("\n")).toContain("priority");
		expect(strict.join("\n")).toContain("owner");
		expect(strict.join("\n")).toContain("created");
		expect(strict.join("\n")).toContain("status is required");
	});

	it("requires branch, base_commit and write scope when a worktree is declared", () => {
		const parsed = task({
			...base,
			worktree: "../open-forge-wt/task-0100-probe-task",
			branch: "unassigned",
		});
		const messages = findTaskProblems(parsed, { strict: true })
			.map((finding) => finding.message)
			.join("\n");
		expect(messages).toContain("branch is not a task branch");
		expect(messages).toContain("base_commit is empty");
		expect(messages).toContain("write_paths is empty");
	});
});

describe("tree-level findings", () => {
	it("detects a depends_on cycle, which admits no integration order", () => {
		const tasks = [
			task({ id: "TASK-0100", fileName: "TASK-0100-a.md", depends_on: ["TASK-0101"] }),
			task({ id: "TASK-0101", fileName: "TASK-0101-b.md", depends_on: ["TASK-0100"] }),
		];
		const messages = findTreeProblems(tasks)
			.map((finding) => finding.message)
			.join("\n");
		expect(messages).toContain("depends_on cycle");
	});

	it("keeps tree-level reference findings even when a caller scopes the report", () => {
		const tasks = [
			task({ id: "TASK-0100", fileName: "TASK-0100-a.md", depends_on: ["TASK-0500"] }),
			task({ id: "TASK-0101", fileName: "TASK-0101-b.md", depends_on: ["TASK-0501"] }),
		];
		const scoped = findIndexProblems(tasks, { only: new Set(["TASK-0100"]) });
		const scopes = new Set(scoped.map((finding) => finding.scope));
		expect(scopes.has("project/tasks/TASK-0100-a.md")).toBe(true);
		expect(scopes.has("project/tasks/TASK-0101-b.md")).toBe(false);
		expect(scopes.has("project/tasks")).toBe(false);
	});
});

describe("concurrent scope conflicts", () => {
	const worktreeTask = (id, extra) =>
		task({
			id,
			fileName: `${id}-probe.md`,
			status: "in_progress",
			execution: "parallel",
			worktree: `../open-forge-wt/${id.toLowerCase()}-probe`,
			branch: `task/${id}-probe`,
			base_commit: "abc1234",
			write_paths: ["packages/ai/src"],
			...extra,
		});

	it("reports overlapping claims between two live worktrees", () => {
		const tasks = [
			worktreeTask("TASK-0100", { write_paths: ["packages/ai/src"] }),
			worktreeTask("TASK-0101", { exclusive_paths: ["packages/ai/src/providers"] }),
		];
		const conflicts = findScopeConflicts(tasks);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({ left: "TASK-0100", right: "TASK-0101" });
		expect(conflicts[0].detail.join(" ")).toContain("packages/ai/src");
	});

	it("does not report disjoint scopes", () => {
		const tasks = [
			worktreeTask("TASK-0100", { write_paths: ["packages/ai/src"] }),
			worktreeTask("TASK-0101", { write_paths: ["packages/agent/src"] }),
		];
		expect(findScopeConflicts(tasks)).toEqual([]);
	});

	it("detects overlapping scopes when a declaration contains a dot segment", () => {
		const tasks = [
			worktreeTask("TASK-0100", { write_paths: ["apps/desktop/./src"] }),
			worktreeTask("TASK-0101", { write_paths: ["apps/desktop/src"] }),
		];
		expect(findScopeConflicts(tasks)).toHaveLength(1);
	});

	it("stays silent when conflicts_with already records the relationship", () => {
		const tasks = [
			worktreeTask("TASK-0100", { conflicts_with: ["TASK-0101"] }),
			worktreeTask("TASK-0101", { conflicts_with: ["TASK-0100"] }),
		];
		expect(findScopeConflicts(tasks)).toEqual([]);
	});

	it("ignores serial tasks because they do not claim concurrent worktree scope", () => {
		const tasks = [worktreeTask("TASK-0100"), worktreeTask("TASK-0101", { execution: "serial" })];
		expect(findScopeConflicts(tasks)).toEqual([]);
	});

	it("ignores tasks executed in the integration checkout, which cannot run concurrently", () => {
		const tasks = [
			worktreeTask("TASK-0100"),
			task({
				id: "TASK-0101",
				fileName: "TASK-0101-probe.md",
				status: "in_progress",
				execution: "parallel",
				worktree: "unassigned（forge/dev 主工作区）",
				write_paths: ["packages/ai/src"],
			}),
		];
		expect(findScopeConflicts(tasks)).toEqual([]);
	});

	it("ignores finished tasks", () => {
		const tasks = [worktreeTask("TASK-0100"), worktreeTask("TASK-0101", { status: "done" })];
		expect(findScopeConflicts(tasks)).toEqual([]);
	});
});

describe("worktree lifecycle decisions", () => {
	it("only parallel tasks may be split into a worktree", () => {
		expect(findWorktreeCreateBlockers({ execution: "parallel", status: "ready" })).toEqual([]);
		expect(findWorktreeCreateBlockers({ execution: "serial", status: "ready" }).join(" ")).toContain("serial");
		expect(findWorktreeCreateBlockers({ execution: "coordination-only", status: "ready" }).join(" ")).toContain(
			"coordination-only",
		);
		expect(findWorktreeCreateBlockers({ execution: "parallel", status: "done" }).join(" ")).toContain("done");
	});

	it("permits removal only when nothing can be lost", () => {
		expect(findRemovalBlockers({ locked: null, statusUnknown: false, dirtyEntries: 0, unpushedCommits: 0 })).toEqual(
			[],
		);
	});

	const blockers = [
		[{ locked: "claude", statusUnknown: false, dirtyEntries: 0, unpushedCommits: 0 }, "locked"],
		[{ locked: null, statusUnknown: true, dirtyEntries: 0, unpushedCommits: 0 }, "could not report"],
		[{ locked: null, statusUnknown: false, dirtyEntries: 3, unpushedCommits: 0 }, "3 uncommitted or untracked"],
		[{ locked: null, statusUnknown: false, dirtyEntries: 0, unpushedCommits: 2 }, "2 commit(s) not on any remote"],
		[{ locked: null, statusUnknown: false, dirtyEntries: 0, unpushedCommits: null }, "could not determine"],
	];

	it.each(blockers)("blocks removal when %j", (state, expected) => {
		expect(findRemovalBlockers(state).join(" ")).toContain(expected);
	});
});
