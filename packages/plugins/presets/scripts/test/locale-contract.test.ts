// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const componentFiles = ["../src/components/ScriptsPanel.tsx", "../src/components/ProjectCard.tsx"];
const componentSources = componentFiles.map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const referencedKeys = [
	...new Set(
		componentSources.flatMap((source) =>
			[...source.matchAll(/\bt\(\s*["']([^"']+)["']/gu)].map((match) => match[1]),
		),
	),
];
const locales = Object.fromEntries(
	["en", "zh"].map((locale) => [
		locale,
		JSON.parse(readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), "utf8")) as Record<string, string>,
	]),
);

it("defines every literal translation key used by the Scripts panel in both locales", () => {
	for (const [locale, messages] of Object.entries(locales)) {
		expect(referencedKeys.filter((key) => !Object.hasOwn(messages, key)), `${locale} missing keys`).toEqual([]);
	}
});

it("matches summary placeholders to the interpolation arguments at the call site", () => {
	const panelSource = componentSources[0] ?? "";
	const summaryCall = panelSource.match(/t\("summary",\s*\{([\s\S]*?)\}\)/u);
	expect(summaryCall, "summary interpolation call").not.toBeNull();
	const argumentNames = [...(summaryCall?.[1] ?? "").matchAll(/\b([A-Za-z_$][\w$]*)\s*:/gu)]
		.map((match) => match[1])
		.sort();

	for (const [locale, messages] of Object.entries(locales)) {
		const placeholders = [...(messages.summary ?? "").matchAll(/\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}/gu)]
			.map((match) => match[1])
			.sort();
		expect(placeholders, `${locale} summary placeholders`).toEqual(argumentNames);
	}
});
