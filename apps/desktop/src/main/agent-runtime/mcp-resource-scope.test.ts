// Copyright The Open Forge contributors.

import type { McpServerConfig } from "@vetta/runtime-mcp";
import { describe, expect, it } from "vitest";
import { resolveDesktopMcpServerResourceScope } from "./mcp-resource-scope.js";

describe("resolveDesktopMcpServerResourceScope", () => {
	it("keeps project config workspace-scoped even when it asks for application scope", () => {
		const config = { command: "server", resourceScope: "application" } as McpServerConfig;
		expect(resolveDesktopMcpServerResourceScope("project", config)).toBe("workspace");
	});

	it("shares global config that has no project dependency", () => {
		expect(resolveDesktopMcpServerResourceScope("global", { command: "server" })).toBe("application");
		expect(resolveDesktopMcpServerResourceScope("global", { type: "http", url: "https://example.com/mcp" })).toBe(
			"application",
		);
	});

	it("keeps PROJECT_ROOT consumers workspace-scoped", () => {
		const projectRootToken = `\${PROJECT_ROOT}`;
		expect(
			resolveDesktopMcpServerResourceScope("global", {
				command: "server",
				args: ["--root", projectRootToken],
				env: { ROOT: `${projectRootToken}/nested` },
			}),
		).toBe("workspace");
	});

	it("honors an explicit global workspace scope", () => {
		const config = { command: "server", resourceScope: "workspace" } as McpServerConfig;
		expect(resolveDesktopMcpServerResourceScope("global", config)).toBe("workspace");
	});
});
