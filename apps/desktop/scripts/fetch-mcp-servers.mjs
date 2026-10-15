// Modified by The Open Forge contributors.
//
// 把内置 MCP server 预装进 vendor/mcp-servers/<id>/node_modules，使桌面包离线、
// 秒级、版本锁定地提供它们（运行时以 ELECTRON_RUN_AS_NODE 拉起，见
// src/main/mcp/builtin-mcp-server-runtime.ts）。
//
// 该目录不是 workspace 成员；npm install 产出本地 node_modules（已 gitignore）。
// 裁剪只删「MCP stdio 模式永远不会加载」的子树——上游 dist/http/* 引用的
// fastify/hono/pino 全家桶，以及被 node:sqlite 垫片取代的 better-sqlite3 原生绑定。
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MCP_SERVERS_VENDOR_ROOT = join(import.meta.dirname, "..", "vendor", "mcp-servers");

/** 内置 server 清单：vendor 目录名、npm 包名、锁定版本。 */
export const VENDORED_MCP_SERVERS = [
	{
		id: "universal-db",
		packageName: "universal-db-mcp",
		version: "2.14.0",
		// 安装后从 node_modules 顶层删除的包（仅 HTTP 模式/被垫片替代的）
		prunePackages: [
			"fastify",
			"@fastify",
			"hono",
			"pino",
			"pino-abstract-transport",
			"pino-std-serializers",
			"commander",
			"@types",
			"better-sqlite3",
			"dotenv",
		],
		// 覆盖进 node_modules 的垫片包（目录名 = 包名）
		// dotenv 必须垫片而不是裸裁剪：上游 config-loader 顶层 `import { config } from
		// 'dotenv'`，删包后会沿父目录解析到仓库根的 dotenv@17，其 stdout 横幅会污染
		// MCP stdio 的 JSON-RPC 流（宿主按 Invalid JSON 判负杀进程）。
		shims: ["better-sqlite3", "dotenv"],
	},
];

function vendoredPackageVersion(serverDir, packageName) {
	const manifestPath = join(serverDir, "node_modules", packageName, "package.json");
	if (!existsSync(manifestPath)) return undefined;
	try {
		return JSON.parse(readFileSync(manifestPath, "utf8")).version;
	} catch {
		return undefined;
	}
}

async function pruneNodeModules(nodeModulesDir, packages, log) {
	for (const name of packages) {
		const target = join(nodeModulesDir, name);
		if (!existsSync(target)) continue;
		await rm(target, { recursive: true, force: true });
		log(`[mcp-servers] pruned ${name}`);
	}
}

function applyShims(serverDir, shims, log) {
	for (const name of shims) {
		const source = join(serverDir, "shims", name);
		const target = join(serverDir, "node_modules", name);
		if (!existsSync(source)) throw new Error(`[mcp-servers] missing shim source: ${source}`);
		rmSync(target, { recursive: true, force: true });
		mkdirSync(target, { recursive: true });
		cpSync(source, target, { recursive: true });
		log(`[mcp-servers] shimmed ${name} -> ${target}`);
	}
}

/**
 * 安装（或按锁定版本跳过）所有 vendored MCP server。幂等：版本匹配即跳过 npm。
 * 返回每个 server 的 { id, entryPath }。
 */
export async function prepareMcpServers({ vendorRoot = MCP_SERVERS_VENDOR_ROOT, log = console.log } = {}) {
	const resolved = [];
	for (const server of VENDORED_MCP_SERVERS) {
		const serverDir = join(vendorRoot, server.id);
		const current = vendoredPackageVersion(serverDir, server.packageName);
		if (current === server.version) {
			log(`[mcp-servers] ${server.id}@${server.version} already vendored`);
		} else {
			log(`[mcp-servers] installing ${server.packageName}@${server.version} (was: ${current ?? "none"})`);
			execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
				cwd: serverDir,
				stdio: "inherit",
				shell: process.platform === "win32",
			});
			const installed = vendoredPackageVersion(serverDir, server.packageName);
			if (installed !== server.version) {
				throw new Error(
					`[mcp-servers] ${server.id}: expected ${server.packageName}@${server.version}, got ${installed ?? "none"}`,
				);
			}
			await pruneNodeModules(join(serverDir, "node_modules"), server.prunePackages ?? [], log);
		}
		// 幂等路径也要应用垫片：node_modules 可能被外部重装过
		if (server.shims?.length) applyShims(serverDir, server.shims, log);
		const entryPath = join(serverDir, "node_modules", server.packageName, "dist", "index.js");
		if (!existsSync(entryPath)) throw new Error(`[mcp-servers] ${server.id}: entry not found: ${entryPath}`);
		resolved.push({ id: server.id, entryPath });
	}
	return resolved;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	prepareMcpServers().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
