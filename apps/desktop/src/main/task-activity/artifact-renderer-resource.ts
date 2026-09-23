import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
	formatSshProjectUri,
	isSshProjectUri,
	normalizeRemotePath,
	parseProjectLocation,
} from "@vetta/ssh-transport/project-uri";
import { readFilesystemBinaryFile, readFilesystemFile, statFilesystemPath } from "../filesystem/filesystem-service.js";
import { assertRemotePathWithinProject } from "../filesystem/remote-filesystem.js";
import { getSshConnection } from "../ssh/ssh-runtime.js";

const MAX_ARTIFACT_RENDER_TEXT_BYTES = 10 * 1024 * 1024;
const MAX_ARTIFACT_RENDER_BYTES = 32 * 1024 * 1024;

export type ArtifactRendererResourceStatus = "available" | "missing" | "unavailable";

export interface ArtifactRendererResourceInspection {
	readonly status: ArtifactRendererResourceStatus;
	readonly sizeBytes: number;
}

interface LocalArtifactResource {
	readonly kind: "local";
	readonly path: string;
	readonly sizeBytes: number;
}

interface RemoteArtifactResource {
	readonly kind: "remote";
	readonly uri: string;
	readonly sizeBytes: number;
}

type ResolvedArtifactResource = LocalArtifactResource | RemoteArtifactResource;

type ArtifactResourceResolution =
	| { readonly status: "available"; readonly resource: ResolvedArtifactResource }
	| { readonly status: "missing" }
	| { readonly status: "unavailable" };

export async function inspectArtifactRendererResource(
	uri: string | undefined,
	sourceCwd: string | undefined,
): Promise<ArtifactRendererResourceInspection> {
	const result = await resolveArtifactRendererResource(uri, sourceCwd, false);
	return {
		status: result.status,
		sizeBytes: result.status === "available" ? result.resource.sizeBytes : 0,
	};
}

export async function readArtifactRendererText(
	uri: string | undefined,
	sourceCwd: string | undefined,
): Promise<string> {
	const resource = await requireArtifactRendererResource(uri, sourceCwd);
	if (resource.sizeBytes > MAX_ARTIFACT_RENDER_TEXT_BYTES) throw new Error("Artifact text is too large to render");
	if (resource.kind === "local")
		return (await readLocalBytes(resource.path, MAX_ARTIFACT_RENDER_TEXT_BYTES)).toString("utf8");
	const file = await readFilesystemFile(resource.uri);
	return file.encoding === "utf8" ? file.content : Buffer.from(file.content, "base64").toString("utf8");
}

