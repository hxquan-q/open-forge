// Modified by The Open Forge contributors.
/**
 * 内置（vendored）MCP server 的运行时解析。
 *
 * 目的：能力页里「内置」的 MCP 连接器不再依赖 `npx -y <pkg>` 现装——安装包内
 * 已携带 vendor/mcp-servers/<id>/ 的完整依赖树（scripts/fetch-mcp-servers.mjs
 * 生成，prepare-pack.js 通过 extraResources 打进 Resources/mcp-servers/）。
 * 启动时按包名+版本匹配 stdio 配置并改写为 `ELECTRON_RUN_AS_NODE=1` 的
 * `process.execPath <entry>`，与 im-host/cli-app 的内置 sidecar 同一模式。
 *
 * mcp.json 里仍是可移植的 `npx` 配置：本模块返回 undefined 时（资源缺失、版本
 * 不匹配、非内置条目）上层原样透传，npx 路径作为兜底仍然可用。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { McpServerConfig, McpStdioServerConfig } from "@vetta/runtime-mcp";

interface BundledMcpServerDef {
	/** stdio `args` 中匹配的包名（如 `universal-db-mcp`）。 */
	readonly packageName: string;
	/** vendor 锁定的版本；args 显式声明其它版本时不接管（保留用户选择）。 */
	readonly pinnedVersion: string;
	/** `mcp-servers/` 下的目录名。 */
	readonly directory: string;
	/** 目录内的入口文件（相对路径）。 */
	readonly entry: string;
}

const BUNDLED_MCP_SERVERS: readonly BundledMcpServerDef[] = [
	{
		packageName: "universal-db-mcp",
		pinnedVersion: "2.14.0",
		directory: "universal-db",
		// 走自带 launcher 而非上游 index.js：commander 在 Electron-as-Node 下
		// 会把脚本路径当成位置参数报「too many arguments」。
		entry: "launcher.mjs",
	},
];

export interface BundledMcpRuntimeRoots {
	/** 打包态资源根（Resources/mcp-servers）。 */
	readonly packagedRoot?: string;
	/** 开发态 vendor 根（apps/desktop/vendor/mcp-servers）。 */
	readonly devRoot: string;
	/** 子进程可执行文件：打包/dev 都是 process.execPath（Electron-as-Node）。 */
	readonly executable: string;
}

/**
 * 探测运行根。不 import electron：本模块在纯 Node 测试里也要可加载。
 * `process.resourcesPath` 仅在 Electron 进程内存在（见 ssh/helper-assets 同模式）；
 * dev 下它指向 Electron 自带 resources 目录，不含 mcp-servers——两个候选根都
 * 用 existsSync 裁决，命中哪个用哪个。
 */
export function readBundledMcpRuntimeRoots(
	env: { cwd?: string; resourcesPath?: string; execPath?: string } = {},
): BundledMcpRuntimeRoots {
	return {
		packagedRoot: env.resourcesPath ? join(env.resourcesPath, "mcp-servers") : undefined,
		devRoot: join(env.cwd ?? process.cwd(), "vendor", "mcp-servers"),
		executable: env.execPath ?? process.execPath,
	};
}

/** args 中解析形如 `pkg` / `pkg@x.y.z` 的规范；非该包的 arg 返回 undefined。 */
function parsePackageArg(arg: string, packageName: string): { matched: boolean; version?: string } {
	if (!arg.startsWith(packageName)) return { matched: false };
	const rest = arg.slice(packageName.length);
	if (rest === "") return { matched: true };
	if (rest.startsWith("@")) return { matched: true, version: rest.slice(1) };
	return { matched: false };
}

function findBundledEntry(def: BundledMcpServerDef, roots: BundledMcpRuntimeRoots): string | undefined {
	for (const root of [roots.packagedRoot, roots.devRoot]) {
		if (!root) continue;
		const entryPath = join(root, def.directory, def.entry);
		if (existsSync(entryPath)) return entryPath;
	}
	return undefined;
}

/**
 * stdio 配置若命中某个 vendored 内置 server（包名 + 版本兼容）且本地资源就绪，
 * 返回改写后的配置：`command` → 可执行文件，`args` → 内置入口，env 注入
 * `ELECTRON_RUN_AS_NODE`。其余字段（env/cwd/postConnectToolCalls/startupTimeout…）
 * 原样保留。未命中返回 undefined。
 */
export function resolveBundledMcpServerConfig(
	config: McpServerConfig,
	roots: BundledMcpRuntimeRoots = readBundledMcpRuntimeRoots(),
): McpStdioServerConfig | undefined {
	if (config.type === "http" || !config.command || !config.args?.length) return undefined;
	for (const def of BUNDLED_MCP_SERVERS) {
		const spec = config.args.map((arg) => parsePackageArg(arg, def.packageName)).find((parsed) => parsed.matched);
		if (!spec) continue;
		if (spec.version !== undefined && spec.version !== def.pinnedVersion) return undefined;
		const entryPath = findBundledEntry(def, roots);
		if (!entryPath) return undefined;
		return {
			...config,
			command: roots.executable,
			args: [entryPath],
			env: { ...config.env, ELECTRON_RUN_AS_NODE: "1" },
		};
	}
	return undefined;
}
