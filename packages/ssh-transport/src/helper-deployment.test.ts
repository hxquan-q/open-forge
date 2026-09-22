import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { connectSshHelper } from "./helper-deployment.js";
import type { SshConnection } from "./ssh-connection.js";

interface RecordedConnection {
	readonly commands: string[];
	readonly writtenPaths: string[];
	readonly connection: SshConnection;
}

const HELPER_BYTES = "fake-helper";
const HELPER_DIGEST = createHash("sha256").update(HELPER_BYTES).digest("hex");

function fakeConnection(): RecordedConnection {
	const commands: string[] = [];
	const writtenPaths: string[] = [];
	const connection = {
		host: { label: "fake" },
		probePlatform: async () => ({ os: "linux", arch: "x86_64" }),
		resolveHomeDirectory: async () => "/home/u/",
		exec: async (command: string, options?: { onStdout?: (chunk: Uint8Array) => void }) => {
			commands.push(command);
			// 上传前远端摘要缺失触发上传；上传后回真摘要让部署走完清理步骤。
			if (command.includes("sha256sum") && writtenPaths.length > 0) {
				options?.onStdout?.(Buffer.from(`${HELPER_DIGEST}  -\n`));
				return { exitCode: 0, stdout: new Uint8Array(), stderr: "" };
			}
			return { exitCode: 1, stdout: new Uint8Array(), stderr: "" };
		},
		makeDirectory: async () => {},
		writeFile: async (remotePath: string) => {
			writtenPaths.push(remotePath);
		},
		openChannel: () => undefined,
	} as unknown as SshConnection;
	return { commands, writtenPaths, connection };
}

function localHelperBinary(): string {
	const path = join(mkdtempSync(join(tmpdir(), "helper-deploy-")), "openforge-ssh-helper");
	writeFileSync(path, HELPER_BYTES);
	return path;
}

describe("connectSshHelper", () => {
	it("installs under ~/.cache/openforge/helper and removes the legacy ~/.cache/vetta tree", async () => {
		const { commands, writtenPaths, connection } = fakeConnection();
		const client = await connectSshHelper(connection, {
			resolveBinary: () => localHelperBinary(),
			handshakeTimeoutMs: 100,
		});
		expect(client).toBeUndefined();
		expect(writtenPaths).toEqual(["/home/u/.cache/openforge/helper/1.1.0/openforge-ssh-helper"]);
		expect(commands.some((cmd) => cmd.includes("rm -rf") && cmd.includes("/home/u/.cache/vetta/helper"))).toBe(true);
	});
});
