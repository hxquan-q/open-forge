// Copyright The Open Forge contributors.

import type { McpToolCallResult } from "@vetta/runtime-mcp";
import type { StdioMcpClient } from "@vetta/runtime-node/mcp";
import { describe, expect, it, vi } from "vitest";
import { BundledComputerBackend, readBackendResult } from "./bundled-backend.js";

const result = (value: unknown): McpToolCallResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
function fixture() {
	const client = {
		initialize: vi.fn(async () => ({
			protocolVersion: "2024-11-05",
			serverInfo: { name: "vetta-computer-use", version: "1.0.0" },
		})),
		callTool: vi.fn<StdioMcpClient["callTool"]>(async () => result({ ok: true, text: "ok" })),
		close: vi.fn(async () => {}),
		getPid: vi.fn((): number | undefined => undefined),
	};
	const verify = vi.fn(async () => {});
	const createClient = vi.fn(() => client);
	const backend = new BundledComputerBackend({ root: "C:/fixture", cache: "C:/fixture-cache", verify, createClient });
	return { client, backend, verify, createClient };
}

describe("private bundled MCP backend", () => {
	it("does not start for a stop request until the feature actually uses it", async () => {
		const f = fixture();
		await f.backend.interrupt();
		expect(f.verify).not.toHaveBeenCalled();
		expect(f.createClient).not.toHaveBeenCalled();
	});
	it("verifies resources, initializes once and preserves typed tool results", async () => {
		const f = fixture();
		expect(await f.backend.invoke({ op: "execute", input: { action: "observe" } })).toEqual({ ok: true, text: "ok" });
		await f.backend.invoke({ op: "execute", input: { action: "observe" } });
		expect(f.verify).toHaveBeenCalledOnce();
		expect(f.client.initialize).toHaveBeenCalledOnce();
		expect(f.client.callTool).toHaveBeenCalledWith(
			"computer_action",
			{ op: "execute", input: { action: "observe" } },
			{ signal: undefined },
		);
		await f.backend.dispose();
		expect(f.client.close).toHaveBeenCalledOnce();
	});
	it("does not dispatch an already cancelled action after startup", async () => {
		const f = fixture();
		const cancel = new AbortController();
		cancel.abort();
		await expect(f.backend.invoke({ op: "execute", input: { action: "observe" } }, cancel.signal)).rejects.toThrow();
		expect(f.client.callTool).not.toHaveBeenCalled();
		await f.backend.dispose();
	});
	it("keeps cancellation pending until stop and input release are acknowledged", async () => {
		const f = fixture();
		let acknowledge!: () => void;
		const stopped = new Promise<void>((resolve) => {
			acknowledge = resolve;
		});
		let entered!: () => void;
		const running = new Promise<void>((resolve) => {
			entered = resolve;
		});
		f.client.callTool.mockImplementation(async (name, _args, options) => {
			if (name === "stop") {
				await stopped;
				return result({ ok: true });
			}
			entered();
			return new Promise((_resolve, reject) =>
				options?.signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), {
					once: true,
				}),
			);
		});
		const cancel = new AbortController();
		let settled = false;
		const action = f.backend.invoke({ op: "execute", input: { action: "observe" } }, cancel.signal).catch(() => {
			settled = true;
		});
		await running;
		cancel.abort();
		await Promise.resolve();
		await Promise.resolve();
		expect(settled).toBe(false);
		acknowledge();
		await action;
		expect(settled).toBe(true);
		await f.backend.dispose();
	});
	it("rejects protocol errors and unexpected output instead of returning success", () => {
		expect(() => readBackendResult(result({ ok: true, code: 42 }))).toThrow("backend_protocol_failed");
		expect(() => readBackendResult({ content: [], isError: true })).toThrow("backend_protocol_failed");
		expect(() =>
			readBackendResult(result({ ok: true, image: { data: "bad input", mimeType: "image/png" } })),
		).toThrow();
	});
	it("does not hide a failed release acknowledgement when the process exited", async () => {
		const f = fixture();
		await f.backend.invoke({ op: "execute", input: { action: "observe" } });
		f.client.getPid.mockReturnValue(123);
		f.client.callTool.mockResolvedValue(result({ ok: false, code: "input_release_failed" }));
		const kill = vi.spyOn(process, "kill").mockImplementation(() => {
			throw Object.assign(new Error("gone"), { code: "ESRCH" });
		});
		try {
			await expect(f.backend.dispose()).rejects.toThrow("stop_failed");
		} finally {
			kill.mockRestore();
		}
	});
});
