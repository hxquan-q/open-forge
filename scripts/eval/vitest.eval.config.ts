import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packagesRoot = fileURLToPath(new URL("../../packages", import.meta.url));

function pkg(name: string, subpath: string): string {
	return `${packagesRoot}/${name}/${subpath}`;
}

export default defineConfig({
	resolve: {
		alias: {
			"@vetta/coding-agent/sdk": pkg("coding-agent", "src/public-api/sdk.ts"),
			"@vetta/coding-agent/resources": pkg("coding-agent", "src/public-api/resources.ts"),
			"@vetta/agent-core": pkg("agent", "src/index.ts"),
			"@vetta/ai": pkg("ai", "src/index.ts"),
			"@vetta/ecosystem-adapter/hooks": pkg("ecosystem-adapter", "src/hooks/index.ts"),
			"@vetta/ecosystem-adapter": pkg("ecosystem-adapter", "src/index.ts"),
			"@vetta/runtime-knowledge": pkg("runtime-knowledge", "src/index.ts"),
			"@vetta/runtime-subagents": pkg("runtime-subagents", "src/index.ts"),
			"@vetta/runtime-storage/conversation": pkg("runtime-storage", "src/conversation/index.ts"),
			"@vetta/runtime-node/sandbox": pkg("runtime-node", "src/sandbox/index.ts"),
			"@vetta/runtime-node/conversation/legacy": pkg("runtime-node", "src/conversation/legacy.ts"),
			"@vetta/runtime-node/conversation": pkg("runtime-node", "src/conversation/index.ts"),
			"@vetta/runtime-node/coding": pkg("runtime-node", "src/coding/index.ts"),
			"@vetta/runtime-node/host": pkg("runtime-node", "src/host/index.ts"),
			"@vetta/runtime-node/mcp": pkg("runtime-node", "src/mcp/index.ts"),
			"@vetta/runtime-tools/coding": pkg("runtime-tools", "src/coding/index.ts"),
			"@vetta/runtime-tools": pkg("runtime-tools", "src/index.ts"),
			"@vetta/runtime-mcp/browser": pkg("runtime-mcp", "src/browser/index.ts"),
			"@vetta/runtime-mcp/auth": pkg("runtime-mcp", "src/auth/index.ts"),
			"@vetta/runtime-mcp/client": pkg("runtime-mcp", "src/client/index.ts"),
			"@vetta/runtime-mcp/config": pkg("runtime-mcp", "src/config/index.ts"),
			"@vetta/runtime-mcp/protocol": pkg("runtime-mcp", "src/protocol/index.ts"),
			"@vetta/runtime-mcp": pkg("runtime-mcp", "src/index.ts"),
			"@vetta/runtime-core/configuration": pkg("runtime-core", "src/configuration/index.ts"),
			"@vetta/runtime-core/observation": pkg("runtime-core", "src/observation/index.ts"),
			"@vetta/runtime-core/kernel": pkg("runtime-core", "src/kernel/index.ts"),
			"@vetta/runtime-core/task": pkg("runtime-core", "src/task/index.ts"),
			"@vetta/runtime-core/conversation": pkg("runtime-core", "src/conversation/index.ts"),
			"@vetta/runtime-core/failures": pkg("runtime-core", "src/failures.ts"),
			"@vetta/runtime-core/sandbox": pkg("runtime-core", "src/sandbox/index.ts"),
			"@vetta/runtime-core/session-extensions": pkg("runtime-core", "src/session-extensions/index.ts"),
			"@vetta/runtime-core": pkg("runtime-core", "src/index.ts"),
		},
	},
	test: {
		include: ["scripts/eval/harness/**/*.test.ts", "scripts/eval/suites/**/*.eval.ts"],
		environment: "node",
		globals: false,
		fileParallelism: false,
		testTimeout: 180_000,
		hookTimeout: 180_000,
	},
});
