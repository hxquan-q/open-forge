// Modified by The Open Forge contributors.

import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createDesktopMcpInteractionHandlers } from "./mcp-supervisor.js";

describe("createDesktopMcpInteractionHandlers", () => {
	it("exposes only the permission-filtered project root", async () => {
		const projectRoot = process.platform === "win32" ? "C:\\workspace\\demo" : "/workspace/demo";
		const handlers = createDesktopMcpInteractionHandlers({ projectRoot });

		await expect(handlers.roots?.({}, { serverName: "demo", method: "roots/list", round: 1 })).resolves.toEqual({
			roots: [{ uri: pathToFileURL(projectRoot).href, name: "demo" }],
		});
	});

	it("advertises no root for a remote project instead of a fabricated local file:// address", async () => {
		// MCP server 跑在本机；把项目 URI 转成 file:// 会指向本机进程 cwd 下的假目录。
		const handlers = createDesktopMcpInteractionHandlers({ projectRoot: "ssh://host-1/srv/app" });

		await expect(handlers.roots?.({}, { serverName: "demo", method: "roots/list", round: 1 })).resolves.toEqual({
			roots: [],
		});
	});

	it("does not advertise a workspace root on an application-scoped connection", () => {
		// 应用级连接跨工作区复用，通告某个项目根会让 server 把它当成长期工作区。
		const application = createDesktopMcpInteractionHandlers({
			projectRoot: process.cwd(),
			resourceScope: "application",
		});
		expect(application.roots).toBeUndefined();

		const workspace = createDesktopMcpInteractionHandlers({
			projectRoot: process.cwd(),
			resourceScope: "workspace",
		});
		expect(workspace.roots).toBeTypeOf("function");
	});

	it("does not advertise sampling until an approved host policy is injected", () => {
		const withoutPolicy = createDesktopMcpInteractionHandlers({ projectRoot: process.cwd() });
		expect(withoutPolicy.sampling).toBeUndefined();

		const sampling = vi.fn();
		const withPolicy = createDesktopMcpInteractionHandlers({ projectRoot: process.cwd(), samplingHandler: sampling });
		expect(withPolicy.sampling).toBe(sampling);
	});
});
