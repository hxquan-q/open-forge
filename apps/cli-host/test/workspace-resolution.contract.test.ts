// Copyright The Open Forge contributors.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createViteServer } from "vitest/node";

describe("CLI runtime workspace resolution", () => {
	it("loads memory policy from source without depending on a previous workspace build", async () => {
		const server = await createViteServer({
			configFile: fileURLToPath(new URL("../vitest.config.ts", import.meta.url)),
			server: { middlewareMode: true, watch: null, ws: false },
			appType: "custom",
		});
		try {
			const importer = fileURLToPath(
				new URL(
					"../../../packages/coding-agent/src/composition/contracts/runtime-session-options.ts",
					import.meta.url,
				),
			);
			const resolved = await server.environments.ssr.pluginContainer.resolveId("@vetta/runtime-memory", importer);
			expect(resolved?.id).toBe(
				fileURLToPath(new URL("../../../packages/runtime-memory/src/index.ts", import.meta.url)).replaceAll(
					"\\",
					"/",
				),
			);
		} finally {
			await server.close();
		}
	});
});
