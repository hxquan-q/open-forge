// Copyright The Open Forge contributors.
import { waitForCommittedPaint } from "@shared/lib/committed-paint";
import { fontFamily, normalizeFontFamily } from "@shared/theme/fonts";

export interface InstalledFont {
	family: string;
	monospace: boolean;
}

export function supportsLocalFonts(): boolean {
	return "queryLocalFonts" in window && typeof window.queryLocalFonts === "function";
}

/** Read metadata only. The browser permission request must retain the user's activation. */
async function queryFonts(signal: AbortSignal): Promise<unknown> {
	if (!("queryLocalFonts" in window) || typeof window.queryLocalFonts !== "function") throw Error("unavailable");
	const query = window.queryLocalFonts.bind(window);
	let timer: number | undefined;
	let abort: (() => void) | undefined;
	try {
		return await new Promise<unknown>((resolve, reject) => {
			abort = () => reject(new DOMException("Aborted", "AbortError"));
			timer = window.setTimeout(() => reject(Error("Font query timed out")), 15000);
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) abort();
			else Promise.resolve(query()).then(resolve, reject);
		});
	} finally {
		window.clearTimeout(timer);
		if (abort) signal.removeEventListener("abort", abort);
	}
}

export async function readInstalledFonts(signal: AbortSignal): Promise<InstalledFont[]> {
	const result = await queryFonts(signal);
	if (!Array.isArray(result) || result.length > 50000) throw Error("Invalid font list");
	const names = new Set<string>();
	for (const item of result) {
		if (typeof item !== "object" || item === null || !("family" in item)) continue;
		const family = normalizeFontFamily(item.family);
		if (family) names.add(family);
	}
	// Enumeration needs activation; the subsequent glyph measurements do not.
	await waitForCommittedPaint();
	signal.throwIfAborted();
	const context = document.createElement("canvas").getContext("2d");
	if (!context) throw Error("Font measurement unavailable");
	const fonts: InstalledFont[] = [];
	for (const family of [...names].sort((a, b) => a.localeCompare(b))) {
		signal.throwIfAborted();
		context.font = `16px ${fontFamily(family, "monospace")}`;
		const widths = ["iiiiiiii", "WWWWWWWW", "00000000", "........"].map((text) => context.measureText(text).width);
		const monospace = widths.every(
			(width) => Number.isFinite(width) && width > 0 && Math.abs(width - widths[0]) < 0.1,
		);
		fonts.push({ family, monospace });
		if (fonts.length % 32 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
	}
	return fonts;
}
