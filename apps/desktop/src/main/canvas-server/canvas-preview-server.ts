// Copyright The Open Forge contributors.
import type { Stats } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { assertCanvasArtifactId, encodeCanvasWorkspaceBucket } from "../artifacts/canvas-paths.js";
import {
	CANVAS_PREVIEW_CACHE_CONTROL,
	CANVAS_PREVIEW_ENTRY_FILE,
	type CanvasPreviewRequestTarget,
	canvasPreviewUrl,
	contentTypeForCanvasFile,
	isPathInside,
	parseCanvasPreviewRequestPath,
	previewGrantKey,
	selectCanvasPreviewEntry,
} from "./canvas-preview-paths.js";

/**
 * Canvas HTML artifact 的本地只读试跑伺服。
 *
 * 预览页需要完整浏览器语境（`connect-src`、外链、媒体），而 `<webview>` 沙箱按
 * ADR-0129 必须保持 deny；这里给出的是**并列的第二条路径**：主进程在回环地址上
 * 只读地伺服用户显式打开过的那一个 artifact 目录，页面在应用内的 Browser Tab 里跑。
 * 它不放大 `<webview>` 的能力，也不给 canvas 目录任何写权限。
 *
 * 约束（每一条都有对应测试）：
 *   - 只监听 `127.0.0.1`，端口交给内核选（port 0），不与用户机器上的服务抢固定端口；
 *   - 只读：非 GET/HEAD 一律 405；
 *   - 只伺服授权过的 artifact（`grant()` 记录），且落点必须 realpath 之后仍在画布根内；
 *   - 每次请求重新解析入口文件，Agent 写出新版本后刷新即生效。
 */

const LOOPBACK_HOST = "127.0.0.1";

export interface CanvasPreviewServerOptions {
	/** 画布存储根（`CanvasStore` 的 root）。伺服范围不会超出它。 */
	readonly root: string;
	readonly logger?: (message: string) => void;
}

export interface CanvasPreviewGrantInput {
	readonly workspaceId: string;
	readonly artifactId: string;
}

export interface CanvasPreviewAddress {
	readonly port: number;
	readonly url: string;
}

export class CanvasPreviewServer {
	private readonly root: string;
	private readonly log: (message: string) => void;
	/** 授权过的 `bucket/artifactId`：页面只能读到用户打开过的那些 artifact。 */
	private readonly grants = new Set<string>();
	private server: Server | undefined;
	private starting: Promise<number> | undefined;
	private boundPort: number | undefined;

	constructor(options: CanvasPreviewServerOptions) {
		this.root = options.root;
		this.log = options.logger ?? (() => undefined);
	}

	get listening(): boolean {
		return this.server !== undefined && this.boundPort !== undefined;
	}

	get port(): number | undefined {
		return this.boundPort;
	}

	/** 授权一个 artifact 并保证服务已就绪，返回它本次可加载的回环地址。 */
	async grant(input: CanvasPreviewGrantInput): Promise<CanvasPreviewAddress> {
		// 先校验再启动：非法标识不该留下一个没有授权的监听端口。
		const artifactId = assertCanvasArtifactId(input.artifactId);
		const workspaceToken = encodeCanvasWorkspaceBucket(input.workspaceId);
		const port = await this.ensureStarted();
		this.grants.add(previewGrantKey(workspaceToken, artifactId));
		return { port, url: canvasPreviewUrl({ port, workspaceId: input.workspaceId, artifactId }) };
	}

	/** 释放监听端口与全部授权；重复调用安全。 */
	async stop(): Promise<void> {
		const server = this.server;
		this.server = undefined;
		this.starting = undefined;
		this.boundPort = undefined;
		this.grants.clear();
		if (!server) return;
		// 页面可能挂着 keep-alive 连接：先断开再关，否则 close() 会一直等它。
		server.closeAllConnections();
		await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
	}

	private ensureStarted(): Promise<number> {
		if (this.boundPort !== undefined) return Promise.resolve(this.boundPort);
		// 同一个实例上的并发打开请求共享一次 listen，不能各自起一个监听器。
		this.starting ??= this.listen().catch((error: unknown) => {
			this.starting = undefined;
			throw error;
		});
		return this.starting;
	}

