// Modified by The Open Forge contributors.

import {
	evaluateLargeObjectDegradation,
	LARGE_OBJECT_LIMITS,
	largeObjectDegradationNoticeKey,
	latchLargeObjectDegradation,
} from "@vetta-org/theme-ui/shared";
import { describe, expect, it } from "vitest";

describe("large object degradation gates", () => {
	it("正常体量不降级，三类对象都保留全部高耗功能", () => {
		for (const kind of ["artifact", "textFile", "transcript"] as const) {
			const decision = evaluateLargeObjectDegradation({ kind, bytes: 1024, lines: 10 });
			expect(decision.degraded).toBe(false);
			expect(decision.features).toEqual({
				syntaxHighlight: true,
				tokenization: true,
				searchIndex: true,
				fullHydration: true,
			});
		}
	});

	it("边界值：正好等于阈值不降级，超过 1 字节即降级", () => {
		const atLimit = evaluateLargeObjectDegradation({
			kind: "artifact",
			bytes: LARGE_OBJECT_LIMITS.artifactBytes,
		});
		expect(atLimit.degraded).toBe(false);

		const overLimit = evaluateLargeObjectDegradation({
			kind: "artifact",
			bytes: LARGE_OBJECT_LIMITS.artifactBytes + 1,
		});
		expect(overLimit.degraded).toBe(true);
		expect(overLimit.features.syntaxHighlight).toBe(false);
		expect(overLimit.reasons).toHaveLength(1);
	});

	it("artifact 与 textFile 关闭的功能不同：预览关高亮，文件预览另关 tokenization 与搜索索引", () => {
		const artifact = evaluateLargeObjectDegradation({
			kind: "artifact",
			bytes: LARGE_OBJECT_LIMITS.artifactBytes + 1,
		});
		expect(artifact.features).toEqual({
			syntaxHighlight: false,
			tokenization: true,
			searchIndex: true,
			fullHydration: true,
		});

		const file = evaluateLargeObjectDegradation({
			kind: "textFile",
			bytes: LARGE_OBJECT_LIMITS.textFileBytes + 1,
		});
		expect(file.features).toEqual({
			syntaxHighlight: true,
			tokenization: false,
			searchIndex: false,
			fullHydration: true,
		});
	});

	it("行数超限与字节超限各自都能触发文件预览降级", () => {
		const manyLines = evaluateLargeObjectDegradation({
			kind: "textFile",
			bytes: 4096,
			lines: LARGE_OBJECT_LIMITS.textFileLines + 1,
		});
		expect(manyLines.degraded).toBe(true);
		expect(manyLines.reasons[0]).toContain("lines");
	});

	it("transcript 超阈值时走窗口化路径（关闭全量 hydration）", () => {
		const decision = evaluateLargeObjectDegradation({
			kind: "transcript",
			bytes: LARGE_OBJECT_LIMITS.transcriptBytes + 1,
		});
		expect(decision.features.fullHydration).toBe(false);
		expect(decision.features.syntaxHighlight).toBe(true);
	});

	it("判定一次性、不可逆：后续更小的测量不会把已关闭的功能改回可用", () => {
		const latched = latchLargeObjectDegradation({
			kind: "artifact",
			bytes: LARGE_OBJECT_LIMITS.artifactBytes + 1,
		});
		expect(latched.current().degraded).toBe(true);

		expect(latched.observe({ kind: "artifact", bytes: 1024 }).degraded).toBe(true);
		expect(latched.current().features.syntaxHighlight).toBe(false);

		const clean = latchLargeObjectDegradation({ kind: "artifact", bytes: 1024 });
		expect(clean.observe({ kind: "artifact", bytes: LARGE_OBJECT_LIMITS.artifactBytes + 1 }).degraded).toBe(true);
		expect(clean.current().degraded).toBe(true);
	});

	it("降级提示的 i18n key 按对象类型派生，文案由 catalog 提供", () => {
		expect(largeObjectDegradationNoticeKey("artifact")).toBe("preview.degraded.artifact");
		expect(largeObjectDegradationNoticeKey("transcript")).toBe("preview.degraded.transcript");
	});
});
