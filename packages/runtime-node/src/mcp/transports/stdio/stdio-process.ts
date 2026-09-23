// Modified by The Open Forge contributors.
import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { McpStdioServerConfig } from "../../protocol/index.js";
import { shouldUseWindowsCommandShell } from "./stdio-shell.js";

export interface StdioMcpProcessOptions {
	readonly config: McpStdioServerConfig;
	readonly name: string;
	readonly debug?: boolean;
	readonly startupTimeout?: number;
	/** 单条换行分隔 JSON-RPC 消息的最大字节数（正整数）；缺省 16 MiB。 */
	readonly maxMessageBytes?: number;
}

/**
 * 单条 stdio JSON-RPC 消息允许的最大字节数。超过上限说明对端不再是可解析的
 * 消息流（或结果本身超出合同），继续累积只会无界占用内存：立即报错并终止
 * 进程，而不是把半条消息读进内存。
 */
const DEFAULT_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

type StdioMcpProcessEvents = {
	message: [message: unknown];
	error: [error: Error];
	exit: [code: number | null, signal: string | null];
	ready: [];
};

/** Node child-process adapter for newline-delimited MCP JSON-RPC. */
export class StdioMcpProcess extends EventEmitter<StdioMcpProcessEvents> {
	private process: ChildProcess | null = null;
	private readonly config: McpStdioServerConfig;
	private readonly name: string;
	private readonly debug: boolean;
	private readonly startupTimeout: number;
	private messageBuffer = "";
	private bufferedBytes = 0;
	private readonly maxMessageBytes: number;
	private isReady = false;
	private isClosed = false;

	constructor(options: StdioMcpProcessOptions) {
		super();
		this.config = options.config;
		this.name = options.name;
		this.debug = options.debug || options.config.debug || false;
		this.startupTimeout = options.startupTimeout || options.config.startupTimeout || 10000;
		const maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
		if (!Number.isInteger(maxMessageBytes) || maxMessageBytes <= 0) {
			throw new Error(`maxMessageBytes must be a positive integer, received: ${maxMessageBytes}`);
		}
		this.maxMessageBytes = maxMessageBytes;
	}

	async start(): Promise<void> {
		if (this.process) throw new Error(`MCP server '${this.name}' is already running`);

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.cleanup();
				reject(new Error(`MCP server '${this.name}' startup timeout after ${this.startupTimeout}ms`));
			}, this.startupTimeout);

			try {
				this.log(`Starting MCP server: ${this.config.command} ${(this.config.args || []).join(" ")}`);
				this.process = spawn(this.config.command, this.config.args || [], {
					env: { ...process.env, ...this.config.env },
					cwd: this.config.cwd,
					stdio: ["pipe", "pipe", "pipe"],
					shell: shouldUseWindowsCommandShell(this.config.command),
				});
				this.process.stdout?.on("data", (data: Buffer) => this.handleStdout(data));
				this.process.stderr?.on("data", (data: Buffer) => this.handleStderr(data));
				this.process.on("exit", (code, signal) => {
					this.log(`Process exited with code ${code}, signal ${signal}`);
					clearTimeout(timeout);
					this.cleanup();
					this.emit("exit", code, signal);
				});
				this.process.on("error", (error) => {
					this.log(`Process error: ${error.message}`);
					clearTimeout(timeout);
					this.cleanup();
					this.emit("error", error);
					reject(error);
				});
				this.isReady = true;
				clearTimeout(timeout);
				this.emit("ready");
				resolve();
			} catch (error) {
				clearTimeout(timeout);
				this.cleanup();
				reject(error);
			}
		});
	}

	send(message: unknown): void {
		if (!this.process?.stdin) throw new Error(`Cannot send message: MCP server '${this.name}' is not running`);
		if (this.isClosed) throw new Error(`Cannot send message: MCP server '${this.name}' is closed`);
		const json = JSON.stringify(message);
		this.log(`Sending: ${json}`);
		this.process.stdin.write(`${json}\n`);
	}

	async stop(): Promise<void> {
		if (!this.process) return;
		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				this.log("Graceful shutdown timeout, force killing");
				this.process?.kill("SIGKILL");
			}, 5000);
			this.process?.once("exit", () => {
				clearTimeout(timeout);
				this.cleanup();
				resolve();
			});
			this.log("Stopping process");
			this.process?.kill("SIGTERM");
		});
	}

	getPid(): number | undefined {
		return this.process?.pid;
	}

	isRunning(): boolean {
		return this.process !== null && !this.isClosed;
	}

	isProcessReady(): boolean {
		return this.isReady && !this.isClosed;
	}

	private handleStdout(data: Buffer): void {
		this.bufferedBytes += data.byteLength;
		this.messageBuffer += data.toString();
		if (this.bufferedBytes > this.maxMessageBytes && !this.messageBuffer.includes("\n")) {
			// 半条消息已超过上限：流不再可解析，终止进程并保留有界的错误现场。
			const preview = this.messageBuffer.slice(0, 200);
			this.messageBuffer = "";
			this.bufferedBytes = 0;
			this.log(`Message exceeded ${this.maxMessageBytes} bytes: ${preview}`);
			this.emit("error", new Error(`MCP server message exceeded ${this.maxMessageBytes} bytes: ${preview}`));
			this.process?.kill("SIGKILL");
			return;
		}
		const lines = this.messageBuffer.split("\n");
		this.messageBuffer = lines.pop() || "";
		this.bufferedBytes = Buffer.byteLength(this.messageBuffer, "utf8");
		for (const line of lines) {
			if (!line.trim()) continue;
			if (Buffer.byteLength(line, "utf8") > this.maxMessageBytes) {
				const preview = line.slice(0, 200);
				this.log(`Message exceeded ${this.maxMessageBytes} bytes: ${preview}`);
				this.emit("error", new Error(`MCP server message exceeded ${this.maxMessageBytes} bytes: ${preview}`));
				this.process?.kill("SIGKILL");
				continue;
			}
			try {
				const message: unknown = JSON.parse(line);
				this.log(`Received: ${line}`);
				this.emit("message", message);
			} catch {
				const preview = line.slice(0, 200);
				this.log(`Failed to parse JSON: ${preview}`);
				this.emit("error", new Error(`Invalid JSON from MCP server: ${preview}`));
			}
		}
	}

	private handleStderr(data: Buffer): void {
		const text = data.toString().trim();
		if (text) this.log(`[stderr] ${text}`);
	}

	private cleanup(): void {
		if (this.process) {
			this.process.removeAllListeners();
			this.process.stdout?.removeAllListeners();
			this.process.stderr?.removeAllListeners();
			this.process.stdin?.removeAllListeners();
		}
		this.process = null;
		this.isReady = false;
		this.isClosed = true;
		this.messageBuffer = "";
		this.bufferedBytes = 0;
	}

	private log(message: string): void {
		if (this.debug) console.error(`[MCP:${this.name}] ${message}`);
	}
}
