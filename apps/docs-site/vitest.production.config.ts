// Copyright The Open Forge contributors.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["e2e/**/*.test.ts"],
		fileParallelism: false,
		hookTimeout: 30_000,
		testTimeout: 15_000,
	},
});
