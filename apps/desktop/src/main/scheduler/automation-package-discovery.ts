// Copyright The Open Forge contributors.
import {
	AUTOMATION_PACKAGE_CAPABILITIES,
	AUTOMATION_TASK_SCHEMA_VERSION,
	type AutomationPackageV1,
	parseAutomationPackageJson,
	sha256CanonicalJson,
} from "@vetta/coding-agent/runtime";
import {
	AUTOMATION_PACKAGE_MAX_AGGREGATE_BYTES,
	AUTOMATION_PACKAGE_MAX_TASK_BYTES,
	assertAutomationPackageDownloadUrl,
	fetchAutomationPackageBounded,
} from "./automation-package-secure-fetch.js";

/** GitHub topic 约定：公开仓以此标记可发现的自动化任务包。 */
export const AUTOMATION_PACKAGE_DISCOVERY_TOPIC = "openforge-automation-package";

export interface DiscoveredAutomationPackage {
	readonly pkg: AutomationPackageV1;
	readonly contentSha256: string;
	readonly sourceRepository: string;
	readonly sourceUrl: string;
	readonly stars: number;
	readonly updatedAt: string;
}

export interface DiscoverAutomationPackagesOptions {
	readonly fetcher?: typeof fetch;
	readonly topic?: string;
	readonly limit?: number;
}

interface GitHubSearchRepo {
	readonly full_name: string;
	readonly html_url: string;
	readonly stargazers_count: number;
	readonly pushed_at: string;
	readonly default_branch: string;
}

/**
 * 从 GitHub 公开仓按 topic 发现任务包。
 * 远端内容只下载解析，永不自动执行。
 */
export async function discoverAutomationPackages(
	options: DiscoverAutomationPackagesOptions = {},
): Promise<readonly DiscoveredAutomationPackage[]> {
	const fetcher = options.fetcher ?? fetch;
	const topic = options.topic ?? AUTOMATION_PACKAGE_DISCOVERY_TOPIC;
	const limit = options.limit ?? 30;

	const searchUrl = `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(topic)}&sort=updated&order=desc&per_page=${Math.min(limit, 30)}`;
	assertAutomationPackageDownloadUrl(searchUrl);
	const searchBuffer = await fetchAutomationPackageBounded(searchUrl, {
		maxBytes: AUTOMATION_PACKAGE_MAX_AGGREGATE_BYTES,
		fetcher,
		accept: "application/vnd.github+json",
	});
	const searchJson = JSON.parse(searchBuffer.toString("utf8")) as {
		items?: GitHubSearchRepo[];
	};
	const repos = Array.isArray(searchJson.items) ? searchJson.items : [];

	const discovered: DiscoveredAutomationPackage[] = [];
	const seenSha = new Set<string>();

	for (const repo of repos) {
		const candidates = [
			`https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/automation-package.json`,
			`https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/.openforge/automation-package.json`,
			`https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/packages/automation-package.json`,
		];
		for (const url of candidates) {
			try {
				const buffer = await fetchAutomationPackageBounded(url, {
					maxBytes: AUTOMATION_PACKAGE_MAX_TASK_BYTES,
					fetcher,
				});
				const pkg = parseAutomationPackageJson(buffer.toString("utf8"));
				const contentSha256 = sha256CanonicalJson(pkg);
				if (seenSha.has(contentSha256)) continue;
				seenSha.add(contentSha256);
				discovered.push({
					pkg,
					contentSha256,
					sourceRepository: repo.html_url,
					sourceUrl: url,
					stars: repo.stargazers_count,
					updatedAt: repo.pushed_at,
				});
				break;
			} catch {
				// 候选路径不存在或非法时跳过，继续下一候选。
			}
		}
	}

	return discovered.sort((left, right) => {
		if (right.stars !== left.stars) return right.stars - left.stars;
		return right.updatedAt.localeCompare(left.updatedAt);
	});
}

export function hostCapabilities(): readonly string[] {
	return [...AUTOMATION_PACKAGE_CAPABILITIES];
}

export function hostTaskSchemaVersion(): number {
	return AUTOMATION_TASK_SCHEMA_VERSION;
}
