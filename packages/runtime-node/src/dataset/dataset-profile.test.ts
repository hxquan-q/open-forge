// Copyright The Open Forge contributors.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DATASET_MAX_FILE_BYTES } from "./dataset-contracts.js";
import { profileDatasetFile } from "./dataset-profile.js";

const dirs: string[] = [];
function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "dataset-profile-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function write(dir: string, name: string, content: string): string {
	const path = join(dir, name);
	writeFileSync(path, content);
	return path;
}

describe("profileDatasetFile", () => {
	it("CSV：列类型推断、ragged 行与非法值如实上报", async () => {
		const dir = tempDir();
		const path = write(
			dir,
			"sales.csv",
			[
				"name,amount,active,day",
				"a,10.5,true,2026-01-02",
				"b,oops,false,2026-01-03", // amount 非法值
				"c,7,true", // ragged：少一列
				",,,", // 整行空
			].join("\n"),
		);
		const result = await profileDatasetFile(path);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const { profile } = result;
		expect(profile.format).toBe("csv");
		expect(profile.rowCount).toBe(4);
		const byName = new Map(profile.columns.map((c) => [c.name, c]));
		expect(byName.get("amount")?.type).toBe("number");
		expect(byName.get("amount")?.invalidCells).toBe(1);
		expect(byName.get("active")?.type).toBe("boolean");
		expect(byName.get("day")?.type).toBe("date");
		const reasons = profile.issues.map((i) => i.reason);
		expect(reasons).toContain("invalid-value");
		expect(reasons).toContain("ragged");
		expect(reasons).toContain("empty-row");
	});

	it("CSV：带引号字段与嵌入逗号/换行正确切列", async () => {
		const dir = tempDir();
		const path = write(dir, "q.csv", 'id,note\n1,"a,b"\n2,"line1\nline2"\n');
		const result = await profileDatasetFile(path);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.profile.rowCount).toBe(2);
		expect(result.profile.issueCount).toBe(0);
	});

	it("JSON 数组对象：联合键为列；混型输入判 parse-failed", async () => {
		const dir = tempDir();
		const okPath = write(dir, "data.json", JSON.stringify([{ a: 1, b: "x" }, { a: 2 }, { a: "bad", b: "z" }]));
		const ok = await profileDatasetFile(okPath);
		expect(ok.ok).toBe(true);
		if (ok.ok) {
			expect(ok.profile.rowCount).toBe(3);
			const a = ok.profile.columns.find((c) => c.name === "a");
			expect(a?.type).toBe("number");
			expect(a?.invalidCells).toBe(1);
			const b = ok.profile.columns.find((c) => c.name === "b");
			expect(b?.emptyCells).toBe(1);
		}

		const badPath = write(dir, "mixed.json", JSON.stringify([{ a: 1 }, [1, 2]]));
		const bad = await profileDatasetFile(badPath);
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.reason).toBe("parse-failed");
	});

	it("JSON 行矩阵（含 JSONL）：首行表头；缺列列入 missingColumns", async () => {
		const dir = tempDir();
		const matrixPath = write(
			dir,
			"m.json",
			JSON.stringify([
				["id", "v"],
				[1, 2],
				[3, 4],
			]),
		);
		const result = await profileDatasetFile(matrixPath, { expectedColumns: ["id", "v", "extra"] });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.profile.missingColumns).toEqual(["extra"]);
			expect(result.profile.columns.map((c) => c.name)).toEqual(["id", "v"]);
		}

		const jsonlPath = write(dir, "lines.jsonl", '{"a":1}\n{"a":2}\n');
		const jsonl = await profileDatasetFile(jsonlPath);
		expect(jsonl.ok).toBe(true);
		if (jsonl.ok) expect(jsonl.profile.rowCount).toBe(2);
	});

	it("xlsx：第一工作表按表头剖析；空簿报 parse-failed", async () => {
		const xlsx = await import("xlsx");
		const dir = tempDir();
		const wb = xlsx.utils.book_new();
		xlsx.utils.book_append_sheet(
			wb,
			xlsx.utils.aoa_to_sheet([
				["name", "qty"],
				["a", 1],
				["b", "x"],
			]),
			"S1",
		);
		const path = join(dir, "book.xlsx");
		writeFileSync(path, xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array);

		const result = await profileDatasetFile(path);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.profile.format).toBe("xlsx");
			const qty = result.profile.columns.find((c) => c.name === "qty");
			expect(qty?.type).toBe("number");
			expect(qty?.invalidCells).toBe(1);
		}
	});

	it("边界：缺失/目录/不支持格式/超限/空文件各归各位", async () => {
		const dir = tempDir();
		expect(await profileDatasetFile(join(dir, "gone.csv"))).toMatchObject({ ok: false, reason: "missing" });
		expect(await profileDatasetFile(dir)).toMatchObject({ ok: false, reason: "not-a-file" });
		expect(await profileDatasetFile(write(dir, "n.md", "# hi"))).toMatchObject({
			ok: false,
			reason: "unsupported-format",
		});
		expect(await profileDatasetFile(write(dir, "e.csv", ""))).toMatchObject({ ok: false, reason: "empty" });

		const big = join(dir, "big.csv");
		writeFileSync(big, `a,b\n${"1,2\n".repeat(Math.ceil(DATASET_MAX_FILE_BYTES / 4) + 1)}`);
		expect(await profileDatasetFile(big)).toMatchObject({ ok: false, reason: "too-large" });
	});

	it("取消信号已置位时返回 cancelled，不读文件", async () => {
		const dir = tempDir();
		const path = write(dir, "a.csv", "a,b\n1,2\n");
		const controller = new AbortController();
		controller.abort();
		expect(await profileDatasetFile(path, { signal: controller.signal })).toEqual({
			ok: false,
			reason: "cancelled",
		});
	});
});
