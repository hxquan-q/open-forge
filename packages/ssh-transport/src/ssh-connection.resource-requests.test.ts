// Copyright The Open Forge contributors.
import { afterEach, expect, it, vi } from "vitest";
import { SshHelperClient } from "./helper-client.js";
import { connectSshHelper } from "./helper-deployment.js";
import { SshConnection } from "./ssh-connection.js";

vi.mock("./helper-deployment.js", () => ({ connectSshHelper: vi.fn() }));
const reads = [
	(connection: SshConnection, signal?: AbortSignal) => connection.readFile("/fixture", signal),
	(connection: SshConnection, signal?: AbortSignal) => connection.readFileHead("/fixture", 10, signal),
	(connection: SshConnection, signal?: AbortSignal) => connection.readFileRange("/fixture", 0, 10, signal),
	(connection: SshConnection, signal?: AbortSignal) =>
		connection.listFilesRecursive("/fixture", { ignoredDirectoryNames: [], limit: 100 }, signal),
	(connection: SshConnection, signal?: AbortSignal) => connection.listDirectory("/fixture", signal),
	(connection: SshConnection, signal?: AbortSignal) => connection.stat("/fixture", signal),
	(connection: SshConnection, signal?: AbortSignal) => connection.realPath("/fixture", signal),
];
afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});
async function fixture() {
	let feed!: (chunk: Uint8Array) => void;
	const write = vi.fn();
	const client = SshHelperClient.attach((onData) => {
		feed = onData;
		return { write, end: vi.fn(), kill: vi.fn(), exited: new Promise(() => {}) };
	});
	vi.mocked(connectSshHelper).mockResolvedValue({ status: "ready", client });
	const run = vi.fn(async () => {
		throw new Error("Unexpected exec fallback");
	});
	const connection = new SshConnection(
		{ id: "fixture", label: "fixture", target: "fixture", source: "manual" },
		{ runner: { run }, controlPath: "/fixture", helper: { resolveBinary: () => undefined } },
	);
	await connection.helper();
	const reply = (message: unknown) => feed(new TextEncoder().encode(`${JSON.stringify(message)}\n`));
	return { client, connection, run, write, reply };
}
it.each(reads.map((read, index) => ({ read, index })))(
	"bounds and cancels resource read $index without exec fallback, then recovers",
	async ({ read }) => {
		vi.useFakeTimers();
		const f = await fixture();
		const timed = read(f.connection);
		const timeout = expect(timed).rejects.toMatchObject({
			name: "SshOperationAbortedError",
			reason: "timeout",
			verdict: "unverifiable",
		});
		await vi.advanceTimersByTimeAsync(30_000);
		await timeout;
		const controller = new AbortController();
		const aborted = read(f.connection, controller.signal);
		const cancelled = expect(aborted).rejects.toMatchObject({ name: "SshOperationAbortedError", reason: "aborted" });
		controller.abort();
		await cancelled;
		f.reply({ id: 1, result: { entry: null } });
		f.reply({ id: 2, result: { entry: null } });
		const next = f.connection.stat("/next");
		f.reply({ id: 3, result: { entry: null } });
		await expect(next).resolves.toBeNull();
		const missing = f.connection.realPath("/missing");
		f.reply({ id: 4, error: { code: "ENOENT", message: "missing" } });
		await expect(missing).resolves.toBe("/missing");
		expect(f.run).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		f.client.close();
	},
);
