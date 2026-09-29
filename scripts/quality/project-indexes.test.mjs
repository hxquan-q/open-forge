import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findProjectIndexProblems } from "./check-project-indexes.mjs";

let root;

function write(relativePath, content) {
	const path = join(root, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, "utf8");
}

function writeIndexes({ planStatus = "ready", taskStatus = "ready", taskId = "TASK-0001" } = {}) {
	write("project/plans/PLAN-0001-sample.md", `---\nid: PLAN-0001\nstatus: ${planStatus}\n---\n`);
	write(`project/tasks/${taskId}-sample.md`, `---\nid: ${taskId}\nstatus: ${taskStatus}\n---\n`);
	write(
		"project/plans/README.md",
		"## 当前计划索引\n\n| ID | 名称 | 状态 | 依据 |\n|---|---|---|---|\n| `PLAN-0001` | Sample | `ready` | source |\n",
	);
	write(
		"project/tasks/README.md",
		`## 当前执行焦点\n\n| Task ID | 状态 | Plan | Focus |\n|---|---|---|---|\n| \`${taskId}\` | \`ready\` | PLAN-0001 | Sample |\n`,
	);
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "project-indexes-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("project status index guard", () => {
	it("accepts Plan and selected Task statuses that match their frontmatter", () => {
		writeIndexes();
		expect(findProjectIndexProblems(root)).toEqual([]);
	});

	it("reports stale Plan and Task status rows", () => {
		writeIndexes({ planStatus: "done", taskStatus: "in_progress" });
		const problems = findProjectIndexProblems(root).join("\n");
		expect(problems).toContain("PLAN-0001 says ready, frontmatter says done");
		expect(problems).toContain("TASK-0001 says ready, frontmatter says in_progress");
	});

	it("rejects duplicate documents with the same Task ID", () => {
		writeIndexes();
		write("project/tasks/TASK-0001-another.md", "---\\nid: TASK-0001\\nstatus: ready\\n---\\n");
		expect(findProjectIndexProblems(root).join("\\n")).toContain("duplicate document id TASK-0001");
	});

	it("requires every Plan to appear in the Plan index", () => {
		writeIndexes();
		write("project/plans/PLAN-0002-another.md", "---\nid: PLAN-0002\nstatus: draft\n---\n");
		expect(findProjectIndexProblems(root)).toContain("project/plans/README.md: missing PLAN-0002");
	});
});
