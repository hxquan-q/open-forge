// Modified by The Open Forge contributors.
import path, { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import ts from "typescript";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { createSentryBuildSetup, readValue } from "./sentry-vite";
import {
	resolveSpeechInputBuildConfig,
	SPEECH_INPUT_ENABLED_ENV,
} from "./scripts/speech-input-build-config.js";

function themeDevelopmentReload(): Plugin {
	const themeSourceDir = resolve(__dirname, "../../packages/themes/builtin/xianxia/src");
	return {
		name: "vetta-theme-development-reload",
		configureServer(server) {
			const reloadRenderer = (file: string): void => {
				const relativePath = path.relative(themeSourceDir, file);
				if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return;
				server.ws.send({ type: "full-reload" });
			};
			server.watcher.add(themeSourceDir);
			server.watcher.on("add", reloadRenderer);
			server.watcher.on("change", reloadRenderer);
			server.watcher.on("unlink", reloadRenderer);
			server.httpServer?.once("close", () => {
				server.watcher.off("add", reloadRenderer);
				server.watcher.off("change", reloadRenderer);
				server.watcher.off("unlink", reloadRenderer);
			});
		},
	};
}

function hostApiAccessTransform(): Plugin {
	const rendererRoot = path.resolve(__dirname, "src/renderer").replaceAll("\\", "/");
	const hostApiModule = `${rendererRoot}/shared/host-api.ts`;
	return {
		name: "vetta-host-api-access",
		enforce: "pre",
		transform(code, id) {
			const cleanId = id.split("?", 1)[0]?.replaceAll("\\", "/");
			if (!cleanId?.startsWith(`${rendererRoot}/`) || cleanId === hostApiModule || !/\.tsx?$/.test(cleanId)) {
				return null;
			}

			const scriptKind = cleanId.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
			const sourceFile = ts.createSourceFile(cleanId, code, ts.ScriptTarget.Latest, true, scriptKind);
			const replacements: Array<{ start: number; end: number }> = [];
			const visit = (node: ts.Node): void => {
				if (
					ts.isPropertyAccessExpression(node) &&
					node.name.text === "vetta" &&
					ts.isIdentifier(node.expression) &&
					node.expression.text === "window"
				) {
					replacements.push({ start: node.getStart(sourceFile), end: node.getEnd() });
				}
				ts.forEachChild(node, visit);
			};
			visit(sourceFile);
			if (replacements.length === 0) return null;

			let transformed = code;
			for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
				transformed = `${transformed.slice(0, replacement.start)}__vettaHostApi${transformed.slice(replacement.end)}`;
			}
			return {
				code: `import { hostApi as __vettaHostApi } from "@shared/host-api";\n${transformed}`,
				map: null,
			};
		},
	};
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "VETTA_");
	for (const [key, value] of Object.entries(process.env)) {
		if (key.startsWith("VETTA_") && value !== undefined) env[key] = value;
	}
	const speechInputBuildConfig = resolveSpeechInputBuildConfig({ env });
	const themeDevelopmentEnabled =
		(process.env.VETTA_THEME_DEV_SERVER ?? env.VETTA_THEME_DEV_SERVER) === "1";
	const rawDevServerPort = process.env.VETTA_DESKTOP_DEV_PORT ?? env.VETTA_DESKTOP_DEV_PORT ?? "3020";
	const devServerPort = Number(rawDevServerPort);
	if (!Number.isInteger(devServerPort) || devServerPort < 1 || devServerPort > 65_535) {
		throw new Error(`Invalid VETTA_DESKTOP_DEV_PORT: ${rawDevServerPort}`);
	}
	// 外观「界面主题」区段：默认隐藏；VETTA_SHOW_UI_THEME=true 时展示（shell > .env）
	const showUiTheme = process.env.VETTA_SHOW_UI_THEME ?? env.VETTA_SHOW_UI_THEME ?? "";
	const sentry = createSentryBuildSetup(env, "dist/renderer");

	// 品牌口径构建期开关：distribution（默认，外部分发 Allstr ai / 小爱ai）| self（显式，Open Forge 自用）。
	// 档案常量折叠后未选中的品牌 JSON 与图标资产不进产物（desktop-brand.ts / brand-assets.ts）。
	const brandProfile = env.VETTA_BRAND_PROFILE === "self" ? "self" : "distribution";

	return {
		define: {
			"process.env.VETTA_SHOW_UI_THEME": JSON.stringify(showUiTheme),
			// 云服务构建期开关：默认 false（lite）；只有 VETTA_CLOUD_ENABLED=true 才产出完全体。
			// cloud 分支经常量折叠被整体裁掉（含动态 import 的 chunk）。
			"process.env.VETTA_CLOUD_ENABLED": JSON.stringify(
				(process.env.VETTA_CLOUD_ENABLED ?? env.VETTA_CLOUD_ENABLED) === "true" ? "true" : "false",
			),
			"process.env.VETTA_BRAND_PROFILE": JSON.stringify(brandProfile),
			[`process.env.${SPEECH_INPUT_ENABLED_ENV}`]: JSON.stringify(String(speechInputBuildConfig.enabled)),
			"process.env.VETTA_SENTRY_ENABLED": JSON.stringify(
				readValue(env, "VETTA_SENTRY_DSN") ? "true" : "false",
			),
			"process.env.VETTA_POSTHOG_KEY": JSON.stringify(readValue(env, "VETTA_POSTHOG_KEY") ?? ""),
			"process.env.VETTA_POSTHOG_HOST": JSON.stringify(readValue(env, "VETTA_POSTHOG_HOST") ?? ""),
			"process.env.VETTA_POSTHOG_REPLAY_ENABLED": JSON.stringify(
				readValue(env, "VETTA_POSTHOG_REPLAY_ENABLED") ?? "",
			),
			"process.env.VETTA_POSTHOG_REPLAY_SAMPLE_RATE": JSON.stringify(
				readValue(env, "VETTA_POSTHOG_REPLAY_SAMPLE_RATE") ?? "",
			),
		},
		plugins: [
			hostApiAccessTransform(),
			react(),
			tailwindcss(),
			...(themeDevelopmentEnabled ? [themeDevelopmentReload()] : []),
			...sentry.plugins,
		],
		root: "src/renderer",
		base: "./",
		resolve: {
			// 字符串 alias 是前缀替换：`@vetta-org/ui` 直接指向 index.ts 时，
			// 子路径 `@vetta-org/ui/utils` 会被拼成 `index.ts/utils` 而解析失败。
			// 因此子路径单独映射到目录，再回落到包入口。
			alias: [
				{ find: "@shared", replacement: path.resolve(__dirname, "./src/renderer/shared") },
				{ find: "@domains", replacement: path.resolve(__dirname, "./src/renderer/domains") },
				{ find: "@cloud", replacement: path.resolve(__dirname, "./src/renderer/cloud") },
				{
					find: "@vetta-org/theme-sdk",
					replacement: path.resolve(__dirname, "../../packages/theme-sdk/src"),
				},
				{
					find: "@vetta-org/theme-ui",
					replacement: path.resolve(__dirname, "../../packages/theme-ui/src"),
				},
				{
					find: /^@vetta-org\/ui\/(.+)$/,
					replacement: `${path.resolve(__dirname, "../../packages/ui/src")}/$1`,
				},
				{ find: /^@vetta-org\/ui$/, replacement: path.resolve(__dirname, "../../packages/ui/src/index.ts") },
				{
					find: "@vetta/remote-desktop",
					replacement: path.resolve(__dirname, "../../packages/remote-desktop/src/index.ts"),
				},
				{ find: "@", replacement: path.resolve(__dirname, "./src") },
			],
		},
		worker: {
			format: "es",
		},
		build: {
			outDir: resolve(process.cwd(), "dist/renderer"),
			// 打包布局整目录拷贝 dist/renderer：不清理会把历代旧哈希产物带进安装包
			// （本仓其余 vite 配置同样各自清理 outDir；Sentry 只读该目录不注入文件）。
			emptyOutDir: true,
			sourcemap: sentry.enabled ? "hidden" : false,
			rollupOptions: {
				input: {
					main: resolve(__dirname, "src/renderer/index.html"),
					pet: resolve(__dirname, "src/renderer/pet.html"),
					onboarding: resolve(__dirname, "src/renderer/onboarding.html"),
					"remote-desktop-host": resolve(__dirname, "src/renderer/remote-desktop-host.html"),
				},
			},
		},
		server: {
			// Keep off 3000 (apps/site Next) and 3010 (xianxia theme dev).
			host: "127.0.0.1",
			port: devServerPort,
			strictPort: true,
			warmup: {
				// 主窗口入口在 Electron 主进程初始化期间并行完成 transform，
				// 首帧不再串行等待整棵依赖图的冷转换（dev 专属，打包无影响）。
				// renderApp 是 main.tsx 的动态 import，不在 index.html 的静态入口图内；
				// 显式预热它及其依赖树，避免窗口出来后白屏等待这段冷转换。
				clientFiles: ["./index.html", "./renderApp.tsx"],
			},
		},
	};
});
