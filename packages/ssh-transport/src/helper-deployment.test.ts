// Copyright The Open Forge contributors.
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
		const establishment = await connectSshHelper(connection, {
			resolveBinary: () => localHelperBinary(),
			handshakeTimeoutMs: 100,
		});
		// fake 连接没有可用的常驻通道，部署最后一步失败：属临时失败而非平台不支持。
		expect(establishment.status).toBe("transient-failure");
		expect(writtenPaths).toEqual(["/home/u/.cache/openforge/helper/1.1.0/openforge-ssh-helper"]);
		expect(commands.some((cmd) => cmd.includes("rm -rf") && cmd.includes("/home/u/.cache/vetta/helper"))).toBe(true);
	});

	it("不支持的平台归为 unsupported，不做任何上传尝试", async () => {
		const { commands, writtenPaths, connection } = fakeConnection();
		const establishment = await connectSshHelper(
			Object.assign(connection, { probePlatform: async () => ({ os: "Windows_NT", arch: "AMD64" }) }),
			{ resolveBinary: () => localHelperBinary(), handshakeTimeoutMs: 100 },
		);
		expect(establishment).toMatchObject({ status: "unsupported" });
		expect(writtenPaths).toEqual([]);
		expect(commands).toEqual([]);
	});

	it("本机没有对应构建同样归为 unsupported", async () => {
		const { connection } = fakeConnection();
		const establishment = await connectSshHelper(connection, {
			resolveBinary: () => undefined,
			handshakeTimeoutMs: 100,
		});
		expect(establishment).toMatchObject({ status: "unsupported" });
	});

	it("临时失败的分阶段耗时随诊断输出", async () => {
		const diagnostics: string[] = [];
		const { connection } = fakeConnection();
		const establishment = await connectSshHelper(connection, {
			resolveBinary: () => localHelperBinary(),
			handshakeTimeoutMs: 100,
			onDiagnostic: (message) => diagnostics.push(message),
		});
		expect(establishment.status).toBe("transient-failure");
		expect(diagnostics.some((message) => /unavailable after \d+ms/.test(message))).toBe(true);
	});
});
