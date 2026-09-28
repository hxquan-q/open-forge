// Copyright The Open Forge contributors.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { CanvasStore } from "../artifacts/canvas-store.js";
import { selectCanvasPreviewEntry } from "./canvas-preview-paths.js";
import { CanvasPreviewServer } from "./canvas-preview-server.js";

/**
 * Desktop 侧的 Canvas 回环预览装配：单例伺服 + "这个 artifact 能不能试跑"的判定。
 *
 * 服务是按需启停的：第一次打开预览才 listen，窗口关闭或应用退出时释放，
 * 进程里不会常驻一个没有消费者的本地端口。
 */

let singleton: CanvasPreviewServer | undefined;

/** 与 `createDesktopCanvasArtifactService` 使用同一个画布根。 */
function defaultCanvasRoot(): string {
	return join(getVettaHomePath(), "canvas");
}

export function getCanvasPreviewServer(root: string = defaultCanvasRoot()): CanvasPreviewServer {
	singleton ??= new CanvasPreviewServer({ root, logger: defaultLogger });
	return singleton;
}

/** 释放监听端口与授权；没有起过服务时是空操作。 */
export async function disposeCanvasPreviewServer(): Promise<void> {
	const current = singleton;
	singleton = undefined;
	await current?.stop();
}

export type OpenCanvasPreviewResult =
	| { readonly ok: true; readonly url: string }
	| { readonly ok: false; readonly code: "invalid_input" | "missing_file"; readonly message: string };

export interface OpenCanvasPreviewDependencies {
	/** 画布根；测试注入临时目录。 */
	readonly root?: string;
	/** 伺服实例；测试注入自建实例，避免模块级单例互相影响。 */
	readonly server?: CanvasPreviewServer;
}

/**
 * 打开一个 HTML artifact 的试跑地址：先确认它确实有 HTML 版本，再授权伺服并回 URL。
 * 缺版本文件时回 `missing_file`——用户的预览栏里那份内容已经不在磁盘上了。
 */
export async function openCanvasArtifactPreviewInBrowser(
	input: { readonly workspaceId: string; readonly artifactId: string },
	dependencies: OpenCanvasPreviewDependencies = {},
): Promise<OpenCanvasPreviewResult> {
	if (!input.workspaceId.trim()) return { ok: false, code: "invalid_input", message: "workspaceId is required" };

	const root = dependencies.root ?? defaultCanvasRoot();
	const store = new CanvasStore(root);
	let artifactDir: string;
	try {
		artifactDir = store.artifactDir(input.workspaceId, input.artifactId);
	} catch (error) {
		return {
			ok: false,
			code: "invalid_input",
			message: error instanceof Error ? error.message : "invalid artifactId",
		};
	}

	const entry = await readEntry(artifactDir);
	if (!entry) {
		return { ok: false, code: "missing_file", message: "this artifact has no HTML version to preview" };
	}

	const server = dependencies.server ?? getCanvasPreviewServer(root);
	const address = await server.grant({ workspaceId: input.workspaceId, artifactId: input.artifactId });
	return { ok: true, url: address.url };
}

async function readEntry(artifactDir: string): Promise<string | undefined> {
	try {
		return selectCanvasPreviewEntry(await readdir(artifactDir));
	} catch {
		return undefined;
	}
}

/**
 * 伺服失败只影响这一次预览，不值得把整个 IPC 结果变成错误；动态引入是为了
 * 不把 electron-log 拖进单测进程。
 */
function defaultLogger(message: string): void {
	void import("../logger.js")
		.then(({ getAppLogger }) => getAppLogger("canvas-preview").warn(message))
		.catch(() => undefined);
}
