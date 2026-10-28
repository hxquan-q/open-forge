// Modified by The Open Forge contributors.
import { readdirSync, watch } from "node:fs";
import { isDesignManifest } from "./theme-source.mjs";

/**
 * Reload when a design source file is ADDED or REMOVED (anywhere under the
 * design dir — frames/, components/, assets/, the root files).
 *
 * Design sources live OUTSIDE the vite root, and vite watches out-of-root files
 * one at a time as they are served (`ensureWatchedFile`). A brand-new file is
 * therefore watched by nobody, and two things go stale at once:
 *
 * - src/main.tsx collects frames with `import.meta.glob`, which vite only
 *   re-evaluates when a create/delete event reaches its watcher. Without one,
 *   every freshly loaded iframe keeps getting the stale frame table
 *   ("Frame not found") until the server restarts.
 * - src/styles.css rescans the whole `@source` dir on every re-transform, but
 *   nothing asks it to re-transform: no HMR update ever names the stylesheet.
 *   The new file then renders against a stylesheet that predates it — every
 *   utility class only that file introduces is missing, which reads as a
 *   scrambled layout until the server restarts.
 *
 * Handing the directory to vite's own watcher does not help: an `add()` during
 * `configureServer` is dropped (it only takes effect once `listen()` has
 * resolved, which no plugin hook lines up with). So watch the directory
 * directly and invalidate by hand.
 *
 * Only the file SET matters here: edits keep flowing through vite's normal HMR
 * untouched, and that path already rebuilds the stylesheet.
 */
export function vetdWatchDesign(engineRoot, designRoot) {
	const mainId = `${engineRoot.replaceAll("\\", "/")}/src/main.tsx`;
	const stylesId = `${engineRoot.replaceAll("\\", "/")}/src/styles.css`;
	/**
	 * Dot-prefixed entries are skipped on purpose: `.snapshots/` is written on
	 * every canvas capture, and reloading on it would loop capture ↔ reload.
	 *
	 * `node_modules/` is skipped for cost, not correctness (ADR-0068): a design
	 * declaring two libraries goes from 4 files to 7000+, and this walk runs on
	 * every settle. Nothing in there is a design source, and a dependency change
	 * already reaches the client through package.json moving in this same set.
	 */
	const listSources = (dir, prefix, out) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (isDesignManifest(rel)) continue;
			if (entry.isDirectory()) listSources(`${dir}/${entry.name}`, rel, out);
			else out.push(rel);
		}
		return out;
	};
	const snapshot = () => {
		try {
			return listSources(designRoot, "", []).sort().join("\n");
		} catch {
			return "";
		}
	};
	const framesOf = (list) =>
		list
			.split("\n")
			.filter((rel) => rel.startsWith("frames/") && rel.endsWith(".tsx"))
			.join("\n");
	return {
		name: "vetd-watch-design",
		apply: "serve",
		configureServer(server) {
			let known = snapshot();
			let timer = null;
			let watcher;
			/**
			 * 依赖清单变了（ADR-0068 的 vetd_install）。
			 *
			 * 单独一个标记，因为下面的判据是**文件集合**变没变：第一次装包会新增
			 * package-lock.json 所以能被看见，第二次装包只是改写这两个文件的内容，
			 * 集合一模一样——不特判的话画布收不到任何通知，新装的包要等下一次改源码
			 * 才生效。
			 */
			let dependenciesChanged = false;
			try {
				watcher = watch(designRoot, { recursive: true }, (_event, filename) => {
					if (filename && isDesignManifest(filename)) return;
					// Skip the noisy dirs before touching the disk (see listSources).
					// An npm install writes thousands of files under node_modules; on
					// platforms whose recursive watch reports them individually, every
					// one would schedule another full-tree walk.
					if (
						filename &&
						filename
							.replaceAll("\\", "/")
							.split("/")
							.some((seg) => seg.startsWith(".") || seg === "node_modules")
					)
						return;
					const base = (filename ?? "").replaceAll("\\", "/").split("/").pop();
					if (base === "package.json" || base === "package-lock.json") dependenciesChanged = true;
					// fs.watch fires several times per write; settle first, then diff.
					if (timer) clearTimeout(timer);
					timer = setTimeout(() => {
						timer = null;
						const next = snapshot();
						if (next === known && !dependenciesChanged) return;
						dependenciesChanged = false;
						const framesChanged = framesOf(next) !== framesOf(known);
						known = next;
						const environment = server.environments.client;
						if (framesChanged) {
							const mod = environment.moduleGraph.getModuleById(mainId);
							if (mod) environment.moduleGraph.invalidateModule(mod);
						}
						// ?direct / ?inline variants each get their own module node.
						for (const cssMod of environment.moduleGraph.getModulesByFile(stylesId) ?? []) {
							environment.moduleGraph.invalidateModule(cssMod);
						}
						environment.hot.send({ type: "full-reload", path: "*" });
					}, 60);
				});
			} catch {
				return; // no design dir yet: it was just scaffolded, the server restarts with it
			}
			server.httpServer?.once("close", () => {
				if (timer) clearTimeout(timer);
				watcher.close();
			});
		},
	};
}
