// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { fixtureRevision } from "../src/fixtures.js";
import {
	MEMORY_CONTRACT_ERROR_CODES,
	MemoryContractError,
	parseTemporalSelector,
	selectEffectiveRevisions,
} from "../src/index.js";

describe("双时态选择合同", () => {
	const base = fixtureRevision();

	it("有效区间内命中、区间外不命中（validTo 开区间）", () => {
		const revisions = [
			base,
			fixtureRevision({ revisionId: "rev-2", validFrom: "2026-02-01T00:00:00Z", validTo: "2026-03-01T00:00:00Z" }),
		];
		const selector = parseTemporalSelector({ asOf: "2026-02-15T00:00:00Z" });
		const effective = selectEffectiveRevisions(revisions, selector);
		expect([...effective.map((revision) => revision.revisionId)].sort()).toEqual(["rev-2", "rev-fixture-1"].sort());
		const outside = selectEffectiveRevisions(revisions, parseTemporalSelector({ asOf: "2026-03-01T00:00:00Z" }));
		expect(outside.map((revision) => revision.revisionId)).toEqual(["rev-fixture-1"]);
	});

	it("迟到更正：knownAt 早于修订获知时间时不可见", () => {
		const lateFix = fixtureRevision({
			revisionId: "rev-late",
			content: "修正后的事实",
			recordedAt: "2026-06-01T00:00:00Z",
		});
		const historical = selectEffectiveRevisions(
			[lateFix],
			parseTemporalSelector({ asOf: "2026-05-01T00:00:00Z", knownAt: "2026-05-01T00:00:00Z" }),
		);
		expect(historical).toEqual([]);
		const current = selectEffectiveRevisions(
			[lateFix],
			parseTemporalSelector({ asOf: "2026-05-01T00:00:00Z", knownAt: "2026-07-01T00:00:00Z" }),
		);
		expect(current.map((revision) => revision.revisionId)).toEqual(["rev-late"]);
	});

	it("同一时刻多个 active 修订并存时全部返回，不静默裁决", () => {
		const a = fixtureRevision({ memoryId: "mem-x", revisionId: "rev-a", content: "说法一" });
		const b = fixtureRevision({
			memoryId: "mem-x",
			revisionId: "rev-b",
			content: "说法二",
			recordedAt: "2026-01-03T00:00:00Z",
		});
		const effective = selectEffectiveRevisions([a, b], parseTemporalSelector({ asOf: "2026-02-01T00:00:00Z" }));
		expect(effective).toHaveLength(2);
	});

	it("unknown 有效时间不匹配任何查询点", () => {
		const unknownFrom = fixtureRevision({ revisionId: "rev-u", validFrom: "unknown" });
		const effective = selectEffectiveRevisions(
			[unknownFrom],
			parseTemporalSelector({ asOf: "2026-02-01T00:00:00Z" }),
		);
		expect(effective).toEqual([]);
	});

	it("非法时间输入报 UNKNOWN_VALID_TIME 稳定错误", () => {
		try {
			parseTemporalSelector({ asOf: "not-a-date" });
			expect.unreachable("应当抛错");
		} catch (error) {
			expect(error).toBeInstanceOf(MemoryContractError);
			expect((error as MemoryContractError).code).toBe(MEMORY_CONTRACT_ERROR_CODES.UNKNOWN_VALID_TIME);
		}
	});
});
