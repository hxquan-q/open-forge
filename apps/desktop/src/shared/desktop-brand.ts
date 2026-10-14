// Copyright The Open Forge contributors.
import type { InitOptions, i18n, PostProcessorModule } from "i18next";
import distributionBrandSource from "./desktop-brand.distribution.json";
import selfBrandSource from "./desktop-brand.json";

interface DesktopBrandSource {
	displayName: string;
	/** 可选的按语言展示名（如 zh → 小爱ai）；缺失的语言回退 displayName。 */
	displayNameLocalized?: Record<string, string>;
	executableName: string;
	appshotHelperName: string;
	appshotHelperBundleId: string;
	legacyProductNames: string[];
}

/** 品牌口径档位：distribution = 外部分发（Allstr ai / 小爱ai，默认）；self = 自用（Open Forge，显式选档）。 */
export type DesktopBrandProfile = "self" | "distribution";

/**
 * 构建期常量：由 vite（renderer / main）define 归一化内联，常量折叠后
 * 未选中档案的 JSON 不进产物。运行时环境变量无法切换已发布的口径。
 * 未设置 VETTA_BRAND_PROFILE 时按外部分发档解析；显式 "self" 回到 Open Forge 口径。
 */
export const DESKTOP_BRAND_PROFILE: DesktopBrandProfile =
	process.env.VETTA_BRAND_PROFILE === "self" ? "self" : "distribution";

const desktopBrandSource: DesktopBrandSource =
	DESKTOP_BRAND_PROFILE === "distribution" ? distributionBrandSource : selfBrandSource;

export const DESKTOP_BRAND = Object.freeze({
	displayName: desktopBrandSource.displayName,
	executableName: desktopBrandSource.executableName,
	appshotHelperName: desktopBrandSource.appshotHelperName,
	appshotHelperBundleId: desktopBrandSource.appshotHelperBundleId,
});

/**
 * 当前语言的产品展示名：命中 displayNameLocalized 语言标签（精确或主子标签）时
 * 用本地化名（如 zh → 小爱ai），否则回退 displayName（Allstr ai）。
 */
export function resolveDesktopBrandName(language?: string): string {
	const normalized = language?.toLowerCase() ?? "";
	for (const [tag, name] of Object.entries(desktopBrandSource.displayNameLocalized ?? {})) {
		if (normalized === tag || normalized.startsWith(`${tag}-`) || normalized.startsWith(`${tag}_`)) {
			return name;
		}
	}
	return DESKTOP_BRAND.displayName;
}

export const DESKTOP_BRAND_REPLACEMENTS = Object.freeze(
	desktopBrandSource.legacyProductNames.map((from) => Object.freeze({ from, to: DESKTOP_BRAND.displayName })),
);

function createProductNamePattern(value: string): RegExp {
	const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	// 点号默认排除在边界外（保护 `Vetta.exe`、域名等形态）；句末句号（点号后不是单词字符）
	// 仍算边界，否则「…inside Vetta.」这类句子结尾会漏归一。
	return new RegExp(`(^|[^\\w./@:-])(${escaped})(?=$|[^\\w./@:-]|\\.(?![\\w]))`, "g");
}

const replacementPatterns = DESKTOP_BRAND_REPLACEMENTS.map(({ from }) => ({
	pattern: createProductNamePattern(from),
}));

export function replaceDesktopBrandText(value: string, language?: string): string {
	const to = resolveDesktopBrandName(language);
	return replacementPatterns.reduce(
		(text, { pattern }) => text.replace(pattern, (_match, prefix: string) => `${prefix}${to}`),
		value,
	);
}

const desktopBrandPostProcessor: PostProcessorModule = {
	type: "postProcessor",
	name: "desktopBrand",
	process(value, _key, _options, translator) {
		return replaceDesktopBrandText(value, translator?.language);
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
