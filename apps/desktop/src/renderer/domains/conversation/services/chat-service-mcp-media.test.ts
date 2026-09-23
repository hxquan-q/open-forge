import { describe, expect, it } from "vitest";
import { extractToolAudioPreviews, extractToolImagePreviews } from "./chat-service";

describe("MCP Desktop media projection", () => {
	it("renders safe media and drops malformed or executable data URLs", () => {
		expect(
			extractToolImagePreviews(
				[
					{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
					{ type: "image", data: "PHN2Zz4=", mimeType: "image/svg+xml" },
				],
				undefined,
			),
		).toEqual([
			{
				src: "data:image/png;base64,aW1hZ2U=",
				mimeType: "image/png",
				processedSizeBytes: 5,
			},
		]);
		expect(
			extractToolAudioPreviews([], {
				media: [
					{ type: "audio", data: "YXVkaW8=", mimeType: "audio/mpeg" },
					{ type: "audio", data: "not base64", mimeType: "audio/mpeg" },
				],
			}),
		).toEqual([{ src: "data:audio/mpeg;base64,YXVkaW8=", mimeType: "audio/mpeg" }]);
	});

	it("提供会话上下文时只产出协议引用，不驻留 base64", () => {
		const media = { sessionId: "session-1", toolCallId: "call-1" };
		const previews = extractToolImagePreviews(
			[
				{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
				{ type: "image", data: "aW1hZ2Uy", mimeType: "image/png" },
			],
			undefined,
			media,
		);
		expect(previews.map((preview) => preview.src)).toEqual([
			"vetta-media://toolcall/session-1/call-1/0?kind=image",
			"vetta-media://toolcall/session-1/call-1/1?kind=image",
		]);
		// 序号与共享候选投影对齐：不安全条目被过滤后不占引用位。
		const filtered = extractToolImagePreviews(
			[
				{ type: "image", data: "PHN2Zz4=", mimeType: "image/svg+xml" },
				{ type: "image", data: "aW1hZ2Uy", mimeType: "image/png" },
			],
			undefined,
			media,
		);
		expect(filtered.map((preview) => preview.src)).toEqual(["vetta-media://toolcall/session-1/call-1/0?kind=image"]);
		const audio = extractToolAudioPreviews(
			[],
			{ media: [{ type: "audio", data: "YXVkaW8=", mimeType: "audio/mpeg" }] },
			media,
		);
		expect(audio.map((preview) => preview.src)).toEqual(["vetta-media://toolcall/session-1/call-1/0?kind=audio"]);
	});
});
