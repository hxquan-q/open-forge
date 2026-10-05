// Modified by The Open Forge contributors.
/**
 * staged node_modules 清洗清单的产物断言与体积证据。
 *
 * 三种用法：
 * 1. 默认（无参数）：对三个目标平台的依赖闭包做一次不落盘的清洗模拟，打印清洗前后
 *    字节数，并断言清洗不会碰到运行时入口（`findStagedDepStrippingViolations`）；
 * 2. `--staging [目录]`：扫描真实 staging 树（缺省为 `prepare-pack.js` 的
 *    `<tmp>/vetta-desktop-build`），断言黑名单模式零命中；
 * 3. `--resources <目录>`：扫描已打包产物的 `resources/`（`app.asar.unpacked`
 *    与 `node_modules`），用于安装包级别的回归。
 *
 * 用法 2/3 必须显式带且只带一个 `--platform <darwin|win32|linux>`：产物树只属于一个
 * 平台族，缺省或并列多平台会让 `planStagedDepStripping` 按并集裁剪，把自己平台真正
 * 需要的 prebuild 误判为「应被裁剪却仍在」（BUG-0066）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveInstalledPackageRoot } from "./installed-package-root.mjs";
import { resolvePackagedNativeDependencies } from "./packaged-native-dependencies.mjs";
import {
	collectStagedDependencyTree,
	findNativeSourceImports,
	findStagedDepStrippingViolations,
	findStagedNodeModulesBlacklistHits,
	isStrippedByPlan,
	listStagedDepFiles,
	listStagedPackageRoots,
	normalizeStagedPath,
	planStagedDepStripping,
	readStagedDepFileSizes,
	summarizeStagedDepCleaning,
} from "./staged-deps-cleanlist.mjs";

const desktopRoot = join(import.meta.dirname, "..");
export const TARGET_PLATFORM_FAMILIES = Object.freeze(["darwin", "win32", "linux"]);
const defaultStagingDirectory = join(tmpdir(), "vetta-desktop-build");
const runtimeSourceExtensions = [".js", ".cjs", ".mjs"];

export function resolveDefaultStagingDirectory() {
	return defaultStagingDirectory;
}

function formatMegabytes(bytes) {
	return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

/** staging 树里的包根（见 staged-deps-cleanlist.mjs，脚本与构建共用同一份实现）。 */

function readPackageJsonOrNull(directory) {
	try {
		return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
	} catch {
		return null;
	}
}

function summarizeDirectoryBytes(rootDirectory, filePaths, sizesByPath) {
	let bytes = 0;
	for (const path of filePaths) bytes += sizesByPath.get(path) ?? 0;
	return bytes;
}

/**
 * 依赖闭包 + 每个包的清洗计划（不落盘）。
 *
 * `required` 依赖解析不到即失败；`optional` 依赖（异架构 pty 包、异平台原生包）
 * 在本机装不到属正常情况，跳过而不是误报。
 */
