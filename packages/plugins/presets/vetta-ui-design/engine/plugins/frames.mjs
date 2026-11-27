// Modified by The Open Forge contributors.
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

export const FRAMES_MODULE_ID = "virtual:vetd-frames";
export const RESOLVED_FRAMES_MODULE_ID = `\0${FRAMES_MODULE_ID}`;

/**
 * The frame table (`virtual:vetd-frames`): one lazy loader per `frames/*.tsx`.
 *
 * This used to be `import.meta.glob("@design/frames/*.tsx")` in main.tsx, but
 * vite turns each matched file into a POSIX path RELATIVE to the importer. On
 * Windows, with the engine on C: and the design on D:, that comes out as
 * `../../../D:/…/frames/x.tsx`, which resolves nowhere: main.tsx 500s and every
 * frame renders blank. Here each import goes through the `@design` alias
 * instead, which resolves to an absolute path and is served as `/@fs/D:/…` —
 * no relative path between drives is ever computed.
 *
 * Keys keep the old glob's shape (`…/frames/<name>.tsx`); main.tsx only reads
 * the file name.
 */
export function vetdFrames(designRoot) {
	const listFrames = () => {
		try {
			return readdirSync(resolve(designRoot, "frames"), { withFileTypes: true })
				.filter((entry) => entry.isFile() && !entry.name.startsWith(".") && entry.name.endsWith(".tsx"))
				.map((entry) => entry.name)
				.sort();
		} catch {
			return []; // no frames dir yet
		}
	};
	return {
		name: "vetd-frames",
		resolveId(id) {
			return id === FRAMES_MODULE_ID ? RESOLVED_FRAMES_MODULE_ID : null;
		},
		load(id) {
			if (id !== RESOLVED_FRAMES_MODULE_ID) return null;
			const entries = listFrames().map((name) => {
				const spec = JSON.stringify(`@design/frames/${name}`);
				return `\t${spec}: () => import(${spec}),`;
			});
			return `export const frameLoaders = {\n${entries.join("\n")}\n};\n`;
		},
	};
}
