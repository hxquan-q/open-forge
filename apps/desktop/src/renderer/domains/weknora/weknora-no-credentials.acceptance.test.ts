// Copyright The Open Forge contributors.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * flow-tester 独立验收测试（weknora-session-management，AC-12 / 红线 C2）。
 *
 * 静态扫描本 feature 的**新增/改动实现文件**与 T00 实测夹具，断言不含 API Key / 凭据字面量。
 * 先用一个「植入已知 Key 的样本」证明扫描器**不是空过**（正控），再对真实文件断言零命中。
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

/** 疑似凭据字面量的形态（header 名不算：`"X-API-Key": this.apiKey` 的值非字符串字面量，不命中）。 */
const KEY_LITERAL_PATTERNS: readonly RegExp[] = [
	/\bsk-[A-Za-z0-9_-]{12,}/,
	/Bearer\s+[A-Za-z0-9._-]{12,}/,
	/X-API-Key["']?\s*[:=]\s*["'][^"']{8,}["']/,
	/(?:api[_-]?key|token|secret|password)\s*[:=]\s*["'][A-Za-z0-9+/_=.-]{16,}["']/i,
];

function findCredentialLiterals(text: string): string[] {
	const hits: string[] = [];
	for (const pattern of KEY_LITERAL_PATTERNS) {
		const match = text.match(pattern);
		if (match) hits.push(match[0]);
	}
	return hits;
}

/** 本 feature 新增/改动的实现文件（不含测试文件）。 */
const IMPLEMENTATION_FILES = [
	`${here}services/weknoraExport.ts`,
	`${here}hooks/useWeKnoraExport.ts`,
	`${here}hooks/useWeKnoraBatchActions.ts`,
	`${here}hooks/useWeKnoraSelection.ts`,
	`${here}components/ConversationList.tsx`,
	`${here}components/WeKnoraExportFormatDialog.tsx`,
	`${here}components/weknoraSessionMenu.ts`,
	join(repoRoot, "apps/desktop/src/main/ipc/dialog.ts"),
	join(repoRoot, "apps/desktop/src/main/weknora/http.ts"),
	join(repoRoot, "apps/desktop/src/main/weknora/types.ts"),
	join(repoRoot, "apps/desktop/src/main/weknora/service.ts"),
] as const;

describe("AC-12 · 无凭据字面量（红线 C2）", () => {
	it("扫描器正控：植入的 Key 形态会被命中（证明断言非空过）", () => {
		expect(findCredentialLiterals('const apiKey = "abcdefghijklmnop0123456789";')).toHaveLength(1);
		expect(findCredentialLiterals('headers: { "X-API-Key": "0123456789abcdef" }')).toHaveLength(1);
		expect(findCredentialLiterals('Authorization: "Bearer abcdefghijklmnop"')).toHaveLength(1);
		// 正常代码（header 名 + 变量引用）不误报。
		expect(findCredentialLiterals('headers: { "X-API-Key": this.apiKey }')).toEqual([]);
		expect(findCredentialLiterals("apiKey: string")).toEqual([]);
	});

	it("全部实现文件零凭据字面量命中", () => {
		const violations: string[] = [];
		for (const file of IMPLEMENTATION_FILES) {
			expect(existsSync(file), `实现文件缺失: ${file}`).toBe(true);
			const hits = findCredentialLiterals(readFileSync(file, "utf8"));
			if (hits.length > 0) violations.push(`${file}: ${hits.join(", ")}`);
		}
		expect(violations).toEqual([]);
	});

	const fixturePath = join(repoRoot, "docs/devflow/weknora-kb-citation/t00-run/v1-real-messages.json");
	it.runIf(existsSync(fixturePath))("T00 实测夹具不含凭据字面量", () => {
		expect(findCredentialLiterals(readFileSync(fixturePath, "utf8"))).toEqual([]);
	});
});
