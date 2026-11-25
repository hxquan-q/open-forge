// Copyright The Open Forge contributors.
// Historical audit only: opt-in configuration; never part of normal test discovery.
import { createRequire } from "node:module";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import base from "../../../apps/desktop/vitest.config.ts";

const evidenceDir = dirname(fileURLToPath(import.meta.url));
const root = resolvePath(evidenceDir, "../../..");
const desktop = join(root, "apps", "desktop");
const resolve = createRequire(join(desktop, "package.json")).resolve;

export default {
	...base,
	resolve: {
		...base.resolve,
		alias: [
			...base.resolve.alias,
			{ find: /^vitest$/, replacement: join(root, "node_modules", "vitest", "dist", "index.js") },
			{ find: /^@testing-library\/react$/, replacement: resolve("@testing-library/react") },
			{ find: /^react$/, replacement: resolve("react") },
			{ find: /^react\/jsx-runtime$/, replacement: resolve("react/jsx-runtime") },
			{ find: /^react\/jsx-dev-runtime$/, replacement: resolve("react/jsx-dev-runtime") },
			{ find: /^jotai$/, replacement: resolve("jotai") },
			{ find: /^@tanstack\/react-router$/, replacement: resolve("@tanstack/react-router") },
		],
	},
	test: {
		...base.test,
		include: [join(evidenceDir, "code-mode-behavior.probe.tsx").replaceAll("\\", "/")],
		maxWorkers: 1,
	},
};
