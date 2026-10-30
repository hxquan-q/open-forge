// Modified by The Open Forge contributors.

// Vetta Design Engine — shared vite template (materialized to ~/.vetta/design-engine/<version>/).
// The design bundle dir (x.vetd/) is mounted via the VETD_SRC env var; the engine itself
// never contains user content. See ADR-0053.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { createSourceTagger } from "./plugins/source-tagger.mjs";
import { vetdThemeSource } from "./plugins/theme-source.mjs";
import { vetdWatchDesign } from "./plugins/watch-design.mjs";

const engineRoot = dirname(fileURLToPath(import.meta.url));
const designRoot = resolve(process.env.VETD_SRC ?? resolve(process.cwd(), "design"));
const designRootPosix = designRoot.replaceAll("\\", "/");

export default defineConfig(({ command }) => ({
	plugins: [
		react(command === "serve" ? { babel: { plugins: [createSourceTagger(designRootPosix)] } } : {}),
		vetdThemeSource(designRootPosix),
		vetdWatchDesign(engineRoot, designRoot),
		tailwindcss(),
	],
	resolve: {
		// Design sources live OUTSIDE the engine root, so node resolution from a
		// frame file would never reach engine/node_modules — pin react to it.
		alias: {
			"@design": designRoot,
			react: resolve(engineRoot, "node_modules/react"),
			"react-dom": resolve(engineRoot, "node_modules/react-dom"),
			// frame 源码里的 <Link to="..."> 会 import "react-router"，同样解析不到
			// 引擎的 node_modules；不钉住的话每个 frame 一加链接就编译失败。
			"react-router": resolve(engineRoot, "node_modules/react-router"),
			// 纯兜底，skill 里一个字都没提：这里的图标是 Iconify 的 CSS 类
			// （`icon-[lucide--search]`），但模型对「图标」的默认反应是
			// `import { Search } from "lucide-react"`，而且提示词纠正不掉。以前这一
			// import 就是整帧构建失败——用户拿到的是一块红色报错，不是设计稿。装上以后
			// 两条路都通，写哪种都能出图。
			"lucide-react": resolve(engineRoot, "node_modules/lucide-react"),
		},
		dedupe: ["react", "react-dom", "react-router"],
	},
	// 设计源码在引擎 root 之外，vite 的依赖扫描够不到，得点名预构建：lucide-react
	// 是一个图标一个模块，不预构建的话第一次 import 会几百个请求逐个打过来。
	optimizeDeps: { include: ["lucide-react"] },
	server: {
		host: "127.0.0.1",
		strictPort: true,
		// CORS 关闭（TASK-0309）：设计源码只该给本应用里的 iframe（同源导航，不经
		// CORS）与本机探测（no-cors，见 engine-manager 的 waitForHttpReady）读。
		// 之前 `cors: true` 会带 ACAO:* 应答任意来源，本机任意网页都能跨源读源码。
		cors: false,
		// vite 自带的错误 overlay 会把整个 frame 糊成一张红色报错页——每个 frame 都是
		// 一个 iframe，画布上看到的就是设计稿整片消失。错误改由 src/bridge.ts 上报给
		// 画布：那边继续显示上一张位图，只在标题栏挂一个「构建失败」徽标。
		hmr: { overlay: false },
		// 显式 strict：allow 名单之外的路径一律拒（vite 5+ 默认即 true，写明防回退）。
		fs: { strict: true, allow: [process.cwd(), designRoot] },
	},
	build: {
		// Single chunk so the export snapshot can inline everything into one HTML.
		rollupOptions: { output: { inlineDynamicImports: true } },
		modulePreload: { polyfill: false },
		// 字体一律内联进 CSS。设计装的字体包（@fontsource/*）在 x.vetd/node_modules/
		// 里，而分享包快照只能从设计自己的文件里找回 /assets/ 引用（见
		// snapshot-assets.ts，node_modules 不进包）——不内联的话，分享出去的预览全部
		// 退回系统字体。字体包按 unicode-range 分片，拉丁字体全部分片也就一两百 KB。
		assetsInlineLimit: (file) => (/\.(?:woff2?|ttf|otf)$/i.test(file) ? true : undefined),
		chunkSizeWarningLimit: 4096,
	},
}));