export async function readArtifactRendererBytes(
	uri: string | undefined,
	sourceCwd: string | undefined,
): Promise<ArrayBuffer> {
	const resource = await requireArtifactRendererResource(uri, sourceCwd);
	if (resource.sizeBytes > MAX_ARTIFACT_RENDER_BYTES) throw new Error("Artifact is too large to render");
	const bytes =
		resource.kind === "local"
			? await readLocalBytes(resource.path, MAX_ARTIFACT_RENDER_BYTES)
			: Buffer.from((await readFilesystemBinaryFile(resource.uri)).data, "base64");
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function requireArtifactRendererResource(
	uri: string | undefined,
	sourceCwd: string | undefined,
): Promise<ResolvedArtifactResource> {
	const result = await resolveArtifactRendererResource(uri, sourceCwd, true);
	if (result.status !== "available") throw new Error(`Artifact resource is ${result.status}`);
	return result.resource;
}

async function resolveArtifactRendererResource(
	uri: string | undefined,
	sourceCwd: string | undefined,
	verifyRemoteFile: boolean,
): Promise<ArtifactResourceResolution> {
	if (!uri || !sourceCwd) return { status: "unavailable" };
	if (isSshProjectUri(sourceCwd) || isSshProjectUri(uri)) {
		return await resolveRemoteArtifact(uri, sourceCwd, verifyRemoteFile);
	}
	const candidate = localArtifactPath(uri, sourceCwd);
	if (!candidate || !isPathWithin(sourceCwd, candidate)) return { status: "unavailable" };
	let canonicalRoot: string;
	let canonicalPath: string;
	try {
		canonicalRoot = await realpath(sourceCwd);
	} catch {
		return { status: "unavailable" };
	}
	try {
		canonicalPath = await realpath(candidate);
	} catch (error) {
		return isNotFound(error) ? { status: "missing" } : { status: "unavailable" };
	}
	if (!isPathWithin(canonicalRoot, canonicalPath)) return { status: "unavailable" };
	try {
		const info = await stat(canonicalPath);
		if (!info.isFile() || info.size > MAX_ARTIFACT_RENDER_BYTES) return { status: "unavailable" };
		return { status: "available", resource: { kind: "local", path: canonicalPath, sizeBytes: info.size } };
	} catch (error) {
		return isNotFound(error) ? { status: "missing" } : { status: "unavailable" };
	}
}

function localArtifactPath(uri: string, sourceCwd: string): string | undefined {
	if (uri.startsWith("file:")) {
		try {
			const url = new URL(uri);
			if (url.protocol !== "file:" || (url.hostname && url.hostname !== "localhost")) return undefined;
			return fileURLToPath(url);
		} catch {
			return undefined;
		}
	}
	if (/^[a-z][a-z\d+.-]*:/i.test(uri) && !/^[a-zA-Z]:[\\/]/.test(uri)) return undefined;
	return isAbsolute(uri) ? resolve(uri) : resolve(sourceCwd, uri);
}

async function resolveRemoteArtifact(
	uri: string,
	sourceCwd: string,
	verifyRemoteFile: boolean,
): Promise<ArtifactResourceResolution> {
	try {
		const root = parseProjectLocation(sourceCwd);
		const target = parseProjectLocation(uri);
		if (root.kind !== "ssh" || target.kind !== "ssh" || root.hostId !== target.hostId) {
			return { status: "unavailable" };
		}
		const rootPath = normalizeRemotePath(root.remotePath);
		const targetPath = normalizeRemotePath(target.remotePath);
		if (targetPath.split("/").includes("..")) return { status: "unavailable" };
		const relativePath = posix.relative(rootPath, targetPath);
		if (relativePath === ".." || relativePath.startsWith("../") || posix.isAbsolute(relativePath)) {
			return { status: "unavailable" };
		}
		assertRemotePathWithinProject(uri);
		if (!verifyRemoteFile) return { status: "available", resource: { kind: "remote", uri, sizeBytes: 0 } };
		const connection = getSshConnection(root.hostId);
		const canonicalRoot = normalizeRemotePath(await connection.realPath(rootPath));
		const canonicalTarget = normalizeRemotePath(await connection.realPath(targetPath));
		const canonicalRelativePath = posix.relative(canonicalRoot, canonicalTarget);
		if (
			canonicalRelativePath === ".." ||
			canonicalRelativePath.startsWith("../") ||
			posix.isAbsolute(canonicalRelativePath)
		) {
			return { status: "unavailable" };
		}
		const canonicalUri = formatSshProjectUri(root.hostId, canonicalTarget);
		const file = await statFilesystemPath(canonicalUri);
		if (!file) return { status: "missing" };
		if (file.size > MAX_ARTIFACT_RENDER_BYTES) return { status: "unavailable" };
		return { status: "available", resource: { kind: "remote", uri: canonicalUri, sizeBytes: file.size } };
	} catch {
		return { status: "unavailable" };
	}
}

async function readLocalBytes(path: string, limit: number): Promise<Buffer> {
	const handle = await open(path, "r");
	try {
		const info = await handle.stat();
		if (info.size > limit) throw new Error("Artifact is too large to render");
		const buffer = Buffer.alloc(info.size);
		const { bytesRead } = await handle.read(buffer, 0, info.size, 0);
		return bytesRead === info.size ? buffer : buffer.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

function isNotFound(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isPathWithin(root: string, target: string): boolean {
	const relativePath = relative(resolve(root), resolve(target));
	return (
		relativePath === "" ||
		(relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
	);
}