	private async listen(): Promise<number> {
		const server = createServer((request, response) => void this.handle(request, response));
		try {
			const port = await new Promise<number>((resolvePromise, rejectPromise) => {
				const onError = (error: Error): void => rejectPromise(error);
				server.once("error", onError);
				// port 0：由内核挑一个空闲端口，避免与用户机器上的其它服务抢位置。
				server.listen({ host: LOOPBACK_HOST, port: 0 }, () => {
					server.off("error", onError);
					const address = server.address();
					if (!address || typeof address === "string") {
						rejectPromise(new Error("canvas preview server did not bind a loopback port"));
						return;
					}
					resolvePromise(address.port);
				});
			});
			this.server = server;
			this.boundPort = port;
			return port;
		} catch (error) {
			server.close();
			throw error;
		}
	}

	private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
		try {
			const method = (request.method ?? "GET").toUpperCase();
			if (method !== "GET" && method !== "HEAD") {
				// 只读：写方法与任何自定义动词一律拒绝，且不说明路由是否存在。
				this.respondEmpty(response, 405, { allow: "GET, HEAD" });
				return;
			}

			const parsed = parseCanvasPreviewRequestPath(request.url ?? "");
			if (!parsed.ok) {
				// 路由之外当作"没有这个资源"；路由内不满足字面合同按越界处理。
				this.respondEmpty(response, parsed.rejection === "outside-route" ? 404 : 403);
				return;
			}

			const { workspaceToken, artifactId } = parsed.target;
			if (!this.grants.has(previewGrantKey(workspaceToken, artifactId))) {
				this.respondEmpty(response, 403);
				return;
			}

			const path = await this.resolveServedFile(parsed.target);
			if (!path) {
				this.respondEmpty(response, 404);
				return;
			}

			const content = await readFile(path);
			response.writeHead(200, {
				"content-type": contentTypeForCanvasFile(parsed.target.file),
				"content-length": String(content.byteLength),
				"cache-control": CANVAS_PREVIEW_CACHE_CONTROL,
				"x-content-type-options": "nosniff",
			});
			response.end(method === "HEAD" ? undefined : content);
		} catch (error) {
			this.log(`canvas preview request failed: ${error instanceof Error ? error.message : String(error)}`);
			if (response.headersSent) response.end();
			else this.respondEmpty(response, 500);
		}
	}

	/**
	 * 把已经通过字面校验的请求落到一个真实文件上。
	 *
	 * 字面校验只能保证"段本身"合法；符号链接仍然可以把落点指到画布之外，所以这里
	 * 对目录与文件都取 realpath，再要求落点在画布根（目录）与 artifact 目录（文件）内。
	 */
	private async resolveServedFile(target: CanvasPreviewRequestTarget): Promise<string | undefined> {
		const root = await realpathOrUndefined(this.root);
		if (!root) return undefined;

		// 目录布局来自 CanvasStore：`<root>/<bucket(workspaceId)>/<artifactId>/`。
		const artifactDir = await realpathOrUndefined(join(this.root, target.workspaceToken, target.artifactId));
		if (!artifactDir || !isPathInside(root, artifactDir)) return undefined;

		const candidate =
			target.file === CANVAS_PREVIEW_ENTRY_FILE
				? await this.resolveEntry(artifactDir)
				: join(artifactDir, target.file);
		if (!candidate) return undefined;

		const file = await realpathOrUndefined(candidate);
		if (!file || !isPathInside(artifactDir, file)) return undefined;
		return (await statOrUndefined(file))?.isFile() ? file : undefined;
	}

	private async resolveEntry(artifactDir: string): Promise<string | undefined> {
		const names = await readdirOrUndefined(artifactDir);
		if (!names) return undefined;
		const entry = selectCanvasPreviewEntry(names);
		return entry ? join(artifactDir, entry) : undefined;
	}

	private respondEmpty(response: ServerResponse, status: number, headers: Record<string, string> = {}): void {
		response.writeHead(status, { "cache-control": CANVAS_PREVIEW_CACHE_CONTROL, ...headers });
		response.end();
	}
}

async function realpathOrUndefined(path: string): Promise<string | undefined> {
	try {
		return await realpath(path);
	} catch {
		return undefined;
	}
}

async function statOrUndefined(path: string): Promise<Stats | undefined> {
	try {
		return await stat(path);
	} catch {
		return undefined;
	}
}

async function readdirOrUndefined(path: string): Promise<readonly string[] | undefined> {
	try {
		return await readdir(path);
	} catch {
		return undefined;
	}
}
