// Copyright The Open Forge contributors.

/**
 * research-evidence 产物的来源复查（TASK-0025）。
 *
 * 读取产物正文里的 vetta-research-sources 引用清单，逐项 stat 比对指纹，
 * 返回 缺失/已变更 的可恢复状态供 Work 面板标注。复查不产生任何写入；
 * 无清单的旧产物返回 no-manifest 而不是误报。
 */

import { basename } from "node:path";
import { parseResearchSourcesManifest } from "@vetta/coding-agent/function-extensions";
import { checkLocalSources } from "@vetta/runtime-knowledge";
import { desktopTaskActivityService } from "./task-activity-service.js";

export interface DesktopArtifactSourceCheck {
	readonly uri: string;
	readonly path: string;
	readonly name: string;
	readonly status: "ok" | "missing" | "changed";
}

export type DesktopArtifactSourcesVerifyResult =
	| { readonly status: "ok"; readonly sources: readonly DesktopArtifactSourceCheck[] }
	| { readonly status: "no-manifest" | "not-found" | "source-missing" };

/** 纯内容层：manifest → 逐源 stat。单独可测，不依赖 Task Service 单例。 */
export async function verifyResearchSourcesFromContent(content: string): Promise<DesktopArtifactSourcesVerifyResult> {
	const manifest = parseResearchSourcesManifest(content);
	if (!manifest || manifest.sources.length === 0) return { status: "no-manifest" };
	const checks = await checkLocalSources(manifest.sources);
	return {
		status: "ok",
		sources: checks.map((check, index) => ({
			uri: check.uri,
			path: check.path,
			name: manifest.sources[index]?.name ?? basename(check.path),
			status: check.status,
		})),
	};
}

export async function verifyArtifactResearchSources(
	sessionId: string,
	artifactId: string,
): Promise<DesktopArtifactSourcesVerifyResult> {
	const read = await desktopTaskActivityService.readArtifact(sessionId, artifactId);
	if (read.status !== "ok") return { status: read.status };
	return verifyResearchSourcesFromContent(read.content);
}
