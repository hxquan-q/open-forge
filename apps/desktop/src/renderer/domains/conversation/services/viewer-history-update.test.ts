// Copyright The Open Forge contributors.
import type { HistoryEntry } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import { applyViewerHistoryUpdate } from "./viewer-history-update";

function message(id: string): HistoryEntry {
	return { type: "message", entryId: id, message: { role: "assistant", content: id } as never };
}

describe("applyViewerHistoryUpdate", () => {
	it("snapshot 整体替换本地历史", () => {
		const result = applyViewerHistoryUpdate([message("old")], {
			kind: "snapshot",
			history: [message("a"), message("b")],
		});
		expect((result[0] as { entryId?: string }).entryId).toBe("a");
		expect(result).toHaveLength(2);
	});

	it("append 在尾部追加增量，不重排已有条目", () => {
		const prev = [message("a"), message("b")];
		const result = applyViewerHistoryUpdate(prev, {
			kind: "append",
			appended: [message("c")],
		});
		expect(result.map((e) => (e as { entryId?: string }).entryId)).toEqual(["a", "b", "c"]);
	});

	it("reset 用有界最新页整体替换本地历史", () => {
		const prev = [message("x"), message("y"), message("z")];
		const result = applyViewerHistoryUpdate(prev, {
			kind: "reset",
			page: { history: [message("p1"), message("p2")], hasMore: true, head: true },
		});
		expect(result.map((e) => (e as { entryId?: string }).entryId)).toEqual(["p1", "p2"]);
	});
});
