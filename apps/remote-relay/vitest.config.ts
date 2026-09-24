import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			isolatedStorage: false,
			singleWorker: true,
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
	],
	resolve: {
		alias: {
			"@vetta/remote-control": resolve(__dirname, "../../packages/remote-control/src/index.ts"),
			"@vetta/remote-desktop/protocol": resolve(__dirname, "../../packages/remote-desktop/src/protocol-entry.ts"),
			"@vetta/remote-desktop": resolve(__dirname, "../../packages/remote-desktop/src/index.ts"),
		},
	},
});
