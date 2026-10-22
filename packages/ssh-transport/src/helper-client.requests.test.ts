// Copyright The Open Forge contributors.
import { afterEach, expect, it, vi } from "vitest";
import { SshHelperClient } from "./helper-client.js";

function fixture() {
	let feed!: (chunk: Uint8Array) => void;
	const write = vi.fn();
	const client = SshHelperClient.attach((onData) => {
		feed = onData;
		return { write, end: vi.fn(), kill: vi.fn(), exited: new Promise(() => {}) };
	});
	const reply = (id: number, result: unknown) => feed(new TextEncoder().encode(`${JSON.stringify({ id, result })}\n`));
	return { client, write, reply };
}
afterEach(() => vi.useRealTimers());
it("bounds a stalled read, ignores its late reply and keeps unrelated requests usable", async () => {
	vi.useFakeTimers();
	const f = fixture();
	const slow = f.client.call("fs.stat", { path: "/slow" }, { timeoutMs: 20 });
	const rejected = expect(slow).rejects.toMatchObject({ reason: "timeout", verdict: "unverifiable" });
	await vi.advanceTimersByTimeAsync(20);
	await rejected;
	expect(vi.getTimerCount()).toBe(0);
	f.reply(1, { late: true });
	const next = f.client.call("fs.stat", { path: "/next" }, { timeoutMs: 20 });
	f.reply(2, { entry: null });
	await expect(next).resolves.toEqual({ entry: null });
	expect(vi.getTimerCount()).toBe(0);
	f.client.close();
});
it("cancels one request without closing the shared channel, handles pre-abort and synchronous send failure", async () => {
	const f = fixture();
	const abort = new AbortController();
	const pending = f.client.call("fs.stat", {}, { signal: abort.signal, timeoutMs: 100 });
	const rejected = expect(pending).rejects.toMatchObject({ reason: "aborted" });
	abort.abort();
	await rejected;
	await expect(f.client.call("fs.stat", {}, { signal: abort.signal })).rejects.toMatchObject({ reason: "aborted" });
	expect(f.write).toHaveBeenCalledTimes(1);
	f.write.mockImplementationOnce(() => {
		throw new Error("write failed");
	});
	await expect(f.client.call("fs.stat", {}, { timeoutMs: 100 })).rejects.toThrow("write failed");
	const next = f.client.call("fs.stat", {});
	f.reply(3, { entry: null });
	await expect(next).resolves.toEqual({ entry: null });
	f.client.close();
});
