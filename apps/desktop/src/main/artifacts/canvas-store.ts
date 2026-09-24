// Copyright The Open Forge contributors.
import { mkdir, readdir, readFile, rm, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFileAsync } from "@vetta/toolkit/atomic-write";
import {
	assertCanvasArtifactId,
	canvasFileName,
	encodeCanvasWorkspaceBucket,
	extensionForArtifact,
	localPathToArtifactUri,
	parseCanvasVersionFileName,
	sha256Hex,
} from "./canvas-paths.js";

export interface CanvasStoreWriteInput {
	readonly workspaceId: string;
	readonly artifactId: string;
	readonly version: number;
	readonly content: string;
	readonly contentType?: string;
	readonly filename?: string;
	readonly title?: string;
}

export interface CanvasStoredFile {
	readonly workspaceId: string;
	readonly artifactId: string;
	readonly version: number;
	readonly path: string;
	readonly uri: string;
	readonly checksum: string;
	readonly extension: string;
}

export class CanvasStore {
	constructor(private readonly root: string) {}

	workspaceDir(workspaceId: string): string {
		return join(this.root, encodeCanvasWorkspaceBucket(workspaceId));
	}

	artifactDir(workspaceId: string, artifactId: string): string {
		return join(this.workspaceDir(workspaceId), assertCanvasArtifactId(artifactId));
	}

	versionPath(workspaceId: string, artifactId: string, version: number, extension: string): string {
		return join(this.artifactDir(workspaceId, artifactId), canvasFileName(version, extension));
	}

	async write(input: CanvasStoreWriteInput): Promise<CanvasStoredFile> {
		const extension = extensionForArtifact(input);
		const path = this.versionPath(input.workspaceId, input.artifactId, input.version, extension);
		await atomicWriteFileAsync(path, input.content);
		return {
			workspaceId: input.workspaceId,
			artifactId: input.artifactId,
			version: input.version,
			path,
			uri: localPathToArtifactUri(path),
			checksum: sha256Hex(input.content),
			extension,
		};
	}

	async read(workspaceId: string, artifactId: string, version: number): Promise<CanvasStoredFile | undefined> {
		const found = (await this.listVersions(workspaceId, artifactId)).find((item) => item.version === version);
		return found;
	}

	async readContent(path: string): Promise<string | undefined> {
		try {
			return await readFile(path, "utf8");
		} catch (error) {
			if (isMissing(error)) return undefined;
			throw error;
		}
	}

	async checksumOfPath(path: string): Promise<string | undefined> {
		const content = await this.readContent(path);
		return content === undefined ? undefined : sha256Hex(content);
	}

	async exists(path: string): Promise<boolean> {
		try {
			await stat(path);
			return true;
		} catch (error) {
			if (isMissing(error)) return false;
			throw error;
		}
	}

	async listVersions(workspaceId: string, artifactId: string): Promise<readonly CanvasStoredFile[]> {
		const dir = this.artifactDir(workspaceId, artifactId);
		let names: string[];
		try {
			names = await readdir(dir);
		} catch (error) {
			if (isMissing(error)) return [];
			throw error;
		}
		const files: CanvasStoredFile[] = [];
		for (const name of names) {
			const parsed = parseCanvasVersionFileName(name);
			if (!parsed) continue;
			const path = join(dir, name);
			const content = await this.readContent(path);
			if (content === undefined) continue;
			files.push({
				workspaceId,
				artifactId,
				version: parsed.version,
				path,
				uri: localPathToArtifactUri(path),
				checksum: sha256Hex(content),
				extension: parsed.extension,
			});
		}
		return files.sort((left, right) => left.version - right.version);
	}

	async listArtifactIds(workspaceId: string): Promise<readonly string[]> {
		const dir = this.workspaceDir(workspaceId);
		try {
			const entries = await readdir(dir, { withFileTypes: true });
			return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
		} catch (error) {
			if (isMissing(error)) return [];
			throw error;
		}
	}

	async removeVersion(workspaceId: string, artifactId: string, version: number): Promise<void> {
		const versions = await this.listVersions(workspaceId, artifactId);
		const match = versions.find((item) => item.version === version);
		if (!match) return;
		try {
			await unlink(match.path);
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
	}

	async removeArtifact(workspaceId: string, artifactId: string): Promise<void> {
		await rm(this.artifactDir(workspaceId, artifactId), { recursive: true, force: true });
	}

	isManagedPath(path: string): boolean {
		const root = this.root.replace(/[\\/]+$/, "");
		const normalized = path.replace(/\\/g, "/");
		const normalizedRoot = root.replace(/\\/g, "/");
		if (process.platform === "win32") {
			return normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`);
		}
		return normalized.startsWith(`${normalizedRoot}/`);
	}

	async ensureRoot(): Promise<void> {
		await mkdir(this.root, { recursive: true });
	}
}

function isMissing(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
