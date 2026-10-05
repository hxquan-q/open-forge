// Copyright The Open Forge contributors.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../../shared/notification-preferences.js";
import type { DesktopConfig } from "../config/desktop-config-store.js";

const runtimeMock = vi.hoisted(() => ({
	peekSharedRuntime: vi.fn((): unknown => null),
}));

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../runtime.js", () => ({ peekSharedRuntime: runtimeMock.peekSharedRuntime }));
vi.mock("../config/desktop-config-store.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../config/desktop-config-store.js")>();
	return {
		...actual,
		readConfigSync: vi.fn((): DesktopConfig => desktopConfig([{ path: "C:/projects/demo" }])),
	};
});

const { clearToolcallMediaCache, resolveToolcallMedia } = await import("./toolcall-media-resolver.js");

function desktopConfig(projects: DesktopConfig["projects"]): DesktopConfig {
	return {
		projects,
		archivedProjects: [],
		workspacePath: "C:/workspace",
		defaultExecutionMode: "full-access",
		schemaVersion: 1,
		notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
	};
}

const PNG_BYTES_A = Buffer.from("image-a").toString("base64");
const PNG_BYTES_B = Buffer.from("image-b").toString("base64");
const AUDIO_BYTES = Buffer.from("audio-bytes").toString("base64");

function toolResultHistory(): unknown[] {
	return [
		{
			type: "message",
			entryId: "entry-1",
			message: {
				role: "toolResult",
				toolCallId: "call-1",
				content: [
					{ type: "image", data: PNG_BYTES_A, mimeType: "image/png" },
					// svg 不在白名单：被过滤后序号前移，证明与渲染端过滤对齐。
					{ type: "image", data: Buffer.from("svg").toString("base64"), mimeType: "image/svg+xml" },
					{ type: "image", data: PNG_BYTES_B, mimeType: "image/png" },
				],
				// 音频候选源是 details.content/details.media（与渲染端提取语义一致）。
				details: {
					media: [{ type: "audio", data: AUDIO_BYTES, mimeType: "audio/mpeg" }],
				},
			},
		},
	];
}

function installRuntime(overrides: Partial<Record<string, unknown>> = {}): void {
	runtimeMock.peekSharedRuntime.mockReturnValue({
		getFullHistory: vi.fn((sessionId: string) => {
			if (sessionId !== "session-1") throw new Error("unknown session");
			return toolResultHistory();
		}),
		getSessionPath: vi.fn(() => undefined),
		getState: vi.fn(() => ({ isStreaming: false })),
		readSessionHistoryFromFile: vi.fn(() => ({ history: toolResultHistory() })),
		...overrides,
	});
}

describe("toolcall-media-resolver", () => {
	beforeEach(() => {
		clearToolcallMediaCache();
	});

	it("从活动会话解析图片字节与 MIME，序号与白名单过滤对齐", async () => {
		installRuntime();
		const first = await resolveToolcallMedia({
			sessionId: "session-1",
			toolCallId: "call-1",
			index: 0,
			kind: "image",
		});
		expect(first?.data.equals(Buffer.from("image-a"))).toBe(true);
		expect(first?.mimeType).toBe("image/png");

		const second = await resolveToolcallMedia({
			sessionId: "session-1",
			toolCallId: "call-1",
			index: 1,
			kind: "image",
		});
		expect(second?.data.equals(Buffer.from("image-b"))).toBe(true);

		const audio = await resolveToolcallMedia({
			sessionId: "session-1",
			toolCallId: "call-1",
			index: 0,
			kind: "audio",
		});
		expect(audio?.data.equals(Buffer.from("audio-bytes"))).toBe(true);
		expect(audio?.mimeType).toBe("audio/mpeg");
	});

	it("未知会话/工具调用/越界序号返回 null；LRU 命中不重读会话", async () => {
		const getFullHistory = vi.fn((sessionId: string) => {
			if (sessionId !== "session-1") throw new Error("unknown session");
			return toolResultHistory();
		});
		installRuntime({ getFullHistory });

		expect(
			await resolveToolcallMedia({ sessionId: "missing", toolCallId: "call-1", index: 0, kind: "image" }),
		).toBeNull();
		expect(
			await resolveToolcallMedia({ sessionId: "session-1", toolCallId: "call-x", index: 0, kind: "image" }),
		).toBeNull();
		expect(
			await resolveToolcallMedia({ sessionId: "session-1", toolCallId: "call-1", index: 99, kind: "image" }),
		).toBeNull();
		expect(
			await resolveToolcallMedia({ sessionId: "session-1", toolCallId: "call-1", index: -1, kind: "image" }),
		).toBeNull();

		getFullHistory.mockClear();
		const first = await resolveToolcallMedia({
			sessionId: "session-1",
			toolCallId: "call-1",
			index: 0,
			kind: "image",
		});
		expect(first).not.toBeNull();
		expect(getFullHistory).toHaveBeenCalledTimes(1);
		const cached = await resolveToolcallMedia({
			sessionId: "session-1",
			toolCallId: "call-1",
			index: 0,
			kind: "image",
		});
		expect(cached).not.toBeNull();
		// LRU 命中：缓存后的重复解析不再读会话。
		expect(getFullHistory).toHaveBeenCalledTimes(1);
	});

	it("活动会话 miss 时回退会话文件（项目 sessionDir 定位）", async () => {
		const projectRoot = mkdtempSync(join(tmpdir(), "vetta-toolcall-media-"));
		const sessionsDir = join(projectRoot, ".vetta", "sessions");
		mkdirSync(sessionsDir, { recursive: true });
		const encoded = Buffer.from("session-2", "utf8").toString("base64url");
		writeFileSync(join(sessionsDir, `${encoded}.conversation.jsonl`), "{}\n");

		// readConfigSync mock 返回 projects: [{ path: "C:/projects/demo" }]，
		// 故把真实目录挂在 mock 值上再放行活动会话 miss。
		const { readConfigSync } = await import("../config/desktop-config-store.js");
		vi.mocked(readConfigSync).mockReturnValue(desktopConfig([{ path: projectRoot }]));

		const readSessionHistoryFromFile = vi.fn((_path: string) => ({ history: toolResultHistory() }));
		installRuntime({
			getFullHistory: vi.fn(() => {
				throw new Error("unknown session");
			}),
			readSessionHistoryFromFile,
		});

		const resolved = await resolveToolcallMedia({
			sessionId: "session-2",
			toolCallId: "call-1",
			index: 0,
			kind: "image",
		});
		expect(resolved?.data.equals(Buffer.from("image-a"))).toBe(true);
		const usedPath = readSessionHistoryFromFile.mock.calls[0]?.[0];
		expect(typeof usedPath).toBe("string");
		expect(usedPath?.endsWith(`${encoded}.conversation.jsonl`)).toBe(true);
	});
});
