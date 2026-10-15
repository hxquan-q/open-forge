// Copyright The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { LocalSourceEntry, LocalSourceScanResult } from "@vetta/runtime-knowledge";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CODING_AGENT_RESEARCH_SCOPE_TOOL_DESCRIPTION,
	createCodingAgentResearchScopeToolRegistration,
	formatResearchSourcesManifest,
	parseResearchSourcesManifest,
	RESEARCH_SOURCES_FENCE,
} from "../../src/features/research/index.js";

const dirs: string[] = [];
function tempRoot(): string {
	const dir = mkdtempSync(join(tmpdir(), "research-scope-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function sourceEntry(root: string, rel: string, size = 10): LocalSourceEntry {
	const path = join(root, ...rel.split("/"));
	return {
		uri: pathToFileURL(path).href,
		path,
		relativePath: rel,
		extension: rel.slice(rel.lastIndexOf(".")),
		sizeBytes: size,
		modifiedAtMs: 1_700_000_000_000,
	};
}

function scanResult(partial: Partial<Extract<LocalSourceScanResult, { ok: true }>> & { root: string }) {
	return { ok: true as const, sources: [], failures: [], truncated: false, ...partial };
}

function executionContext<TInput extends object>(input: TInput) {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId: "call-1",
		input,
		signal: new AbortController().signal,
	};
}

describe("research_scope tool", () => {
	it("注册合同：名称、场景白名单、类别、描述指向稳定常量", () => {
		const operations = { scanSources: vi.fn(async () => scanResult({ root: "/r", sources: [] })) };
		const registration = createCodingAgentResearchScopeToolRegistration({ operations, modelOrder: 1_950 });
		expect(registration.tool.name).toBe("research_scope");
		expect(registration.tool.description).toBe(CODING_AGENT_RESEARCH_SCOPE_TOOL_DESCRIPTION);
		expect(registration.scopeUse).toEqual(["conversation", "project", "cli"]);
		expect(registration.category).toBe("kb-read");
		expect(registration.modelOrder).toBe(1_950);
	});

	it("列出检索范围：URI/指纹逐项透传，供后续引用清单照抄", async () => {
		const root = tempRoot();
		const src = sourceEntry(root, "docs/报告.md");
		const operations = { scanSources: vi.fn(async () => scanResult({ root, sources: [src] })) };
		const tool = createCodingAgentResearchScopeToolRegistration({ operations }).tool;
		const result = await tool.execute(executionContext({ root }));
		expect(operations.scanSources).toHaveBeenCalledWith(root);
		expect(result.isError).toBeUndefined();
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain(src.uri);
		expect(text).toContain("docs/报告.md");
		expect(result.details).toMatchObject({ count: 1, sources: [src] });
	});

	it("相对 root 拒绝执行，不回落默认目录", async () => {
		const operations = { scanSources: vi.fn(async () => scanResult({ root: "x" })) };
		const tool = createCodingAgentResearchScopeToolRegistration({ operations }).tool;
		const result = await tool.execute(executionContext({ root: "relative/dir" }));
		expect(result.isError).toBe(true);
		expect(operations.scanSources).not.toHaveBeenCalled();
	});

	it("目录缺失/非目录 → 明确错误引导用户重选", async () => {
		for (const reason of ["missing", "not-a-directory"] as const) {
			const operations = { scanSources: vi.fn(async () => ({ ok: false as const, reason })) };
			const tool = createCodingAgentResearchScopeToolRegistration({ operations }).tool;
			const result = await tool.execute(executionContext({ root: "/nope" }));
			expect(result.isError).toBe(true);
		}
	});

	it("空集与失败来源都如实上报，部分失败不丢来源", async () => {
		const root = tempRoot();
		const operations = {
			scanSources: vi.fn(async () =>
				scanResult({
					root,
					sources: [sourceEntry(root, "a.md")],
					failures: [{ path: join(root, "big.pdf"), relativePath: "big.pdf", reason: "too_large" as const }],
				}),
			),
		};
		const tool = createCodingAgentResearchScopeToolRegistration({ operations }).tool;
		const result = await tool.execute(executionContext({ root }));
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("big.pdf");
		expect(text).toContain("over size limit");
		expect(result.details).toMatchObject({ count: 1 });

		const emptyOps = { scanSources: vi.fn(async () => scanResult({ root })) };
		const empty = await createCodingAgentResearchScopeToolRegistration({ operations: emptyOps }).tool.execute(
			executionContext({ root }),
		);
		expect(empty.content[0]?.type === "text" && empty.content[0].text).toContain("no citable sources");
	});
});

describe("research sources manifest", () => {
	it("format → parse 回读一致，附在正文末尾可被定位", () => {
		const manifest = {
			version: 1 as const,
			root: "/data/set",
			sources: [
				{ uri: "file:///data/set/a.md", path: "/data/set/a.md", name: "a.md", sizeBytes: 5, modifiedAtMs: 1 },
			],
		};
		const content = `# 结论\n\n正文……\n\n${formatResearchSourcesManifest(manifest)}`;
		expect(parseResearchSourcesManifest(content)).toEqual(manifest);
	});

	it("无清单或畸形块返回 undefined，不猜不抛", () => {
		expect(parseResearchSourcesManifest("plain markdown")).toBeUndefined();
		expect(parseResearchSourcesManifest(`\`\`\`${RESEARCH_SOURCES_FENCE}\n{oops}\n\`\`\``)).toBeUndefined();
	});

	it("多个块时以最后一个为准（重试重写的产物）", () => {
		const first = { version: 1 as const, sources: [{ uri: "u1", path: "p1", sizeBytes: 1, modifiedAtMs: 1 }] };
		const second = { version: 1 as const, sources: [{ uri: "u2", path: "p2", sizeBytes: 2, modifiedAtMs: 2 }] };
		const content = `${formatResearchSourcesManifest(first)}\nmiddle\n${formatResearchSourcesManifest(second)}`;
		expect(parseResearchSourcesManifest(content)?.sources[0]?.uri).toBe("u2");
	});
});
