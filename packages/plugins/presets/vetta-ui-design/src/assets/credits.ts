// Copyright The Open Forge contributors.
import type { PluginFsApi } from "@vetta-org/plugin-sdk";
import { atomicWriteFile, withDesignWrite } from "../shared/design-fs";
import { bytesFromBase64, type LocalImage } from "./images";
import { type AssetCandidate, AssetError, assetRef, assetUrl, LICENSE_REVIEW, record } from "./sources";

export const CREDITS_FILE = "CREDITS.json";
const MAX_CREDITS_CHARACTERS = 4_000_000;
export interface AssetCredit extends AssetCandidate {
	file: string;
	sha256: string;
	width: number;
	height: number;
	mime: string;
	importedAt: string;
	transformed: boolean;
}
export interface AssetCredits {
	version: 1;
	assets: AssetCredit[];
}
const ASSET_FILE = /^assets\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:jpg|png|webp)$/;
export function parseCredits(value: unknown): AssetCredits {
	if (!record(value) || value.version !== 1 || !Array.isArray(value.assets) || value.assets.length > 2000)
		throw new AssetError(
			"invalid-credits",
			"CREDITS.json has an unsupported or invalid format. Repair it before importing; it will not be overwritten.",
		);
	const seen = new Set<string>();
	const assets = value.assets.map((entry): AssetCredit => {
		if (!record(entry)) throw new AssetError("invalid-credits", "Invalid asset credit entry.");
		const ref = assetRef(entry);
		if (
			typeof entry.file !== "string" ||
			!ASSET_FILE.test(entry.file) ||
			seen.has(entry.file) ||
			typeof entry.sha256 !== "string" ||
			!/^[0-9a-f]{64}$/.test(entry.sha256) ||
			!record(entry.license)
		)
			throw new AssetError("invalid-credits", "Invalid or duplicate asset path/hash/license in CREDITS.json.");
		seen.add(entry.file);
		const license = entry.license;
		if (
			typeof license.name !== "string" ||
			license.name.length > 1000 ||
			(license.status !== "source-reported" && license.status !== "unknown") ||
			![true, false, null].includes(license.attributionRequired as boolean | null)
		)
			throw new AssetError("invalid-credits", "Invalid license metadata in CREDITS.json.");
		const url =
			license.url === null ? null : assetUrl(license.url, ["creativecommons.org", "www.gnu.org", "www.nasa.gov"]);
		const hosts =
			ref.source === "wikimedia" ? ["upload.wikimedia.org", "thumb.wikimedia.org"] : ["images-assets.nasa.gov"];
		const prefix = ref.source === "wikimedia" ? "/wikipedia/commons/" : `/image/${ref.id}/`;
		if (
			typeof entry.title !== "string" ||
			entry.title.length > 1000 ||
			typeof entry.author !== "string" ||
			entry.author.length > 1000 ||
			typeof entry.importedAt !== "string" ||
			!Number.isFinite(Date.parse(entry.importedAt)) ||
			typeof entry.transformed !== "boolean" ||
			typeof entry.mime !== "string" ||
			!["image/png", "image/jpeg", "image/webp"].includes(entry.mime) ||
			!Number.isInteger(entry.width) ||
			!Number.isInteger(entry.height) ||
			Number(entry.width) < 1 ||
			Number(entry.height) < 1 ||
			Number(entry.width) > 16384 ||
			Number(entry.height) > 16384
		)
			throw new AssetError("invalid-credits", "Invalid asset metadata in CREDITS.json.");
		return {
			...ref,
			file: entry.file,
			sha256: entry.sha256,
			title: entry.title,
			author: entry.author,
			pageUrl: assetUrl(entry.pageUrl, ref.source === "wikimedia" ? ["commons.wikimedia.org"] : ["images.nasa.gov"]),
			originalUrl: assetUrl(entry.originalUrl, hosts, prefix),
			downloadUrl: assetUrl(entry.downloadUrl, hosts, prefix),
			previewUrl: assetUrl(entry.previewUrl, hosts, prefix),
			license: {
				name: license.name,
				url,
				status: license.status,
				attributionRequired: license.attributionRequired as boolean | null,
			},
			width: Number(entry.width),
			height: Number(entry.height),
			mime: entry.mime,
			importedAt: entry.importedAt,
			transformed: entry.transformed,
		};
	});
	return { version: 1, assets };
}
export async function readCredits(fs: PluginFsApi, dir: string): Promise<AssetCredits> {
	if ((await fs.stat(`${dir}/${CREDITS_FILE}`)) === null) return { version: 1, assets: [] };
	const { content } = await fs.readFile(`${dir}/${CREDITS_FILE}`);
	if (content.length > MAX_CREDITS_CHARACTERS) throw new AssetError("invalid-credits", "CREDITS.json is too large.");
	try {
		return parseCredits(JSON.parse(content) as unknown);
	} catch (error) {
		if (error instanceof AssetError) throw error;
		throw new AssetError("invalid-credits", "CREDITS.json is not valid JSON. It was not modified.");
	}
}
export function creditWarnings(credits: AssetCredits): string[] {
	return credits.assets.map(
		(asset) =>
			`${asset.file}: ${asset.license.name}; ${asset.license.attributionRequired === false ? "check reuse restrictions" : "retain author and source attribution"}. ${LICENSE_REVIEW}`,
	);
}
export async function saveAsset(
	fs: PluginFsApi,
	dir: string,
	candidate: AssetCandidate,
	image: LocalImage,
): Promise<AssetCredit> {
	const sha256 = Array.from(
		new Uint8Array(await crypto.subtle.digest("SHA-256", bytesFromBase64(image.base64) as BufferSource)),
		(v) => v.toString(16).padStart(2, "0"),
	).join("");
	return withDesignWrite(dir, async () => {
		const credits = await readCredits(fs, dir);
		if (credits.assets.length >= 2000)
			throw new AssetError("asset-limit", "This design has reached its 2000 imported-image limit.");
		let file = "";
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const next = `assets/${candidate.source}-${crypto.randomUUID()}.${image.extension}`;
			if ((await fs.stat(`${dir}/${next}`)) === null) {
				file = next;
				break;
			}
		}
		if (!file)
			throw new AssetError(
				"asset-conflict",
				"Could not allocate a new asset name. Existing files were not overwritten.",
			);
		const asset: AssetCredit = {
			...candidate,
			file,
			sha256,
			width: image.width,
			height: image.height,
			mime: image.mime,
			importedAt: new Date().toISOString(),
			transformed: image.transformed,
		};
		const serialized = `${JSON.stringify({ version: 1, assets: [...credits.assets, asset] }, null, "\t")}\n`;
		if (serialized.length > MAX_CREDITS_CHARACTERS)
			throw new AssetError("credits-limit", "The credits size limit would be exceeded; no new image was saved.");
		await atomicWriteFile(fs, `${dir}/${file}`, image.base64, "base64");
		try {
			await atomicWriteFile(fs, `${dir}/${CREDITS_FILE}`, serialized);
		} catch (error) {
			try {
				await fs.delete(`${dir}/${file}`);
			} catch {
				throw new AssetError(
					"cleanup-required",
					`Credits could not be saved and cleanup failed for ${file}. Remove this uncredited new file before retrying.`,
				);
			}
			throw error;
		}
		return asset;
	});
}
