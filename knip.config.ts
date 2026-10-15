/**
 * Knip config for optional dead-code / unused-export reporting.
 *
 * Not part of the required `bun run check` gate yet — monorepo false positives
 * are still being tuned. Use:
 *   bun run deadcode:report   # print findings (knip --no-exit-code)
 *   bun run deadcode          # exit non-zero on findings
 *
 * Scope starts small (core libs with real test surfaces) to keep signal usable.
 *
 * @type {import("knip").KnipConfig}
 */
const config = {
	ignoreWorkspaces: [
		"packages/action-rpc",
		"apps/cli-host",
		"packages/coding-agent/examples/**",
		"apps/desktop",
		"packages/markdown",
		"packages/plugins/**",
		"packages/runtime-*",
		"packages/theme-*",
		"packages/themes/**",
		"packages/toolkit",
		"packages/ui",
	],
	workspaces: {
		".": {
			entry: ["scripts/**/*.{js,mjs,ts}"],
			project: ["scripts/**/*.{js,mjs,ts}"],
			// The root manifest also acts as a Bun workspace hoist/launcher manifest.
			// Dependency ownership is checked in the selected package workspaces below.
			// deepeval/promptfoo 的豁免已删：scripts/eval/** 真实使用，knip 可直接归因。
			// @vetta/coding-agent 保留豁免：根清单的 hoist/launcher 职责（root scripts 无真实 import）。
			ignoreDependencies: [
				"@mariozechner/jiti",
				"@playwright/cli",
				"@radix-ui/react-popover",
				"@radix-ui/react-select",
				"@radix-ui/react-slot",
				"@vetta/cli-host",
				"@vetta/coding-agent",
				"date-fns",
				"get-east-asian-width",
				"koffi",
				"tsx",
			],
		},
		"packages/ai": {
			// scripts/ 是依赖的真实使用面（generate-test-image.ts 用 canvas），
			// 不纳入会让 devDependency 出现 unused 误报。
			entry: ["src/index.ts", "src/cli.ts", "src/reasoning-presets.ts", "scripts/**/*.ts"],
			project: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
		},
		"packages/agent": {
			entry: ["src/index.ts"],
			project: ["src/**/*.ts", "test/**/*.ts"],
		},
		"packages/coding-agent": {
			// package.json#exports 的 24 条子路径全部指向 dist/ 构建产物，knip 无法
			// 自动映射回 src/；这里按 exports 清单逐条列出对应源文件，漏列即整面
			// 被误报 unused files（public-api 曾经整体误报）。
			entry: [
				"src/index.ts",
				"src/public-api/**/*.ts",
				"src/config.ts",
				"src/projects/index.ts",
				"src/extensions/pi-compat/index.ts",
				"src/execution/sandbox/errors.ts",
				"src/host/tool-environment/node/index.ts",
				"src/composition/index.ts",
			],
			project: ["src/**/*.ts", "test/**/*.ts"],
		},
		"apps/mobile": {
			// main 是 expo-router 虚拟模块（expo-router/entry 不是文件），显式以
			// 路由面作 entry，避免 knip 报 entry file not found。
			entry: ["src/app/**/*.{ts,tsx}"],
			project: ["src/**/*.{ts,tsx}", "scripts/**/*.{js,ts}"],
		},
		"packages/ecosystem-adapter": {
			entry: ["src/index.ts", "src/hooks/index.ts", "src/codex/hooks/index.ts", "src/claude-code/hooks/index.ts"],
			project: ["src/**/*.ts", "test/**/*.ts"],
		},
	},
	exclude: ["duplicates"],
	ignoreExportsUsedInFile: true,
};

export default config;
