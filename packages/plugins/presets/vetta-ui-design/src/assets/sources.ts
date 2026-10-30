// Copyright The Open Forge contributors.
import type { PluginNetworkApi } from "@vetta-org/plugin-sdk";

export const ASSET_SOURCES = ["wikimedia", "nasa"] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];
export const ASSET_HOSTS = [
	"commons.wikimedia.org",
	"upload.wikimedia.org",
	"thumb.wikimedia.org",
	"images-api.nasa.gov",
	"images-assets.nasa.gov",
] as const;
export const MAX_CANDIDATES = 6;
export const LICENSE_REVIEW =
	"Source metadata is not legal clearance. Check the original page, attribution, share-alike, trademarks and identifiable-person restrictions before publishing.";

export class AssetError extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}
export function isAssetCancellation(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(Reflect.get(error, "name") === "AbortError" ||
			Reflect.get(error, "reason") === "cancelled" ||
			Reflect.get(error, "code") === "cancelled")
	);
}
export function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, fallback = ""): string {
	return typeof value === "string"
		? value
				.replace(/<[^>]*>/g, "")
				.replace(/[\u0000-\u001f]/g, " ")
				.trim()
				.slice(0, 1000)
		: fallback;
}
export function assetSource(value: unknown): AssetSource {
	if (value === "wikimedia" || value === "nasa") return value;
	throw new AssetError(
		"unsupported-source",
		"Supported sources: wikimedia, nasa. Openverse/Unsplash and arbitrary sites are not enabled; do not substitute an arbitrary URL.",
	);
}
export interface AssetRef {
	source: AssetSource;
	id: string;
}
export function assetRef(value: unknown): AssetRef {
	if (!record(value))
		throw new AssetError("invalid-reference", "Pass a source and the exact candidate id returned by search.");
	const source = assetSource(value.source);
	const id = value.id;
	if (
		typeof id !== "string" ||
		id.length > 240 ||
		(source === "wikimedia"
			? !/^File:[^\u0000-\u001f|#?\\]+\.(?:jpe?g|png)$/i.test(id)
			: !/^[a-zA-Z0-9_-]{1,160}$/.test(id))
	) {
		throw new AssetError(
			"invalid-reference",
			"Invalid image reference; use a JPEG/PNG candidate id from search, not a URL or path.",
		);
	}
	return { source, id };
}

/** No suffix matching, user credentials, custom ports, local/IP targets or arbitrary CDN paths. */
export function assetUrl(value: unknown, hosts: readonly string[], pathPrefix?: string): string {
	if (typeof value !== "string" || value.length > 4096)
		throw new AssetError("unsafe-url", "Missing or invalid source URL.");
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new AssetError("unsafe-url", "Invalid source URL.");
	}
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.port ||
		!hosts.includes(url.hostname) ||
		(pathPrefix && !url.pathname.startsWith(pathPrefix))
	) {
		throw new AssetError("unsafe-url", "Source URL is outside the declared HTTPS source policy.");
	}
	return url.href;
}
export interface AssetLicense {
	name: string;
	url: string | null;
	status: "source-reported" | "unknown";
	attributionRequired: boolean | null;
}
export interface AssetCandidate extends AssetRef {
	title: string;
	author: string;
	pageUrl: string;
	originalUrl: string;
	downloadUrl: string;
	previewUrl: string;
	license: AssetLicense;
}
function metadata(meta: unknown, key: string): string {
	return record(meta) && record(meta[key]) ? text(meta[key].value) : "";
}
function parseCommons(value: unknown): AssetCandidate {
	if (!record(value) || !Array.isArray(value.imageinfo) || !record(value.imageinfo[0]))
		throw new AssetError("invalid-source-data", "Missing Commons image information.");
	const ref = assetRef({ source: "wikimedia", id: value.title });
	const info = value.imageinfo[0];
	if (info.mime !== "image/jpeg" && info.mime !== "image/png")
		throw new AssetError("unsupported-image", "Only JPEG and PNG photographs are supported in this release.");
	const originalUrl = assetUrl(info.url, ["upload.wikimedia.org"], "/wikipedia/commons/");
	const thumbnail = info.thumburl
		? assetUrl(info.thumburl, ["upload.wikimedia.org", "thumb.wikimedia.org"], "/wikipedia/commons/")
		: originalUrl;
	const name = metadata(info.extmetadata, "LicenseShortName");
	const rawLicenseUrl = metadata(info.extmetadata, "LicenseUrl");
	let licenseUrl: string | null = null;
	if (rawLicenseUrl) {
		try {
			licenseUrl = assetUrl(rawLicenseUrl, ["creativecommons.org", "www.gnu.org"]);
		} catch {
			/* Unknown license links stay unverified, never fetched. */
		}
	}
	const attribution = metadata(info.extmetadata, "AttributionRequired");
	return {
		...ref,
		title: metadata(info.extmetadata, "ObjectName") || text(value.title),
		author: metadata(info.extmetadata, "Artist") || "Unknown author",
		pageUrl: assetUrl(info.descriptionurl, ["commons.wikimedia.org"], "/wiki/File:"),
		originalUrl,
		downloadUrl: thumbnail,
		previewUrl: thumbnail,
		license: {
			name: name || "Unknown license",
			url: licenseUrl,
			status: name && licenseUrl ? "source-reported" : "unknown",
			attributionRequired: attribution === "true" ? true : attribution === "false" ? false : null,
		},
	};
}
function parseNasa(value: unknown): AssetCandidate {
	if (!record(value) || !Array.isArray(value.data) || !record(value.data[0]) || !Array.isArray(value.links))
		throw new AssetError("invalid-source-data", "Missing NASA image information.");
	const data = value.data[0];
	if (data.media_type !== "image") throw new AssetError("unsupported-image", "NASA result is not an image.");
	const ref = assetRef({ source: "nasa", id: data.nasa_id });
	const links = value.links.filter(record);
	const preview = links.find((link) => link.rel === "preview");
	const medium = links.find((link) => typeof link.href === "string" && /~medium\.(?:jpg|png)$/i.test(link.href));
	const original = links.find((link) => link.rel === "canonical") ?? medium ?? preview;
	const prefix = `/image/${ref.id}/`;
	return {
		...ref,
		title: text(data.title, ref.id),
		author: text(data.photographer || data.secondary_creator || data.center, "NASA (check third-party credit)"),
		pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(ref.id)}`,
		originalUrl: assetUrl(original?.href, ["images-assets.nasa.gov"], prefix),
		downloadUrl: assetUrl((medium ?? preview ?? original)?.href, ["images-assets.nasa.gov"], prefix),
		previewUrl: assetUrl((preview ?? medium ?? original)?.href, ["images-assets.nasa.gov"], prefix),
		// The API gives no per-image copyright clearance; NASA also distributes third-party material.
		license: {
			name: "NASA media usage guidelines — individual rights unverified",
			url: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
			status: "unknown",
			attributionRequired: true,
		},
	};
}
export function parseAssetResults(
	source: AssetSource,
	body: unknown,
): { candidates: AssetCandidate[]; rejected: number } {
	let items: unknown[];
	if (source === "wikimedia" && record(body) && record(body.query)) {
		const pages = body.query.pages;
		if (!Array.isArray(pages) && !record(pages))
			throw new AssetError("invalid-source-data", "Commons response has no pages.");
		items = Array.isArray(pages) ? pages : Object.values(pages);
	} else if (
		source === "wikimedia" &&
		record(body) &&
		body.batchcomplete !== undefined &&
		!body.query &&
		!body.error
	) {
		items = [];
	} else if (source === "nasa" && record(body) && record(body.collection) && Array.isArray(body.collection.items)) {
		items = body.collection.items;
	} else
		throw new AssetError(
			"invalid-source-data",
			"Source response has an unexpected structure. Retry or select the other source.",
		);
	const candidates: AssetCandidate[] = [];
	let rejected = 0;
	for (const item of items.slice(0, MAX_CANDIDATES)) {
		try {
			candidates.push(source === "wikimedia" ? parseCommons(item) : parseNasa(item));
		} catch {
			rejected += 1;
		}
	}
	return { candidates, rejected };
}
async function querySource(network: PluginNetworkApi, source: AssetSource, params: URLSearchParams): Promise<unknown> {
	const root =
		source === "wikimedia" ? "https://commons.wikimedia.org/w/api.php" : "https://images-api.nasa.gov/search";
	const response = await network.request<unknown>({
		url: `${root}?${params}`,
		responseType: "json",
		timeoutMs: 15_000,
	});
	if (!response.ok)
		throw new AssetError(
			"source-unavailable",
			`Image source returned HTTP ${response.status}; retry or use the other source.`,
		);
	if (JSON.stringify(response.body)?.length > 2_000_000)
		throw new AssetError("source-too-large", "Image source returned too much metadata.");
	return response.body;
}
function commonsParams(width: number): URLSearchParams {
	return new URLSearchParams({
		action: "query",
		format: "json",
		formatversion: "2",
		prop: "imageinfo",
		iiprop: "url|extmetadata|mime|size",
		iiurlwidth: String(width),
	});
}
export async function searchAssets(network: PluginNetworkApi, source: AssetSource, query: unknown) {
	if (typeof query !== "string" || !query.trim() || query.length > 200 || /[\u0000-\u001f]/.test(query))
		throw new AssetError("invalid-query", "Pass a search query of 1–200 characters.");
	const params =
		source === "wikimedia"
			? commonsParams(640)
			: new URLSearchParams({ q: query.trim(), media_type: "image", page_size: String(MAX_CANDIDATES) });
	if (source === "wikimedia") {
		params.set("generator", "search");
		params.set("gsrsearch", query.trim());
		params.set("gsrnamespace", "6");
		params.set("gsrlimit", String(MAX_CANDIDATES));
	}
	return parseAssetResults(source, await querySource(network, source, params));
}
/** Re-resolve a source id at import, never trust model-supplied download URLs or credit text. */
export async function resolveAsset(network: PluginNetworkApi, ref: AssetRef, preview = false): Promise<AssetCandidate> {
	const params =
		ref.source === "wikimedia"
			? commonsParams(preview ? 640 : 2048)
			: new URLSearchParams({ nasa_id: ref.id, media_type: "image", page_size: String(MAX_CANDIDATES) });
	if (ref.source === "wikimedia") params.set("titles", ref.id);
	const { candidates } = parseAssetResults(ref.source, await querySource(network, ref.source, params));
	const candidate = candidates.find((item) => item.id === ref.id);
	if (!candidate)
		throw new AssetError(
			"asset-unavailable",
			"The source no longer has this supported image. Search again; no asset was written.",
		);
	return candidate;
}
