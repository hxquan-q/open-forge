// Copyright The Open Forge contributors.
/**
 * 自动化任务包安全下载链（TASK-0117）：
 * - HTTPS + 白名单 host
 * - 手动重定向 ≤3，每跳重验
 * - 流式大小上界
 */
import { DESKTOP_BRAND } from "../../shared/desktop-brand.js";

export const AUTOMATION_PACKAGE_MAX_TASK_BYTES = 1 * 1024 * 1024;
export const AUTOMATION_PACKAGE_MAX_AGGREGATE_BYTES = 5 * 1024 * 1024;
export const AUTOMATION_PACKAGE_MAX_REDIRECTS = 3;

const ALLOWED_HOST_SUFFIXES = [
	"github.com",
	"api.github.com",
	"raw.githubusercontent.com",
	"objects.githubusercontent.com",
] as const;

export class AutomationPackageFetchError extends Error {
	constructor(
		readonly code: "url_rejected" | "redirect_limit" | "size_limit" | "http_error" | "network",
		message: string,
	) {
		super(message);
		this.name = "AutomationPackageFetchError";
	}
}

export function assertAutomationPackageDownloadUrl(value: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new AutomationPackageFetchError("url_rejected", "Invalid download URL");
	}
	if (url.protocol !== "https:" || url.username || url.password || url.hash) {
		throw new AutomationPackageFetchError(
			"url_rejected",
			"Download URL must be HTTPS without credentials or fragment",
		);
	}
	const host = url.hostname.toLowerCase();
	const allowed = ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
	if (!allowed) {
		throw new AutomationPackageFetchError("url_rejected", `Host not allowlisted: ${host}`);
	}
	return url;
}

export async function fetchAutomationPackageBounded(
	urlValue: string,
	options: {
		readonly maxBytes: number;
		readonly fetcher?: typeof fetch;
		readonly accept?: string;
		readonly timeoutMs?: number;
	},
): Promise<Buffer> {
	const fetcher = options.fetcher ?? fetch;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
	try {
		let url = assertAutomationPackageDownloadUrl(urlValue);
		let response: Response | undefined;
		for (let redirect = 0; ; redirect += 1) {
			response = await fetcher(url, {
				signal: controller.signal,
				redirect: "manual",
				headers: {
					Accept: options.accept ?? "application/json, text/plain, */*",
					"User-Agent": `${DESKTOP_BRAND.executableName}-Desktop`,
				},
			});
			if (![301, 302, 303, 307, 308].includes(response.status)) break;
			const location = response.headers.get("location");
			if (!location || redirect >= AUTOMATION_PACKAGE_MAX_REDIRECTS) {
				throw new AutomationPackageFetchError("redirect_limit", "Too many redirects or missing Location");
			}
			url = assertAutomationPackageDownloadUrl(new URL(location, url).toString());
		}
		if (!response) {
			throw new AutomationPackageFetchError("network", "No response");
		}
		if (response.url) assertAutomationPackageDownloadUrl(response.url);
		if (!response.ok || !response.body) {
			throw new AutomationPackageFetchError("http_error", `Download failed: HTTP ${response.status}`);
		}
		const contentLength = Number(response.headers.get("content-length"));
		if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
			throw new AutomationPackageFetchError("size_limit", "Content-Length exceeds size limit");
		}
		const chunks: Uint8Array[] = [];
		let total = 0;
		const reader = response.body.getReader();
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;
				total += value.byteLength;
				if (total > options.maxBytes) {
					throw new AutomationPackageFetchError("size_limit", "Stream exceeded size limit");
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
		return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
	} catch (error) {
		if (error instanceof AutomationPackageFetchError) throw error;
		throw new AutomationPackageFetchError("network", error instanceof Error ? error.message : "Download failed");
	} finally {
		clearTimeout(timeout);
	}
}
