// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { parsePorcelainStatus, parseStatusBranchLine } from "./git-repo-status.js";

describe("parseStatusBranchLine", () => {
	it("提取本地分支名（含跟踪与 ahead 标记）", () => {
		expect(parseStatusBranchLine("## main...origin/main [ahead 1]")).toBe("main");
		expect(parseStatusBranchLine("## main...origin/main [behind 2]")).toBe("main");
		expect(parseStatusBranchLine("## main...origin/main")).toBe("main");
		expect(parseStatusBranchLine("## feat/x")).toBe("feat/x");
	});

	it("detached HEAD 与缺行返回 null", () => {
		expect(parseStatusBranchLine("## HEAD (no branch)")).toBeNull();
		expect(parseStatusBranchLine("")).toBeNull();
	});

	it("空仓库首行取 No commits yet on 之后的分支名", () => {
		expect(parseStatusBranchLine("## No commits yet on main")).toBe("main");
	});
});

describe("parsePorcelainStatus", () => {
	it("XY 码收敛为四类状态，重命名取新路径", () => {
		const changes = parsePorcelainStatus(
			[" M src/a.ts", "A  new.ts", "D  old.ts", "?? raw.txt", "R  src/old.ts -> src/new.ts"].join("\n"),
		);
		expect(changes).toEqual([
			{ path: "src/a.ts", status: "modified" },
			{ path: "new.ts", status: "added" },
			{ path: "old.ts", status: "deleted" },
			{ path: "raw.txt", status: "untracked" },
			{ path: "src/new.ts", status: "renamed" },
		]);
	});

	it("空行与残缺行静默跳过", () => {
		expect(parsePorcelainStatus("\n  \n")).toEqual([]);
	});
});