export function planStagedDependencyCleaning({
	platforms,
	fromDir = desktopRoot,
	speechInputEnabled = true,
	hostPlatform = process.platform,
	resolveRoot = resolveInstalledPackageRoot,
}) {
	const selection = resolvePackagedNativeDependencies(new Set(platforms), { speechInputEnabled });
	const candidateRoots = [
		...selection.required.map((dep) => ({ dep, required: true })),
		...selection.optional.map((dep) => ({ dep, required: false })),
	];
	const errors = [];
	const roots = [];
	for (const candidate of candidateRoots) {
		try {
			resolveRoot(candidate.dep, fromDir);
			roots.push(candidate.dep);
		} catch {
			if (!candidate.required) continue;
			// os/cpu 受限的异平台包（如 sherpa-onnx-win-x64）在其他系统的主机上本就
			// 装不进 node_modules，缺席不构成校验错误；它所属目标平台的原生构建
			// 主机上该包可装、仍走 required 强校验。
			const gate = selection.platformsByDep[candidate.dep];
			const hostCanInstall = gate === "all" || !Array.isArray(gate) || gate.includes(hostPlatform);
			if (hostCanInstall) errors.push(`declared external dependency is not installed: ${candidate.dep}`);
		}
	}
	const entries = collectStagedDependencyTree({
		roots,
		destinationRoot: "",
		resolvePackageRoot: (dep, fromDirForDep) => resolveRoot(dep, fromDirForDep),
		fromDir,
	});
	return {
		errors,
		dependencies: entries.map((entry) => {
			const packageJson = readPackageJsonOrNull(entry.sourceDir) ?? {};
			const filePaths = listStagedDepFiles(entry.sourceDir);
			const plan = planStagedDepStripping({ filePaths, platforms, packageJson });
			const sizesByPath = readStagedDepFileSizes(entry.sourceDir, filePaths);
			return {
				dep: entry.dep,
				sourceDir: entry.sourceDir,
				filePaths,
				plan,
				sizesByPath,
				summary: summarizeStagedDepCleaning({ filePaths, sizesByPath, plan }),
				violations: findStagedDepStrippingViolations({
					filePaths,
					plan,
					packageJson,
					label: entry.dep,
				}),
			};
		}),
	};
}

function readKeptRuntimeSources(dependency) {
	const sources = [];
	for (const path of dependency.filePaths) {
		if (!runtimeSourceExtensions.some((extension) => path.toLowerCase().endsWith(extension))) continue;
		if (isStrippedByPlan(dependency.plan, path)) continue;
		sources.push({ path, source: readFileSync(join(dependency.sourceDir, path), "utf8") });
	}
	return sources;
}

/**
 * 已裁掉 native 源码目录的依赖里，活着的 JS 不能还引用 `./src/...` —— 那说明
 * 「源码只在构建期需要」的假设对这个包不成立。
 */
export function findDanglingNativeSourceReferences(dependency) {
	const strippedNativeSource = [...dependency.plan.strippedPaths].some(
		(path) => dependency.plan.ruleForPath(path)?.category === "native-source",
	);
	if (!strippedNativeSource) return [];
	const violations = [];
	for (const { path, source } of readKeptRuntimeSources(dependency)) {
		for (const importPath of findNativeSourceImports(source)) {
			violations.push(`${dependency.dep}: ${path} still imports the stripped native source ${importPath}`);
		}
	}
	return violations;
}

/** 单平台干跑：打印清洗前后字节数，返回违规项与分依赖明细。 */
export function verifyPlatformStagedDependencies({ platform, fromDir = desktopRoot, log = console.log }) {
	const { errors, dependencies } = planStagedDependencyCleaning({ platforms: [platform], fromDir });
	const violations = [...errors];
	const totals = { files: 0, bytes: 0, keptFiles: 0, keptBytes: 0, strippedBytes: 0 };
	for (const dependency of dependencies) {
		violations.push(...dependency.violations, ...findDanglingNativeSourceReferences(dependency));
		totals.files += dependency.summary.files;
		totals.bytes += dependency.summary.bytes;
		totals.keptFiles += dependency.summary.keptFiles;
		totals.keptBytes += dependency.summary.keptBytes;
		totals.strippedBytes += dependency.summary.strippedBytes;
	}
	log(
		`[staged-deps] ${platform}: deps=${dependencies.length} files=${totals.files}→${totals.keptFiles} ` +
			`bytes=${formatMegabytes(totals.bytes)}→${formatMegabytes(totals.keptBytes)} ` +
			`(-${formatMegabytes(totals.strippedBytes)})`,
	);
	const offenders = dependencies
		.filter((dependency) => dependency.summary.strippedBytes > 0)
		.sort((left, right) => right.summary.strippedBytes - left.summary.strippedBytes)
		.slice(0, 5);
	for (const offender of offenders) {
		log(
			`[staged-deps]   ${offender.dep}: ${offender.summary.files}→${offender.summary.keptFiles} files, ` +
				`-${formatMegabytes(offender.summary.strippedBytes)}`,
		);
	}
	return { platform, totals, dependencies, violations };
}



