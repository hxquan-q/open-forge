// Copyright The Open Forge contributors.
import type { InitOptions, i18n, PostProcessorModule } from "i18next";
import desktopBrandSource from "./desktop-brand.json";

export const DESKTOP_BRAND = Object.freeze({
	displayName: desktopBrandSource.displayName,
	executableName: desktopBrandSource.executableName,
	appshotHelperName: desktopBrandSource.appshotHelperName,
	appshotHelperBundleId: desktopBrandSource.appshotHelperBundleId,
});

export const DESKTOP_BRAND_REPLACEMENTS = Object.freeze(
	desktopBrandSource.legacyProductNames.map((from) => Object.freeze({ from, to: DESKTOP_BRAND.displayName })),
);

function createProductNamePattern(value: string): RegExp {
	const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|[^\\w./@:-])(${escaped})(?=$|[^\\w./@:-])`, "g");
}

const replacementPatterns = DESKTOP_BRAND_REPLACEMENTS.map(({ from, to }) => ({
	pattern: createProductNamePattern(from),
	to,
}));

export function replaceDesktopBrandText(value: string): string {
	return replacementPatterns.reduce(
		(text, { pattern, to }) => text.replace(pattern, (_match, prefix: string) => `${prefix}${to}`),
		value,
	);
}

const desktopBrandPostProcessor: PostProcessorModule = {
	type: "postProcessor",
	name: "desktopBrand",
	process(value) {
		return replaceDesktopBrandText(value);
	},
};

export function initDesktopI18n(instance: i18n, options: InitOptions) {
	const configuredPostProcess = options.postProcess;
	const postProcess =
		configuredPostProcess === false || configuredPostProcess === undefined
			? []
			: typeof configuredPostProcess === "string"
				? [configuredPostProcess]
				: configuredPostProcess;

	return instance.use(desktopBrandPostProcessor).init({
		...options,
		postProcess: [...new Set([...postProcess, desktopBrandPostProcessor.name])],
	});
}
