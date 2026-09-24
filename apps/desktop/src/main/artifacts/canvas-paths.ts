// Copyright The Open Forge contributors.
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isSshProjectUri } from "@vetta/ssh-transport";

const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function encodeCanvasWorkspaceBucket(workspaceId: string): string {
	if (!workspaceId.trim()) throw new Error("workspaceId is required");
	return Buffer.from(workspaceId, "utf8").toString("base64url");
}

export function assertCanvasArtifactId(artifactId: string): string {
	if (!ARTIFACT_ID_PATTERN.test(artifactId) || artifactId.includes("..")) {
		throw new Error(`invalid artifactId: ${artifactId}`);
	}
	return artifactId;
}

export function sha256Hex(content: string | Uint8Array): string {
	const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
	return createHash("sha256").update(bytes).digest("hex");
}

export function canvasFileName(version: number, extension: string): string {
	const normalized = extension.startsWith(".") ? extension : `.${extension}`;
	return `v${version}${normalized}`;
}

export function parseCanvasVersionFileName(
	name: string,
): { readonly version: number; readonly extension: string } | undefined {
	const match = /^v(\d+)(\.[A-Za-z0-9]+)$/.exec(name);
	if (!match) return undefined;
	return { version: Number(match[1]), extension: match[2] ?? ".md" };
}

export function extensionForArtifact(input: {
	readonly contentType?: string;
	readonly filename?: string;
	readonly title?: string;
	readonly fallback?: string;
}): string {
	const named = input.filename ? extname(input.filename) : "";
	if (named) return named;
	const titled = input.title ? extname(input.title) : "";
	if (titled) return titled;
	if (input.contentType === "text/html" || input.contentType === "application/xhtml+xml") return ".html";
	if (input.contentType === "application/json") return ".json";
	if (input.contentType === "text/plain") return ".txt";
	if (input.contentType?.startsWith("text/markdown") || input.contentType === "text/md") return ".md";
	return input.fallback ?? ".md";
}

export function localPathToArtifactUri(filePath: string): string {
	return pathToFileURL(filePath).href;
}

/** 本机 file URI / 绝对路径 / SSH 项目 URI 可回读；其余 scheme 交给调用方。 */
export function artifactUriToPath(uri: string): string | undefined {
	if (uri.startsWith("file://")) {
		try {
			return fileURLToPath(uri);
		} catch {
			return undefined;
		}
	}
	if (isSshProjectUri(uri)) return uri;
	if (/^([A-Za-z]:[\\/]|\/)/.test(uri)) return uri;
	return undefined;
}

export function isPathLikeWorkspaceId(workspaceId: string): boolean {
	return isSshProjectUri(workspaceId) || /^([A-Za-z]:[\\/]|\/)/.test(workspaceId);
}
