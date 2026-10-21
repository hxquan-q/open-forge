// Copyright The Open Forge contributors.
// 验收直测（flow-tester）：把本 feature 触及的红线落成用例（CONSTRAINTS.md）。
// 对新增的余额数据面做源码扫描，覆盖 C2（Key 不进日志/代码）、C3（不出现 any）、
// C8（不新建第二套凭据存储）。纯静态扫描，不读取任何真实凭据。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MODULE_FILES = ["types.ts", "http.ts", "fetchers.ts", "registry.ts", "index.ts"] as const;

function read(name: string): string {
	return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
}

const sources = MODULE_FILES.map((name) => ({ name, text: read(name) }));

describe("红线扫描 · 余额数据面", () => {
	it("C2：模块内无日志调用（Key 无从被记录）", () => {
		for (const { name, text } of sources) {
			expect(text, `${name} 不应有 console.*`).not.toMatch(/\bconsole\.(log|info|warn|error|debug)\b/);
			expect(text, `${name} 不应有 app logger`).not.toMatch(/getAppLogger|\.info\(|\.warn\(/);
		}
	});

	it("C2：模块内不出现 Key 字面量片段", () => {
		for (const { name, text } of sources) {
			// 模块自身不得含任何形如 sk-xxx 的密钥字面量（注释里的说明文字也不含）。
			expect(text, `${name} 不应含 sk- 密钥字面量`).not.toMatch(/sk-[A-Za-z0-9]/);
		}
	});

	it("C3：模块内不出现 any（含 as any / <any> / any[]）", () => {
		for (const { name, text } of sources) {
			expect(text, `${name} 不应出现 any`).not.toMatch(/\bas any\b|<any>|:\s*any\b|\bany\[\]/);
		}
	});

	it("C8：不新建凭据存储（不 import 凭据库，只用既有配置服务）", () => {
		for (const { name, text } of sources) {
			const importLines = text
				.split("\n")
				.filter((line) => /^\s*import\b/.test(line) || /\bfrom\s+"/.test(line))
				.join("\n");
			expect(importLines, `${name} 不应 import 凭据库`).not.toMatch(
				/credential-vault|desktop-credential-vault|electron-safe-storage/,
			);
		}
	});
});
