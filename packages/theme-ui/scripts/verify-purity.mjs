/**
 * Structural guard: theme-ui sources must stay free of desktop private imports.
 * Run: bun packages/theme-ui/scripts/verify-purity.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const forbidden = /@shared\/|@domains\/|@preload\/|from ["']jotai|window\.vetta/;

async function walk(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) files.push(...(await walk(full)));
		else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
	}
	return files;
}

const requiredExports = [
	"SceneCard",
	"SkillCard",
	"DefaultSceneCarousel",
	"DefaultSkillBadgeRow",
	"InputBarToolbarButton",
	"InputBarCapsule",
	"InputBarPlaceholder",
	"NewSessionBackground",
	"SendButton",
	"DrawerCard",
	"TodoCard",
	"SandboxPermissionCard",
	"ActivityPanelFrame",
	"CodePreview",
	"KnowledgeFilesSkeleton",
	"SkillToggleSwitch",
	"AddProjectMenuItem",
	"SelectField",
	"AchievementTitle",
	"AchievementCurtains",
	"AchievementPromotionConfetti",
	"MacKeyboardPreview",
	"CodeBlockCopyButtonView",
	"MultiplierTag",
	"SyntaxHighlightedCode",
	"PreviewErrorBoundary",
];

const files = await walk(root);
const violations = [];

/**
 * 重型依赖只能经动态 import() 进入渲染进程：实现文件可以静态引用该依赖，
 * 但任何其它文件（含 barrel）不得对实现文件做静态 value import/export，
 * 否则重依赖会回到首屏静态图。`export type` / `import type` 在编译期擦除，不
 * 构成运行时边。
 */
const lazyHeavyDeps = [
	{
		impl: "settings/achievements/AchievementPromotionBadge3D.tsx",
		implSpecifier: /["']\.\/AchievementPromotionBadge3D["']/,
		depPattern: /from\s+["']three["']/,
	},
];

for (const file of files) {
	const text = await readFile(file, "utf8");
	const rel = path.relative(root, file).split(path.sep).join("/");
	if (forbidden.test(text)) {
		violations.push(rel);
	}
	for (const { impl, implSpecifier, depPattern } of lazyHeavyDeps) {
		if (depPattern.test(text) && rel !== impl) {
			violations.push(`${rel} (statically imports a lazy-only dependency)`);
		}
		if (rel === impl || rel.includes(".test.")) continue;
		const staticallyReferencesImpl = text
			.split("\n")
			.some(
				(line) =>
					implSpecifier.test(line)
					&& /^\s*(import|export)\b/.test(line)
					&& !/^\s*(import|export)\s+type\b/.test(line)
					&& !/\bimport\s*\(/.test(line),
			);
		if (staticallyReferencesImpl) {
			violations.push(`${rel} (statically references lazy-only impl ${impl})`);
		}
	}
}

const indexFiles = {
	chat: await readFile(path.join(root, "chat/index.ts"), "utf8"),
	activity: await readFile(path.join(root, "activity/index.ts"), "utf8"),
	knowledge: await readFile(path.join(root, "knowledge/index.ts"), "utf8"),
	skills: await readFile(path.join(root, "skills/index.ts"), "utf8"),
	sidebar: await readFile(path.join(root, "sidebar/index.ts"), "utf8"),
	settings: await readFile(path.join(root, "settings/index.ts"), "utf8"),
	shared: await readFile(path.join(root, "shared/index.ts"), "utf8"),
	"file-preview": await readFile(path.join(root, "file-preview/index.ts"), "utf8"),
};
const exportHome = {
	ActivityPanelFrame: "activity",
	CodePreview: "activity",
	KnowledgeFilesSkeleton: "knowledge",
	SkillToggleSwitch: "skills",
	AddProjectMenuItem: "sidebar",
	SelectField: "settings",
	AchievementTitle: "settings",
	AchievementCurtains: "settings",
	AchievementPromotionConfetti: "settings",
	MacKeyboardPreview: "shared",
	CodeBlockCopyButtonView: "shared",
	MultiplierTag: "shared",
	SyntaxHighlightedCode: "shared",
	PreviewErrorBoundary: "file-preview",
};
const missing = requiredExports.filter((name) => {
	const home = exportHome[name] ?? "chat";
	return !indexFiles[home].includes(name);
});

if (violations.length > 0 || missing.length > 0) {
	console.error("theme-ui purity verify FAILED");
	if (violations.length) console.error("forbidden imports:\n", violations.join("\n"));
	if (missing.length) console.error("missing exports:\n", missing.join("\n"));
	process.exit(1);
}

console.log(`theme-ui purity OK: ${files.length} files, exports present`);
