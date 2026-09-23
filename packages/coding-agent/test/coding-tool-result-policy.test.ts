// Modified by The Open Forge contributors.
import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import type { RuntimeToolResultArtifactStore } from "@vetta/runtime-tools";
import { describe, expect, it, vi } from "vitest";
import { createCodingAgentCodingToolResultPolicy } from "../src/tool-results/result-policy.js";

const context = {
	sessionId: "session-1",
	turnId: "turn-1",
	toolCallId: "call-1",
	toolName: "read",
};

/** canonical base64（可通过 MCP 媒体准入的编码形态）。 */
function imagePart(bytes: number): { type: "image"; data: string; mimeType: string } {
	return { type: "image", data: Buffer.alloc(bytes, 65).toString("base64"), mimeType: "image/png" };
}

describe("coding agent coding tool result policy", () => {
	it("preserves small results", async () => {
		const store = artifactStore();
		const policy = createCodingAgentCodingToolResultPolicy({ artifactStore: store, maxInlineResultBytes: 8 });
		const small = textResult("small");

		expect(await policy.project(small, context)).toBe(small);
		expect(store.write).not.toHaveBeenCalled();
	});

	it("offloads the full result while keeping admitted images inline", async () => {
		const store = artifactStore();
		const policy = createCodingAgentCodingToolResultPolicy({ artifactStore: store, maxInlineResultBytes: 20 });
		const details = { exitCode: 0 };
		const image = imagePart(12);
		const result: RuntimeToolResult = {
			content: [{ type: "text", text: "start-0123456789-end-abcdefghij" }, image],
			details,
		};

		const projected = await policy.project(result, context);

		// 小 details 原样保留；准入内图片保持内联（媒体引用链从持久化 content 取候选）。
		expect(projected.details).toBe(details);
		expect(projected.content[0]?.type === "text" ? projected.content[0].text : "").toContain(
			"Full result: artifact.json",
		);
		expect(projected.content[1]).toEqual(image);
		const request = vi.mocked(store.write).mock.calls[0]?.[0];
		expect(request ? JSON.parse(request.data) : undefined).toEqual({ content: result.content, details });
	});

	it("invalid-encoded images are replaced by an omission notice", async () => {
		const store = artifactStore();
		const policy = createCodingAgentCodingToolResultPolicy({ artifactStore: store, maxInlineResultBytes: 4 });
		const result: RuntimeToolResult = {
			content: [
				{ type: "text", text: "large result body" },
				{ type: "image", data: "image-data", mimeType: "image/png" },
			],
		};

		const projected = await policy.project(result, context);

		expect(projected.content).toEqual([
			expect.objectContaining({ type: "text" }),
			{ type: "text", text: "[image omitted: invalid encoding, unsafe MIME type, or host size limit]" },
		]);
	});

	it("images count toward the budget trigger but stay inline within media admission", async () => {
		const store = artifactStore();
		const policy = createCodingAgentCodingToolResultPolicy({ artifactStore: store, maxInlineResultBytes: 20 });
		const image = imagePart(30);
		const result: RuntimeToolResult = {
			content: [{ type: "text", text: "ok" }, image],
		};

		const projected = await policy.project(result, context);

		// 图片字节数计入预算：2B 文本 + 30B 图片 > 20B 触发投影；
		// 但图片在准入内（<8MB），保持内联，唯一变化是文本获得 artifact 引用。
		expect(store.write).toHaveBeenCalledOnce();
		expect(projected.content[1]).toEqual(image);
		expect(projected.content[0]?.type === "text" ? projected.content[0].text : "").toContain(
			"Full result: artifact.json",
		);
	});

	it("keeps a 1MB image inline and omits only images beyond the media admission", async () => {
		const store = artifactStore();
		const policy = createCodingAgentCodingToolResultPolicy({ artifactStore: store, maxInlineResultBytes: 20 });
		const large = imagePart(1024 * 1024);
		// 12M 字符 ≈ 9MB 解码，超过单项 8MiB 准入上限。
		const oversize = { type: "image" as const, data: "A".repeat(12_000_000), mimeType: "image/png" };
		const result: RuntimeToolResult = {
			content: [{ type: "text", text: "screenshots" }, large, oversize],
		};

		const projected = await policy.project(result, context);

		expect(projected.content[1]).toEqual(large);
		expect(projected.content[2]).toEqual({
			type: "text",
			text: "[image omitted: invalid encoding, unsafe MIME type, or host size limit]",
		});
	});

	it("includes details in the inline result budget and keeps small details as-is", async () => {
		const store = artifactStore();
		const policy = createCodingAgentCodingToolResultPolicy({ artifactStore: store, maxInlineResultBytes: 20 });
		const result: RuntimeToolResult = {
			content: [{ type: "text", text: "ok" }],
			details: { diagnostic: "y".repeat(40) },
		};

		const projected = await policy.project(result, context);

		expect(store.write).toHaveBeenCalledOnce();
		expect(projected.content[0]?.type === "text" ? projected.content[0].text : "").toContain(
			"Full result: artifact.json",
		);
		expect(projected.details).toBe(result.details);
	});

	it("summarizes only the plugin result key when details exceed the budget", async () => {
		const store = artifactStore();
		const policy = createCodingAgentCodingToolResultPolicy({ artifactStore: store, maxInlineResultBytes: 20 });
		const cards = [{ kind: "note", title: "kept" }];
		const result: RuntimeToolResult = {
			content: [{ type: "text", text: "ok" }],
			details: {
				pluginId: "plugin-1",
				toolId: "tool-1",
				result: { blob: "z".repeat(120 * 1024) },
				cards,
			},
		};

		const projected = await policy.project(result, context);

		const details = projected.details as Record<string, unknown>;
		expect(details.pluginId).toBe("plugin-1");
		expect(details.toolId).toBe("tool-1");
		expect(details.cards).toEqual(cards);
		const summarized = details.result as Record<string, unknown>;
		expect(summarized.offloaded).toBe(true);
	});

	it("offloads whole details with a bounded card subset when no result key exists", async () => {
		const store = artifactStore();
		const policy = createCodingAgentCodingToolResultPolicy({ artifactStore: store, maxInlineResultBytes: 20 });
		const card = { kind: "note", title: "card" };
		const result: RuntimeToolResult = {
			content: [{ type: "text", text: "ok" }],
			details: { cards: [card], blob: "z".repeat(120 * 1024) },
		};

		const projected = await policy.project(result, context);

		const details = projected.details as Record<string, unknown>;
		expect(details.offloaded).toBe(true);
		expect(details.detailsOffloaded).toBe(true);
		expect(details.cards).toEqual([card]);
	});

	it("keeps the only result copy when artifact storage fails", async () => {
		const store: RuntimeToolResultArtifactStore = {
			write: vi.fn(async () => {
				throw new Error("disk unavailable");
			}),
		};
		const policy = createCodingAgentCodingToolResultPolicy({ artifactStore: store, maxInlineResultBytes: 4 });
		const result = textResult("large result");

		expect(await policy.project(result, context)).toBe(result);
	});
});

function artifactStore(): RuntimeToolResultArtifactStore & { readonly write: ReturnType<typeof vi.fn> } {
	return { write: vi.fn(async () => ({ reference: "artifact.json", byteLength: 8 })) };
}

function textResult(text: string): RuntimeToolResult {
	return { content: [{ type: "text", text }] };
}
