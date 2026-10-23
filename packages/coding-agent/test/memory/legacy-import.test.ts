// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	hashLegacyContent,
	parseLegacyMemoryDocument,
	renderLegacyMemoryMarkdown,
} from "../../src/memory/legacy/index.js";

/**
 * TASK-0378 旧 MEMORY.md 解析合同：分隔符切分、原样保留、hash 幂等键、
 * 变更检测、Markdown 版本化导出。
 */

const SAMPLE = ["Uses Bun", "---", "Uses TypeScript", "---", " prefers pnpm "].join("\n");

describe("legacy MEMORY.md 解析", () => {
	it("按分隔符切分；首尾空白条目丢弃；内容原样（不重排）", () => {
		const document = parseLegacyMemoryDocument(SAMPLE);
		expect(document.entries.map((entry) => entry.content)).toEqual(["Uses Bun", "Uses TypeScript", "prefers pnpm"]);
	});

	it("来源 hash 稳定：同内容同 hash，变更后不同（预览信号）", () => {
		const first = parseLegacyMemoryDocument(SAMPLE);
		const second = parseLegacyMemoryDocument(SAMPLE);
		expect(first.fileHash).toBe(second.fileHash);
		const changed = parseLegacyMemoryDocument(`${SAMPLE}\nnew entry`);
		expect(changed.fileHash).not.toBe(first.fileHash);
		expect(hashLegacyContent("abc")).toBe(hashLegacyContent("abc"));
	});

	it("sourceId = legacy:fileHash#index（导入幂等键）", () => {
		const document = parseLegacyMemoryDocument(SAMPLE);
		expect(document.entries[1]?.sourceId).toBe(`legacy:${document.fileHash}#1`);
	});

	it("空文档/纯分隔符产出空条目", () => {
		expect(parseLegacyMemoryDocument("").entries).toEqual([]);
		expect(parseLegacyMemoryDocument("---\n---").entries).toEqual([]);
	});

	it("Markdown 导出带版本与时间标记", () => {
		const markdown = renderLegacyMemoryMarkdown([{ content: "条目A" }, { content: "条目B" }], {
			exportedAt: "2026-10-22T00:00:00Z",
			formatVersion: 1,
		});
		expect(markdown).toContain("open-forge memory export v1 exportedAt=2026-10-22T00:00:00Z");
		expect(markdown).toContain("条目A\n---\n条目B");
	});
});