/**
 * 真实 staging / 产物树的黑名单断言：这些路径本就不该出现，出现即说明清洗没生效。
 * 规则按包根应用：带通配的平台目录模式（prebuilds 下的平台目录）不能跨包根匹配。
 */
export function assertStagedTreeClean({ rootDirectory, platforms, log = console.log }) {
	if (!existsSync(rootDirectory)) {
		return { rootDirectory, skipped: true, packageRoots: 0, files: 0, bytes: 0, violations: [] };
	}
	const violations = [];
	const scanned = [];
	const candidateRoots = [
		join(rootDirectory, "node_modules"),
		join(rootDirectory, "app.asar.unpacked", "node_modules"),
	];
	for (const nodeModules of candidateRoots) {
		if (!existsSync(nodeModules)) continue;
		for (const hit of findStagedNodeModulesBlacklistHits({ nodeModulesDirectory: nodeModules, platforms })) {
			violations.push(normalizeStagedPath(relative(rootDirectory, join(nodeModules, hit))));
		}
		for (const packageRoot of listStagedPackageRoots(nodeModules)) {
			const filePaths = listStagedDepFiles(packageRoot);
			scanned.push({
				packageRoot,
				files: filePaths.length,
				bytes: summarizeDirectoryBytes(packageRoot, filePaths, readStagedDepFileSizes(packageRoot, filePaths)),
			});
		}
	}
	const files = scanned.reduce((total, entry) => total + entry.files, 0);
	const bytes = scanned.reduce((total, entry) => total + entry.bytes, 0);
	log(
		`[staged-deps] ${rootDirectory}: packages=${scanned.length} files=${files} bytes=${formatMegabytes(bytes)}`,
	);
	return { rootDirectory, skipped: false, packageRoots: scanned.length, files, bytes, violations };
}

export function parseArguments(argv) {
	const options = { platforms: [], staging: undefined, resources: undefined };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--platform") {
			options.platforms.push(argv[index + 1]);
			index += 1;
			continue;
		}
		if (argument === "--staging") {
			const next = argv[index + 1];
			options.staging = next && !next.startsWith("--") ? next : defaultStagingDirectory;
			if (options.staging === next) index += 1;
			continue;
		}
		if (argument === "--resources") {
			options.resources = argv[index + 1];
			index += 1;
			continue;
		}
		throw new Error(`[verify-staged-deps] unknown argument: ${argument}`);
	}
	const scansMaterializedTree = options.staging !== undefined || options.resources !== undefined;
	if (scansMaterializedTree) {
		if (options.platforms.length !== 1) {
			throw new Error(
				"[verify-staged-deps] --staging/--resources 需要且只接受一个 --platform <darwin|win32|linux>；" +
					"产物树只属于一个平台族，缺省或并列多平台会按并集裁剪，把自己平台的 prebuild 误判为未裁剪",
			);
		}
		return options;
	}
	if (options.platforms.length === 0) options.platforms.push(...TARGET_PLATFORM_FAMILIES);
	return options;
}

export function main(argv = process.argv.slice(2), log = console.log) {
	const options = parseArguments(argv);
	const violations = [];
	const scannedRoots = [
		{ flag: "staging", rootDirectory: options.staging },
		{ flag: "resources", rootDirectory: options.resources },
	];
	for (const { flag, rootDirectory } of scannedRoots) {
		if (rootDirectory === undefined) continue;
		const result = assertStagedTreeClean({ rootDirectory, platforms: options.platforms, log });
		if (result.skipped) log(`[staged-deps] ${flag} tree not found, skipped: ${rootDirectory}`);
		violations.push(...result.violations);
	}
	for (const platform of options.platforms) {
		violations.push(...verifyPlatformStagedDependencies({ platform, log }).violations);
	}
	if (violations.length > 0) {
		log(`[verify-staged-deps] ${violations.length} violation(s)`);
		for (const violation of violations) log(`- ${violation}`);
		process.exitCode = 1;
	} else {
		log("[verify-staged-deps] ok");
	}
	return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

