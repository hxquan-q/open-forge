// Copyright The Open Forge contributors.

/**
 * Canvas artifact 版本闸门（PLAN-0006 / ADR-0129）。
 * Agent `update` 在 baseVersion 落后或磁盘 checksum 与 descriptor 不一致时
 * 一律 `stale_version`，禁止覆盖写历史。外部修改走另一条「导入为新版本」路径。
 */

export interface ArtifactVersionState {
	readonly version: number;
	readonly checksum?: string;
}

export type ArtifactUpdateDecision =
	| { readonly kind: "accept"; readonly nextVersion: number }
	| { readonly kind: "stale_version"; readonly currentVersion: number };

export function nextArtifactVersion(currentVersion: number): number {
	return currentVersion + 1;
}

export function decideArtifactUpdate(input: {
	readonly current: ArtifactVersionState;
	readonly baseVersion: number;
	readonly currentFileChecksum?: string;
}): ArtifactUpdateDecision {
	if (input.baseVersion !== input.current.version) {
		return { kind: "stale_version", currentVersion: input.current.version };
	}
	if (
		input.current.checksum !== undefined &&
		input.currentFileChecksum !== undefined &&
		input.current.checksum !== input.currentFileChecksum
	) {
		return { kind: "stale_version", currentVersion: input.current.version };
	}
	return { kind: "accept", nextVersion: nextArtifactVersion(input.current.version) };
}

export function isExternalArtifactUpdate(status: string | undefined): boolean {
	return status === "modified";
}
