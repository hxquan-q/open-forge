// Copyright The Open Forge contributors.
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { McpJsonObject, McpToolCallResult } from "@vetta/runtime-mcp";
import { StdioMcpClient } from "@vetta/runtime-node/mcp";
import { ComputerWindowSchema } from "../../shared/computer-use.js";
import bundleContract from "../../shared/computer-use-backend.json";
import type { ComputerBackend, ComputerBackendCommand, ComputerBackendResult } from "./contracts.js";

const BackendResultSchema = Type.Object(
	{
		ok: Type.Boolean(),
		code: Type.Optional(Type.String({ maxLength: 128 })),
		text: Type.Optional(Type.String({ maxLength: 70_000 })),
		windows: Type.Optional(Type.Array(ComputerWindowSchema, { maxItems: 1024 })),
		image: Type.Optional(
			Type.Object(
				{
					data: Type.String({ maxLength: 12_000_000, pattern: "^[A-Za-z0-9+/=]+$" }),
					mimeType: Type.Literal("image/png"),
				},
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);
const BundleSchema = Type.Object(
	{
		protocol: Type.Literal(bundleContract.protocol),
		platform: Type.Literal(bundleContract.platform),
		pythonVersion: Type.Literal(bundleContract.pythonVersion),
		fingerprint: Type.String({ pattern: "^[a-f0-9]{64}$" }),
		files: Type.Record(Type.String(), Type.String({ pattern: "^[a-f0-9]{64}$" })),
	},
	{ additionalProperties: false },
);

export async function verifyBackendResources(root: string): Promise<void> {
	let value: unknown;
	try {
		value = JSON.parse(await readFile(join(root, "bundle.json"), "utf8"));
	} catch {
		throw new Error("backend_not_bundled");
	}
	if (!Value.Check(BundleSchema, value)) throw new Error("backend_integrity_failed");
	const bundle: Static<typeof BundleSchema> = value;
	for (const required of bundleContract.requiredFiles) {
		if (!bundle.files[required]) throw new Error("backend_integrity_failed");
	}
	try {
		const actualRoot = await realpath(root);
		for (const [file, expected] of Object.entries(bundle.files)) {
			if (
				!/^(runtime|worker|licenses)\//.test(file) ||
				file.includes("\\") ||
				file.includes(":") ||
				file.split("/").some((p) => p === ".." || p === ".")
			)
				throw new Error("backend_integrity_failed");
			const path = join(root, file);
			const info = await lstat(path);
			const within = relative(actualRoot, await realpath(path));
			if (!info.isFile() || info.isSymbolicLink() || isAbsolute(within) || within.startsWith(".."))
				throw new Error("backend_integrity_failed");
			if (
				createHash("sha256")
					.update(await readFile(path))
					.digest("hex") !== expected
			)
				throw new Error("backend_integrity_failed");
		}
	} catch (error) {
		throw new Error("backend_integrity_failed", { cause: error });
	}
}

export function readBackendResult(result: McpToolCallResult): ComputerBackendResult {
	if (result.isError || result.content.length !== 1 || result.content[0]?.type !== "text")
		throw new Error("backend_protocol_failed");
	const value: unknown = JSON.parse(result.content[0].text);
	if (!Value.Check(BackendResultSchema, value)) throw new Error("backend_protocol_failed");
	return value;
}

interface BackendClient {
	initialize: StdioMcpClient["initialize"];
	callTool: StdioMcpClient["callTool"];
	close: StdioMcpClient["close"];
	getPid: StdioMcpClient["getPid"];
}

export class BundledComputerBackend implements ComputerBackend {
	private client?: BackendClient;
	private starting?: Promise<BackendClient>;
	private stopping?: Promise<void>;
	constructor(
		private readonly options: {
			root: string;
			cache: string;
			createClient?: () => BackendClient;
			verify?: () => Promise<void>;
		},
	) {}

	async invoke(command: ComputerBackendCommand, signal?: AbortSignal): Promise<ComputerBackendResult> {
		const client = await this.connect();
		signal?.throwIfAborted();
		try {
			const result = readBackendResult(
				await client.callTool("computer_action", JSON.parse(JSON.stringify(command)) as McpJsonObject, { signal }),
			);
			if (result.code === "input_release_failed") throw new Error("stop_failed");
			return result;
		} catch (error) {
			if (signal?.aborted) await this.interrupt();
			throw error;
		}
	}

	interrupt(): Promise<void> {
		if (this.stopping) return this.stopping;
		const operation = (async () => {
			if (this.starting) await this.starting;
			if (!this.client) return;
			const result = readBackendResult(await this.client.callTool("stop", {}));
			if (!result.ok) throw new Error("stop_failed");
		})();
		this.stopping = operation.finally(() => {
			this.stopping = undefined;
		});
		return this.stopping;
	}

	async dispose(): Promise<void> {
		if (this.starting) await this.starting.catch(() => undefined);
		const client = this.client;
		if (!client) return;
		let stopFailure: unknown;
		try {
			await this.interrupt();
		} catch (error) {
			stopFailure = error;
		}
		const pid = client.getPid();
		await client.close();
		if (pid) {
			let exited = false;
			try {
				process.kill(pid, 0);
			} catch (error) {
				exited = error instanceof Error && "code" in error && error.code === "ESRCH";
			}
			if (!exited) throw new Error("stop_failed");
		}
		this.client = undefined;
		if (stopFailure) throw stopFailure;
	}

	private connect(): Promise<BackendClient> {
		if (this.starting) return this.starting;
		if (this.client) return Promise.resolve(this.client);
		const operation = (async () => {
			await (this.options.verify?.() ?? verifyBackendResources(this.options.root));
			const client =
				this.options.createClient?.() ??
				new StdioMcpClient({
					name: "computer-use",
					timeout: 30_000,
					config: {
						command: join(this.options.root, "runtime", "pythonw.exe"),
						args: [
							"-I",
							"-B",
							join(this.options.root, "worker", "server.py"),
							"--cache",
							this.options.cache,
							"--exclude-pid",
							String(process.pid),
						],
						cwd: this.options.cache,
					},
				});
			try {
				const initialized = await client.initialize({
					protocolVersion: "2024-11-05",
					clientInfo: { name: "vetta-computer-use", version: "1" },
					capabilities: {},
				});
				if (initialized.serverInfo.name !== "vetta-computer-use" || initialized.serverInfo.version !== "1.0.0")
					throw new Error("backend_protocol_failed");
				this.client = client;
				return client;
			} catch (error) {
				await client.close();
				throw error;
			}
		})();
		this.starting = operation.finally(() => {
			this.starting = undefined;
		});
		return this.starting;
	}
}
