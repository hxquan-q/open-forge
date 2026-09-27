// Modified by The Open Forge contributors.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type BundledMcpRuntimeRoots, resolveBundledMcpServerConfig } from "./builtin-mcp-server-runtime.js";

const UNIVERSAL_DB_ENTRY = "launcher.mjs";

function createRoots(): { dir: string; roots: BundledMcpRuntimeRoots; entryPath: string } {
	const dir = mkdtempSync(join(tmpdir(), "bundled-mcp-"));
	const roots: BundledMcpRuntimeRoots = {
		devRoot: join(dir, "dev", "mcp-servers"),
		packagedRoot: join(dir, "pkg", "mcp-servers"),
		executable: "C:\\Apps\\OpenForge\\open-forge.exe",
	};
	const entryPath = join(roots.devRoot, "universal-db", UNIVERSAL_DB_ENTRY);
	mkdirSync(join(roots.devRoot, "universal-db"), { recursive: true });
	writeFileSync(entryPath, "// stub");
	return { dir, roots, entryPath };
}

const dirs: string[] = [];
function trackedRoots() {
	const r = createRoots();
	dirs.push(r.dir);
	return r;
}
afterEach(() => {
	while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("resolveBundledMcpServerConfig", () => {
	it("npx 的内置包配置被改写为内置入口 + Electron-as-Node", () => {
		const { roots, entryPath } = trackedRoots();
		const resolved = resolveBundledMcpServerConfig(
			{
				command: "npx",
				args: ["-y", "universal-db-mcp@2.14.0"],
				env: { DB_HOST: "db.local", DB_PASSWORD: "s3cret" },
				postConnectToolCalls: [{ tool: "connect_database", args: { host: "{env:DB_HOST}" } }],
				startupTimeout: 180_000,
			},
			roots,
		);
		expect(resolved).toMatchObject({
			command: "C:\\Apps\\OpenForge\\open-forge.exe",
			args: [entryPath],
			env: { DB_HOST: "db.local", DB_PASSWORD: "s3cret", ELECTRON_RUN_AS_NODE: "1" },
			startupTimeout: 180_000,
			postConnectToolCalls: [{ tool: "connect_database", args: { host: "{env:DB_HOST}" } }],
		});
	});

	it("裸包名（无版本）也接管：vendored 版本即锁定版本", () => {
		const { roots, entryPath } = trackedRoots();
		const resolved = resolveBundledMcpServerConfig({ command: "npx", args: ["-y", "universal-db-mcp"] }, roots);
		expect(resolved?.args).toEqual([entryPath]);
	});

	it("packaged 根优先于 dev 根", () => {
		const { roots } = trackedRoots();
		const packagedEntry = join(roots.packagedRoot!, "universal-db", UNIVERSAL_DB_ENTRY);
		mkdirSync(join(roots.packagedRoot!, "universal-db"), { recursive: true });
		writeFileSync(packagedEntry, "// stub");
		const resolved = resolveBundledMcpServerConfig({ command: "npx", args: ["universal-db-mcp@2.14.0"] }, roots);
		expect(resolved?.args).toEqual([packagedEntry]);
	});

	it("显式指定其它版本 → 不接管，保留用户选择", () => {
		const { roots } = trackedRoots();
		expect(
			resolveBundledMcpServerConfig({ command: "npx", args: ["-y", "universal-db-mcp@3.0.0"] }, roots),
		).toBeUndefined();
	});

	it("vendored 资源缺失 → 原样放行 npx 兜底", () => {
		const { roots } = trackedRoots();
		rmSync(join(roots.devRoot, "universal-db"), { recursive: true });
		expect(
			resolveBundledMcpServerConfig({ command: "npx", args: ["-y", "universal-db-mcp@2.14.0"] }, roots),
		).toBeUndefined();
	});

	it("非内置包与 http 配置不受影响", () => {
		const { roots } = trackedRoots();
		expect(resolveBundledMcpServerConfig({ command: "npx", args: ["-y", "some-other-mcp"] }, roots)).toBeUndefined();
		expect(resolveBundledMcpServerConfig({ type: "http", url: "http://127.0.0.1/mcp" }, roots)).toBeUndefined();
	});
});
