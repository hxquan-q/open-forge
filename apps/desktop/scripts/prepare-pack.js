// Modified by The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveBuildResourceFilters } from "./build-resource-filters.mjs";
import { validateDesktopBuildEnvironment } from "./desktop-build-environment.mjs";
import {
	DESKTOP_BUILD_OUTPUTS,
	DESKTOP_LEGAL_RESOURCE,
	VETTA_PLUGIN_FILE_ASSOCIATION,
} from "./desktop-packaging-layout.mjs";
import { LINUX_PACKAGE_METADATA, LINUX_RELEASE_TARGETS } from "./linux-packaging-contract.mjs";
import { loadBuildEnv } from "./load-build-env.mjs";
import { resolveInstalledPackageRoot } from "./installed-package-root.mjs";
import { resolvePackagedNativeDependencies } from "./packaged-native-dependencies.mjs";
import { resolveReleaseInfo } from "./resolve-release-info.mjs";
import {
	collectMissingSandboxBinaries,
	formatSandboxStagingWarning,
} from "./sandbox-staging-guard.mjs";
import {
	assessWindowsSandboxArtifacts,
	WINDOWS_SANDBOX_ARTIFACT_MANIFEST_PATH,
} from "./windows-sandbox-artifacts.mjs";
import { prepareSpeechModels, SPEECH_MODEL_RESOURCE_ROOT } from "./fetch-speech-models.mjs";
import { MCP_SERVERS_VENDOR_ROOT, prepareMcpServers } from "./fetch-mcp-servers.mjs";
import { prepareVendorRuntimes } from "./fetch-vendor-runtimes.mjs";
import {
	resolveSpeechInputBuildConfig,
	resolveSpeechInputTargetTags,
} from "./speech-input-build-config.js";
import {
	stageSystemPluginsFromArchives,
} from "./stage-system-plugins.mjs";
import { stageSystemSkills } from "./stage-system-skills.mjs";
import { stageSystemThemesFromArchives } from "./stage-system-themes.mjs";
import { stageDesktopLegalResources } from "./stage-desktop-legal-resources.mjs";
import {
	assertStagedDependencyPlan,
	collectStagedDependencyTree,
	createStagedDepPlanFilter,
	findStagedNodeModulesBlacklistHits,
	listStagedDepFiles,
	planStagedDepStripping,
	readStagedDepFileSizes,
	summarizeStagedDepCleaning,
} from "./staged-deps-cleanlist.mjs";

// 从 .env.<mode>/.env 注入构建期变量（如 VETTA_TENANT），命令行内联优先。
const buildEnvMode = loadBuildEnv();
const buildEnvironment = validateDesktopBuildEnvironment({ env: process.env, mode: buildEnvMode });
const updatePublishConfig = buildEnvironment.updateConfig;
const pluginSelection = buildEnvironment.pluginSelection;
const macSigning = buildEnvironment.macSigning;

const projectRoot = join(import.meta.dirname, "..");
const buildStageDir = join(tmpdir(), "vetta-desktop-build");
const imGatewayDir = join(projectRoot, "..", "im-gateway");
const imGatewayDistDir = join(imGatewayDir, "dist");
const codingAgentDir = join(projectRoot, "..", "..", "packages", "coding-agent");
const cliAppDir = join(projectRoot, "..", "cli-host");
const runtimeCoreWindowsSandboxDir = join(projectRoot, "..", "..", "packages", "runtime-core", "sandbox", "bin");
const runtimeCoreSandboxDir = join(projectRoot, "..", "..", "packages", "runtime-core", "sandbox", "linux");
// 受控制品清单（TASK-0159）：钉死 Windows 沙盒制品名与 SHA-256，见 windows-sandbox-artifacts.mjs。
const windowsSandboxManifestPath = join(projectRoot, "..", "..", WINDOWS_SANDBOX_ARTIFACT_MANIFEST_PATH);
const cliAppCompileTargets = {
	"darwin-arm64": { platformTag: "darwin-arm64", bunTarget: "bun-darwin-arm64", binaryName: "openforge" },
	"darwin-x64": { platformTag: "darwin-x64", bunTarget: "bun-darwin-x64", binaryName: "openforge" },
	"linux-arm64": { platformTag: "linux-arm64", bunTarget: "bun-linux-arm64", binaryName: "openforge" },
	"linux-x64": { platformTag: "linux-x64", bunTarget: "bun-linux-x64", binaryName: "openforge" },
	"win32-x64": { platformTag: "win32-x64", bunTarget: "bun-windows-x64", binaryName: "openforge.exe" },
};
const imGatewayTargetByPlatformTag = {
	"darwin-arm64": { arch: "arm64", os: "darwin" },
	"darwin-x64": { arch: "amd64", os: "darwin" },
	"linux-arm64": { arch: "arm64", os: "linux" },
	"linux-x64": { arch: "amd64", os: "linux" },
	"win32-x64": { arch: "amd64", os: "windows" },
};

// Resolve electron version from the workspace
const require = createRequire(import.meta.url);
// 品牌档案与 vite 同开关（VETTA_BRAND_PROFILE）：默认（未设置）走外部分发档 Allstr ai，
// 显式 self 回到 Open Forge；兼容标识（executableName / appId / 安装目录）跨档冻结。
const desktopBrand = require(
	process.env.VETTA_BRAND_PROFILE === "self"
		? "../src/shared/desktop-brand.json"
		: "../src/shared/desktop-brand.distribution.json",
);
const appRuntimeIdentity = require("../src/shared/app-identity.json");
const electronPkgPath = require.resolve("electron/package.json");
const electronVersion = JSON.parse(readFileSync(electronPkgPath, "utf8")).version;

// 正式发布以 apps/desktop/package.json 为唯一真源。本地更新闭环测试可用
// VETTA_DESKTOP_BUILD_VERSION 生成更高版本产物，不修改源码版本或创建 tag。
const packageVersion = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")).version;
const buildVersionOverride = process.env.VETTA_DESKTOP_BUILD_VERSION?.trim();
const appVersion = buildVersionOverride || packageVersion;
if (!/^\d+\.\d+\.\d+$/.test(appVersion)) {
	throw new Error(`[prepare-pack] invalid desktop version: ${appVersion}`);
}
if (buildVersionOverride && buildVersionOverride !== packageVersion) {
	console.warn(`[prepare-pack] QA build version override: ${packageVersion} -> ${appVersion}`);
}
const releaseInfo =
	appVersion === packageVersion ? resolveReleaseInfo(join(projectRoot, "CHANGELOG.md"), appVersion) : undefined;

function resolveCliAppCompileTargets() {
	const rawTargets = process.env.VETTA_CLI_TARGET_PLATFORMS ?? process.env.VETTA_VENDOR_PLATFORM;
	const platformTags =
		typeof rawTargets === "string" && rawTargets.trim().length > 0
			? rawTargets
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean)
			: [`${process.platform}-${process.arch}`];

	return platformTags.map((platformTag) => {
		const target = cliAppCompileTargets[platformTag];
		if (!target) {
			throw new Error(
				`[prepare-pack] unsupported cli-app platform ${platformTag}; expected one of ${Object.keys(
					cliAppCompileTargets,
				).join(", ")}`,
			);
		}
		return target;
	});
}

function resolvePlatformTagsFromEnv() {
	return resolveSpeechInputTargetTags(process.env);
}

function resolveImGatewayTargets() {
	return resolvePlatformTagsFromEnv().map((platformTag) => {
		const target = imGatewayTargetByPlatformTag[platformTag];
		if (!target) {
			throw new Error(
				`[prepare-pack] unsupported im-gateway platform ${platformTag}; expected one of ${Object.keys(
					imGatewayTargetByPlatformTag,
				).join(", ")}`,
			);
		}
		return target;
	});
}

function resolvePlatformFamilies() {
	const families = new Set();
	for (const platformTag of resolvePlatformTagsFromEnv()) {
		if (platformTag.startsWith("darwin-")) families.add("darwin");
		else if (platformTag.startsWith("linux-")) families.add("linux");
		else if (platformTag.startsWith("win32-")) families.add("win32");
		else {
			throw new Error(
				`[prepare-pack] unsupported platform ${platformTag}; expected darwin-*, linux-*, or win32-*`,
			);
		}
	}
	return families;
}

const speechInputBuildConfig = resolveSpeechInputBuildConfig({
	env: process.env,
	platformTags: resolvePlatformTagsFromEnv(),
});
console.log(
	speechInputBuildConfig.enabled
		? `[prepare-pack] speech input enabled for ${speechInputBuildConfig.platformTags.join(", ")}`
		: speechInputBuildConfig.configuredEnabled
			? `[prepare-pack] speech input skipped for ${speechInputBuildConfig.platformTags.join(", ")}`
			: "[prepare-pack] speech input disabled by VETTA_SPEECH_INPUT_ENABLED=false",
);

// 签名配置已经由统一构建环境检查解析；这里仅负责把结果映射到 builder 配置。
if (!macSigning.enabled) {
	console.log("[prepare-pack] macOS 签名凭据未配置，产出未签名包");
} else if (macSigning.notarize) {
	console.log(`[prepare-pack] macOS 签名与公证已启用（team=${macSigning.teamId}）`);
} else {
	console.warn(
		`[prepare-pack] macOS 已签名但跳过公证（team=${macSigning.teamId}，VETTA_SKIP_NOTARIZE=1）——` +
			"仅供本地更新闭环，产物不可分发",
	);
}

function resolveSandboxResourceFilters() {
	const filters = new Set();
	const families = resolvePlatformFamilies();
	if (families.has("win32")) filters.add("windows/**/*");
	if (families.has("linux")) filters.add("linux/**/*");
	return [...filters];
}

// Copy externalized dependencies (not bundled by Vite due to ESM compatibility issues).
//
// Some packages (e.g. modern node-cron) restrict their `exports` map and no
// longer allow `require.resolve("<pkg>/package.json")`. Resolve the package's
// main entry first. Binary-only packages such as @lydell/node-pty-* have no
// JavaScript entry, so those fall back to package.json. In both cases, trim the
// resolved path back to the package root inside node_modules.
// 与 vite.main.config.ts 的 rollupOptions.external 保持同步。photon-node 在
// 主 bundle 被 external 后，代码里 createRequire("@silvia-odwyer/photon-node")
// 在 packaged AppImage 中找不到包就降级到原图（image-resize 早期日志的
// `Cannot find module '@silvia-odwyer/photon-node'` 即此），图片以原始分辨率
// 喂模型，长会话直接吃满主进程内存。把它复制进 staging/node_modules 让
// createRequire 真能 resolve 到，恢复图片缩放路径。photon-node 是纯 WASM、
// 无平台二进制差异，可安全跨平台打包。
//
// uiohook-napi（快捷面板双击功能键全局监听）、electron-liquid-glass（macOS
// 液态/磨砂玻璃）与 sherpa-onnx-win-x64（Windows 语音输入）同为被 external 的运行时原生模块，必须复制进 staging，
// 否则 packaged 环境 require 不到。uiohook 各平台都有 prebuild、需全平台带；
// electron-liquid-glass 是 darwin-only，Sherpa 是 win32-x64-only；依赖策略按目标产物平台选择，
// 不按构建主机选择，避免把另一个系统的原生包带入产物。
const packagedNativeDependencies = resolvePackagedNativeDependencies(resolvePlatformFamilies(), {
	speechInputEnabled: speechInputBuildConfig.enabled,
});
const externalDeps = packagedNativeDependencies.required;
const optionalExternalDeps = packagedNativeDependencies.optional;

// Copy an external dep plus its full production-dependency closure into the
// staged node_modules. app-builder-lib 26's bun collector walks each package's
// declared `dependencies` and hard-fails when one is missing from the staged
// tree (e.g. uiohook-napi → node-gyp-build, electron-liquid-glass → bindings /
// node-addon-api). Transitive deps are nested under the owner's node_modules so
// both the collector and runtime require() resolve them; the asarUnpack glob
// `node_modules/<dep>/**/*` then unpacks them alongside the native module.
//
// 清洗清单（scripts/staged-deps-cleanlist.mjs）在复制时逐条应用，对应 VS Code 的
// `build/.moduleignore` 两级清单：测试、文档、构建脚本、调试符号与异平台预编译
// 二进制不进 app.asar。闭包计算与规则都从那个模块读取，verify-staged-deps.mjs
// 的产物断言与这里共用同一份实现。
function formatMegabyteCount(bytes) {
	return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// 哪些原生变体目录会被裁掉由目标产物平台决定；平台未知（本地显式构建）时保留全部。
const stagedDependencyPlatforms = [...resolvePlatformFamilies()];

function stageExternalDependency(dep, sourceDir, destDir) {
	const packageJson = JSON.parse(readFileSync(join(sourceDir, "package.json"), "utf8"));
	const filePaths = listStagedDepFiles(sourceDir);
	const plan = planStagedDepStripping({ filePaths, platforms: stagedDependencyPlatforms, packageJson });
	// 计划一旦碰到运行时入口立刻失败：破损的依赖不能被打进安装包。
	assertStagedDependencyPlan({ label: dep, filePaths, plan, packageJson });
	const summary = summarizeStagedDepCleaning({
		filePaths,
		sizesByPath: readStagedDepFileSizes(sourceDir, filePaths),
		plan,
	});
	cpSync(sourceDir, destDir, {
		recursive: true,
		filter: createStagedDepPlanFilter({ sourceDir, plan }),
	});
	console.log(
		`[prepare-pack] staged ${dep}: ${summary.files}→${summary.keptFiles} files, ` +
			`${formatMegabyteCount(summary.bytes)}→${formatMegabyteCount(summary.keptBytes)} ` +
			`(-${formatMegabyteCount(summary.strippedBytes)})`,
	);
}

function toExternalDepInfo(dep) {
	const dir = resolveInstalledPackageRoot(dep, projectRoot);
	const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
	if (typeof pkg.version !== "string" || !pkg.version) {
		throw new Error(`prepare-pack: ${dep} package.json is missing a version`);
	}
	return { dep, dir, version: pkg.version };
}

const externalDepInfos = externalDeps.map(toExternalDepInfo);
for (const dep of optionalExternalDeps) {
	try {
		externalDepInfos.push(toExternalDepInfo(dep));
	} catch {
		console.warn(`[prepare-pack] optional external dep ${dep} not resolvable on this host; skipping`);
	}
}

// 终端的 pty.node 按「平台-架构」拆包，同一 OS 的另一个架构在本机装不到，所以那些包
// 只能是 optional。但**本次目标**的那个必须在：缺了它应用照样启动，只是终端一开就报
// require 失败——这种故障只在安装包里复现，必须在构建阶段就拦下来。
function assertTerminalPtyBinaryStaged() {
	const staged = new Set(externalDepInfos.map((info) => info.dep));
	const missing = resolvePlatformTagsFromEnv()
		.map((platformTag) => `@lydell/node-pty-${platformTag}`)
		.filter((dep) => optionalExternalDeps.includes(dep) && !staged.has(dep));
	if (missing.length > 0) {
		throw new Error(
			`[prepare-pack] terminal PTY binary missing for this target: ${missing.join(", ")}. ` +
				`Install it on the build host (it ships as an optionalDependency of @lydell/node-pty).`,
		);
	}
}

assertTerminalPtyBinaryStaged();

function assertPackagedMainHasNoWorkspaceImports(mainOutputDir) {
	const workspaceImportPattern = /^\s*import(?:\s+.+\s+from)?\s+["']@vetta\//;
	const invalidImports = [];
	for (const fileName of readdirSync(mainOutputDir)) {
		if (!fileName.endsWith(".js")) continue;
		const lines = readFileSync(join(mainOutputDir, fileName), "utf8").split(/\r?\n/);
		for (const [index, line] of lines.entries()) {
			if (workspaceImportPattern.test(line)) invalidImports.push(`${fileName}:${index + 1}: ${line.trim()}`);
		}
	}
	if (invalidImports.length > 0) {
		throw new Error(
			"[prepare-pack] desktop main output contains external @vetta workspace imports. " +
				"Rebuild main with VETTA_BUILD_ENV=production before packaging:\n" +
				invalidImports.join("\n"),
		);
	}
}

assertPackagedMainHasNoWorkspaceImports(join(projectRoot, "dist/main"));

// Clean previous build stage
rmSync(buildStageDir, { recursive: true, force: true });
mkdirSync(buildStageDir, { recursive: true });
stageDesktopLegalResources(join(projectRoot, "..", ".."), buildStageDir);

// 语音模型默认不进安装包：首次使用语音输入时由主进程按 model-manifest.json
// 按需下载到用户目录。离分发场景可设 VETTA_BUNDLE_SPEECH_MODELS=1 恢复内置。
const bundleSpeechModels = process.env.VETTA_BUNDLE_SPEECH_MODELS === "1";
if (bundleSpeechModels) {
	const preparedSpeechModel = await prepareSpeechModels({
		env: process.env,
		platformTags: resolvePlatformTagsFromEnv(),
	});
	if (preparedSpeechModel) {
		cpSync(SPEECH_MODEL_RESOURCE_ROOT, join(buildStageDir, "speech-models"), { recursive: true });
	}
} else {
	console.log("[prepare-pack] speech models not bundled (runtime downloads on demand)");
}

// Write the staged package metadata. Electron-builder decides which
// node_modules entries belong in app.asar from production dependencies, so
// externalized runtime deps must be declared here even though we copy them
// manually below.
const appPkg = {
	name: appRuntimeIdentity.runtimeName,
	version: appVersion,
	description: `${desktopBrand.displayName} Desktop App`,
	author: LINUX_PACKAGE_METADATA.author,
	homepage: LINUX_PACKAGE_METADATA.homepage,
	license: LINUX_PACKAGE_METADATA.license,
	type: "module",
	main: "main/index.js",
	dependencies: Object.fromEntries(externalDepInfos.map(({ dep, version }) => [dep, version])),
};
writeFileSync(join(buildStageDir, "package.json"), JSON.stringify(appPkg, null, "\t") + "\n");

// Copy build outputs
for (const { source, target } of DESKTOP_BUILD_OUTPUTS) {
	// OCR outputs are included in the same manifest so staging and runtime
	// resource checks cannot silently drift from the main app layout.
	cpSync(join(projectRoot, source), join(buildStageDir, target), { recursive: true });
}

// macOS DMG: 生成背景图（写入 repo build/，下面 cpSync 会一并带到 staging）。
// 仅 darwin host 跑；非 darwin 上即使存在 mac target，也不会真正出 dmg。
// 签名构建没有「已损坏」问题，不带修复助手，背景图退回两图标版式。
if (process.platform === "darwin") {
	execFileSync(
		"node",
		[join(import.meta.dirname, "generate-dmg-background.js"), ...(macSigning.enabled ? ["--two-icons"] : [])],
		{ stdio: "inherit" },
	);
}

// Copy icons
cpSync(join(projectRoot, "build"), join(buildStageDir, "build"), { recursive: true });

// 打包图标随品牌档案（默认外部分发档，显式 self 跳过）：exe 图标（win.icon）、安装器
// 图标（extraResources 的 build/icon.ico）与运行时窗口/托盘图标（window-manager 读
// resources/build/icon.*）全部取自暂存 build/，在这里一次性覆盖成指定品牌资产；
// 文件名不变，兼容标识不受影响。
if (process.env.VETTA_BRAND_PROFILE !== "self") {
	for (const iconName of ["icon.ico", "icon.png", "icon.icns", "icon-dock.png"]) {
		cpSync(join(projectRoot, "build", "brand", "distribution", iconName), join(buildStageDir, "build", iconName), {
			force: true,
		});
	}
}

// macOS DMG: 编译「修复已损坏.app」直接落到 staging build/，由下面 dmg.contents 引用。
// 仅未签名构建需要；签名+公证后 quarantine 不再拦截，且该 helper 自身未签名会拖累公证。
if (process.platform === "darwin" && !macSigning.enabled) {
	execFileSync(
		"node",
		[join(import.meta.dirname, "build-mac-repair-helper.js"), join(buildStageDir, "build")],
		{ stdio: "inherit" },
	);
}

// macOS appshot: swiftc 编译 "Open Forge Computer Use.app" 直接落到 staging appshot/，
// 由 resolveExtraResources 带进 Resources/appshot/（filter "**/*" 递归带入
// .app bundle 内部结构）。仅 darwin host 可编译。
if (process.platform === "darwin") {
	execFileSync(
		"node",
		[join(import.meta.dirname, "build-appshot-helper.js"), "--out", join(buildStageDir, "appshot")],
		{ stdio: "inherit" },
	);
}

const stagedDependencyEntries = collectStagedDependencyTree({
	roots: externalDepInfos.map((info) => info.dep),
	destinationRoot: join(buildStageDir, "node_modules"),
	fromDir: projectRoot,
	resolvePackageRoot: (dep, fromDir) => resolveInstalledPackageRoot(dep, fromDir),
});
for (const { dep, sourceDir, destDir } of stagedDependencyEntries) {
	stageExternalDependency(dep, sourceDir, destDir);
}

// 复制之后的成品校验：staging 树里一旦还有黑名单命中，说明 filter 没接上清洗规则。
const stagedBlacklistHits = findStagedNodeModulesBlacklistHits({
	nodeModulesDirectory: join(buildStageDir, "node_modules"),
	platforms: stagedDependencyPlatforms,
});
if (stagedBlacklistHits.length > 0) {
	throw new Error(
		`[prepare-pack] staged node_modules still contains cleanlist blacklist entries:\n- ` +
			stagedBlacklistHits.join("\n- "),
	);
}

// =============================================================================
// im-gateway sidecar binaries (extraResources)
// =============================================================================
//
// Build the Go binaries for the requested target platform(s), then copy them
// into the staged Resources/im-gateway/ directory so electron-builder picks
// them up via extraResources. This intentionally avoids shell-specific Makefile
// logic so Windows packaging works the same way as POSIX hosts.

console.log("[prepare-pack] cross-building im-gateway sidecar...");
rmSync(imGatewayDistDir, { recursive: true, force: true });
mkdirSync(imGatewayDistDir, { recursive: true });

for (const target of resolveImGatewayTargets()) {
	const extension = target.os === "windows" ? ".exe" : "";
	const outputPath = join(imGatewayDistDir, `im-gateway-${target.os}-${target.arch}${extension}`);
	console.log(`  -> ${outputPath}`);
	try {
		execFileSync(process.platform === "win32" ? "go.exe" : "go", [
			"build",
			"-trimpath",
			"-ldflags",
			"-s -w -X main.version=dev",
			"-o",
			outputPath,
			"./cmd/im-gateway",
		], {
			cwd: imGatewayDir,
			env: {
				...process.env,
				CGO_ENABLED: "0",
				GOARCH: target.arch,
				GOOS: target.os,
			},
			stdio: "inherit",
		});
	} catch (err) {
		console.error("[prepare-pack] im-gateway cross-build failed");
		throw err;
	}
}

const stagedImGatewayDir = join(buildStageDir, "im-gateway");
mkdirSync(stagedImGatewayDir, { recursive: true });
if (existsSync(imGatewayDistDir)) {
	for (const file of readdirSync(imGatewayDistDir)) {
		if (!file.startsWith("im-gateway-")) continue;
		const src = join(imGatewayDistDir, file);
		const dest = join(stagedImGatewayDir, file);
		cpSync(src, dest);
		// Ensure executable bit is preserved (zip extraction sometimes
		// strips it; we set it explicitly so spawn() works after install).
		try {
			chmodSync(dest, 0o755);
		} catch {
			// best effort on Windows / FAT
		}
	}
} else {
	throw new Error(`im-gateway dist dir not found after cross-build: ${imGatewayDistDir}`);
}

// =============================================================================
// ssh-helper: remote-project helper binaries (extraResources) —— ADR-0124
// =============================================================================
//
// The helper runs on the REMOTE host of an SSH project, so its targets have
// nothing to do with the desktop platform being packaged: a Windows build of
// the app still needs the linux/arm64 helper to upload. Every supported remote
// platform therefore ships in every package (~3 MB each, static, CGO off).
//
// A missing helper is not fatal at runtime — remote projects fall back to plain
// `ssh exec` — but a packaging run that silently ships without it would turn
// "background tasks survive a disconnect" into a per-build lottery, so fail here.

const sshHelperDir = join(projectRoot, "..", "ssh-helper");
const SSH_HELPER_TARGETS = [
	{ os: "linux", arch: "amd64" },
	{ os: "linux", arch: "arm64" },
	{ os: "darwin", arch: "amd64" },
	{ os: "darwin", arch: "arm64" },
];

console.log("[prepare-pack] cross-building ssh-helper...");
const stagedSshHelperDir = join(buildStageDir, "ssh-helper");
rmSync(stagedSshHelperDir, { recursive: true, force: true });
for (const target of SSH_HELPER_TARGETS) {
	const outputDir = join(stagedSshHelperDir, `${target.os}-${target.arch}`);
	const outputPath = join(outputDir, "openforge-ssh-helper");
	mkdirSync(outputDir, { recursive: true });
	console.log(`  -> ${outputPath}`);
	try {
		execFileSync(
			process.platform === "win32" ? "go.exe" : "go",
			["build", "-trimpath", "-ldflags", "-s -w", "-o", outputPath, "./cmd/openforge-ssh-helper"],
			{
				cwd: sshHelperDir,
				env: { ...process.env, CGO_ENABLED: "0", GOARCH: target.arch, GOOS: target.os },
				stdio: "inherit",
			},
		);
	} catch (err) {
		console.error("[prepare-pack] ssh-helper cross-build failed");
		throw err;
	}
	try {
		chmodSync(outputPath, 0o755);
	} catch {
		// best effort on Windows / FAT; the desktop app chmods it again after upload
	}
}

// =============================================================================
// coding-agent runtime assets (extraResources)
// =============================================================================
//
// The bundled main-*.js (Vite output) contains `@vetta/coding-agent`'s JS
// but not its on-disk package tree. Stage the full dist plus metadata into
// Resources/coding-agent/. macOS/Linux agent-rpc-command.ts uses it as
// VETTA_PACKAGE_DIR for assets; Windows additionally runs a bundled
// cli-app Runtime Selector via ELECTRON_RUN_AS_NODE because GUI Electron
// stdio is not reliable for RPC.
const stagedCodingAgentDir = join(buildStageDir, "coding-agent");
rmSync(stagedCodingAgentDir, { recursive: true, force: true });
mkdirSync(stagedCodingAgentDir, { recursive: true });
const codingAgentAssets = [
	"package.json",
	"banner.txt",
	"README.md",
	"CHANGELOG.md",
	"dist",
];
for (const rel of codingAgentAssets) {
	const src = join(codingAgentDir, rel);
	if (!existsSync(src)) {
		// banner / README / CHANGELOG are best-effort; theme + export-html
		// are required and would have failed the build at this point if
		// missing from the source repo.
		continue;
	}
	cpSync(src, join(stagedCodingAgentDir, rel), { recursive: true });
}
const bundledAgentRpcCli = join(stagedCodingAgentDir, "dist", "agent-rpc-cli.mjs");
console.log(`[prepare-pack] bundling Windows agent-rpc CLI -> ${bundledAgentRpcCli}`);
execFileSync(process.platform === "win32" ? "bun.exe" : "bun", [
	"build",
	join(cliAppDir, "src", "agent-rpc-cli.ts"),
	"--target",
	"node",
	"--format",
	"esm",
	"--outfile",
	bundledAgentRpcCli,
], {
	cwd: projectRoot,
	stdio: "inherit",
});
// Sanity-check the load-bearing files are actually in the stage dir.
const stagedThemeDir = join(stagedCodingAgentDir, "dist/modes/interactive/theme");
if (!existsSync(join(stagedThemeDir, "dark.json"))) {
	throw new Error(`coding-agent theme assets missing after stage: ${stagedThemeDir}`);
}
if (!existsSync(bundledAgentRpcCli)) {
	throw new Error(`bundled agent-rpc CLI missing after stage: ${bundledAgentRpcCli}`);
}

// =============================================================================
// openforge CLI app (extraResources)
// =============================================================================
//
// The agent-facing `openforge` command is @vetta/cli-host, not the desktop
// executable. Stage it into Resources/cli-app/ so Desktop can write
// ~/.vetta/agent/bin/openforge as a stable shim to this entry.
const stagedCliAppDir = join(buildStageDir, "cli-app");
rmSync(stagedCliAppDir, { recursive: true, force: true });
mkdirSync(stagedCliAppDir, { recursive: true });
cpSync(join(cliAppDir, "package.json"), join(stagedCliAppDir, "package.json"));
console.log("[prepare-pack] building cli-app...");
execFileSync(process.platform === "win32" ? "bun.exe" : "bun", ["run", "build"], {
	cwd: cliAppDir,
	stdio: "inherit",
});
for (const target of resolveCliAppCompileTargets()) {
	const stagedCliAppBinDir = join(stagedCliAppDir, "bin", target.platformTag);
	const stagedCliAppBinary = join(stagedCliAppBinDir, target.binaryName);
	mkdirSync(stagedCliAppBinDir, { recursive: true });
	console.log(`[prepare-pack] compiling openforge CLI (${target.platformTag}) -> ${stagedCliAppBinary}`);
	execFileSync(process.platform === "win32" ? "bun.exe" : "bun", [
		join(cliAppDir, "scripts", "compile-standalone.mjs"),
		"--target",
		target.bunTarget,
		"--outfile",
		stagedCliAppBinary,
	], {
		cwd: projectRoot,
		stdio: "inherit",
	});
	if (!existsSync(stagedCliAppBinary)) {
		throw new Error(`[prepare-pack] compiled cli-app binary missing after stage: ${stagedCliAppBinary}`);
	}
	try {
		chmodSync(stagedCliAppBinary, 0o755);
	} catch {
		// best effort on Windows / FAT
	}
}

// =============================================================================
// Sandbox binaries (extraResources)
// =============================================================================
//
// Sandbox executables live under Resources/sandbox/<platform>/ so the Electron
// main process can resolve them from process.resourcesPath after packaging.
// 来源目录缺失时下面的 staged 会被静默跳过，产物于是没有沙盒（BUG-0022）——末尾的
// 守卫专门把这件事喊出来，但刻意不让构建失败。
const stagedSandboxDir = join(buildStageDir, "sandbox");
mkdirSync(stagedSandboxDir, { recursive: true });
if (existsSync(runtimeCoreWindowsSandboxDir)) {
	const stagedWindowsSandboxDir = join(stagedSandboxDir, "windows");
	mkdirSync(stagedWindowsSandboxDir, { recursive: true });
	cpSync(runtimeCoreWindowsSandboxDir, stagedWindowsSandboxDir, { recursive: true });

	for (const file of readdirSync(stagedWindowsSandboxDir)) {
		const binaryPath = join(stagedWindowsSandboxDir, file);
		if (!existsSync(binaryPath)) continue;
		try {
			chmodSync(binaryPath, 0o755);
		} catch {
			// best effort on Windows / FAT
		}
	}
}

if (existsSync(runtimeCoreSandboxDir)) {
	const stagedLinuxSandboxDir = join(stagedSandboxDir, "linux");
	mkdirSync(stagedLinuxSandboxDir, { recursive: true });
	cpSync(runtimeCoreSandboxDir, stagedLinuxSandboxDir, { recursive: true });

	for (const arch of readdirSync(stagedLinuxSandboxDir)) {
		const binaryPath = join(stagedLinuxSandboxDir, arch, "bwrap");
		if (!existsSync(binaryPath)) continue;
		try {
			chmodSync(binaryPath, 0o755);
		} catch {
			// best effort on Windows / FAT
		}
	}
}

// 「声明要打包该平台、却没有 staged 任何该平台沙盒二进制」= 发一个没有沙盒的包。
// 清单缺失（外部分叉）或非受控清单平台仍走这条告警路径；win32 的受控清单校验在下面。
for (const gap of collectMissingSandboxBinaries({
	declaredFamilies: resolvePlatformFamilies(),
	sourceDirs: { win32: runtimeCoreWindowsSandboxDir, linux: runtimeCoreSandboxDir },
})) {
	console.warn(formatSandboxStagingWarning(gap));
}

// 受控清单校验（TASK-0159 / BUG-0022 的 A 项）：目录非空不再等于「有沙盒」——三个受控 exe
// 必须存在且 SHA-256 与清单一致，否则默认阻断构建；只有显式
// VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1 才降级为告警。
const windowsSandboxArtifacts = assessWindowsSandboxArtifacts({
	declaredFamilies: resolvePlatformFamilies(),
	manifestPath: windowsSandboxManifestPath,
	sourceDir: runtimeCoreWindowsSandboxDir,
});
if (windowsSandboxArtifacts.message) {
	if (windowsSandboxArtifacts.enforcement === "block") {
		throw new Error(windowsSandboxArtifacts.message);
	}
	console.warn(windowsSandboxArtifacts.message);
}

// =============================================================================
// 托管运行时 vendor 二进制 (extraResources) —— ADR-0011
// =============================================================================
//
// 默认不再内置：安装后由 RuntimeManager 按 manifest 后台下载到
// ~/.vetta/runtimes/（离线环境可在设置面板重试）。离分发/免网络场景可设
// VETTA_BUNDLE_VENDOR=1 恢复旧行为——把目标平台的 Node + Python 原始归档打进
// Resources/vendor/{node,python}/，首启零网络解压。
// macOS 内置的是解压目录（归档内的 Mach-O 过不了 Apple 公证），详见
// docs/desktop/macos-auto-update.md；其余平台内置原始归档。
//
// 默认按构建宿主平台;跨平台打包请设 VETTA_VENDOR_PLATFORM,取值与
// src/main/runtimes/manifest.json 的 platforms 键一致(如 darwin-arm64 /
// win32-x64 / linux-x64)。
async function stageVendorRuntimes() {
	const bundle = process.env.VETTA_BUNDLE_VENDOR === "1" && process.env.VETTA_SKIP_VENDOR !== "1";
	if (!bundle) {
		console.log("[prepare-pack] vendor runtimes not bundled (downloaded post-install)");
		return;
	}
	const platformTag = process.env.VETTA_VENDOR_PLATFORM || `${process.platform}-${process.arch}`;
	const stagedVendorDir = join(buildStageDir, "vendor");
	const archives = await prepareVendorRuntimes({ platformTag });
	for (const { type, def, entry, archivePath } of archives) {
		const destTypeDir = join(stagedVendorDir, type);
		rmSync(destTypeDir, { recursive: true, force: true });
		mkdirSync(destTypeDir, { recursive: true });

		// macOS 必须内置解压目录：electron-builder 只签得到文件系统上可见的 Mach-O，
		// 而 Apple 公证服务会解开归档递归校验，归档内的 python/node 二进制一律被判
		// 「未签名 / 无安全时间戳 / 未启用 hardened runtime」。解压后 osx-sign 会像
		// 处理 im-gateway、cli-app 那样逐个签名。详见 docs/desktop/macos-auto-update.md。
		//
		// 其余平台保留上游原始归档，避免每个桌面版本都让 Inno 重建数千个不变小文件；
		// RuntimeManager 仅在托管运行时缺失或升级时解压一次。
		if (platformTag.startsWith("darwin-")) {
			execFileSync("tar", ["-xf", archivePath, "-C", destTypeDir], { stdio: "inherit" });
			const extractedDir = join(destTypeDir, entry.dir);
			if (!existsSync(extractedDir)) {
				throw new Error(`[prepare-pack] vendor ${type} 解压后未找到预期目录: ${extractedDir}`);
			}
			console.log(`[prepare-pack] vendor ${type} ${def.version} extracted -> ${extractedDir}`);
			continue;
		}

		const stagedArchivePath = join(destTypeDir, entry.filename);
		cpSync(archivePath, stagedArchivePath);
		console.log(`[prepare-pack] vendor ${type} ${def.version} archive staged -> ${stagedArchivePath}`);
	}
}

await stageVendorRuntimes();

// =============================================================================
// 内置 MCP servers（extraResources）
// =============================================================================
//
// 能力页「内置」连接器不再依赖 npx 现装：vendor/mcp-servers/<id>/ 下是
// fetch-mcp-servers.mjs 预装好的完整依赖树（含裁剪与 node:sqlite 垫片），
// 运行时以 ELECTRON_RUN_AS_NODE=1 + process.execPath 拉起（见
// src/main/mcp/builtin-mcp-server-runtime.ts）。缺失视为打包失败——静默退回
// npx 会让产物退化成「联网装依赖」的旧行为。
const stagedMcpServersDir = join(buildStageDir, "mcp-servers");
rmSync(stagedMcpServersDir, { recursive: true, force: true });
await prepareMcpServers();
for (const entry of readdirSync(MCP_SERVERS_VENDOR_ROOT)) {
	const src = join(MCP_SERVERS_VENDOR_ROOT, entry);
	if (!existsSync(join(src, "node_modules"))) continue;
	cpSync(src, join(stagedMcpServersDir, entry), { recursive: true });
	console.log(`[prepare-pack] mcp-server staged: ${entry}`);
}
if (!existsSync(stagedMcpServersDir) || readdirSync(stagedMcpServersDir).length === 0) {
	throw new Error("[prepare-pack] mcp-servers staging is empty; run scripts/fetch-mcp-servers.mjs first");
}

// =============================================================================
// 系统插件（extraResources）—— ADR-0024
// =============================================================================
//
// build:presets 已为每个 preset 生成 release/<id>-<version>.vettapkg。打包阶段只消费
// zip 制品，校验后解压到 Resources/system-plugins/<id>/，不读取源码 dist。
// 按 profile + 租户筛选打包进 App 的系统插件。
console.log(
	`[prepare-pack] 系统插件 profile=${pluginSelection.profile ?? "(未配置)"}，租户=${pluginSelection.name ?? "(未配置)"}：${
		pluginSelection.pluginIds ? [...pluginSelection.pluginIds].join(", ") : "(全部 preset)"
	}`,
);
stageSystemPluginsFromArchives(join(buildStageDir, "system-plugins"), "prepare-pack", {
	pluginIds: pluginSelection.pluginIds ?? undefined,
});
stageSystemThemesFromArchives(join(buildStageDir, "system-themes"), "prepare-pack");
stageSystemSkills(join(buildStageDir, "system-skills"), "prepare-pack");

function resolveExtraResources() {
	const extraResources = [
		{
			from: "im-gateway",
			to: "im-gateway",
			filter: ["im-gateway-*"],
		},
		{
			from: "ssh-helper",
			to: "ssh-helper",
			filter: ["**/*"],
		},
		{
			from: "coding-agent",
			to: "coding-agent",
			filter: ["**/*", "!**/*.map"],
		},
		{
			from: "cli-app",
			to: "cli-app",
			filter: ["**/*"],
		},
		...(existsSync(join(buildStageDir, "vendor"))
			? [{ from: "vendor", to: "vendor", filter: ["**/*", "!**/*.pdb"] }]
			: []),
		{
			from: "mcp-servers",
			to: "mcp-servers",
			filter: ["**/*", "!**/*.map", "!**/*.ts"],
		},
		{
			from: "system-plugins",
			to: "system-plugins",
			filter: ["**/*"],
		},
		{
			from: "system-skills",
			to: "system-skills",
			filter: ["**/*"],
		},
		{
			from: "system-themes",
			to: "system-themes",
			filter: ["**/*"],
		},
		{
			from: "build",
			to: "build",
			filter: resolveBuildResourceFilters(resolvePlatformFamilies()),
		},
	];
	extraResources.push({ ...DESKTOP_LEGAL_RESOURCE, filter: [...DESKTOP_LEGAL_RESOURCE.filter] });
	const sandboxFilters = resolveSandboxResourceFilters();
	if (sandboxFilters.length > 0) {
		extraResources.push({
			from: "sandbox",
			to: "sandbox",
			filter: sandboxFilters,
		});
	}
	// "Open Forge Computer Use.app" 仅 darwin 目标需要，且仅 darwin host 能编译（见上方 staging）。
	if (resolvePlatformFamilies().has("darwin") && process.platform === "darwin") {
		extraResources.push({
			from: "appshot",
			to: "appshot",
			filter: ["**/*"],
		});
	}
	if (existsSync(join(buildStageDir, "speech-models"))) {
		extraResources.push({
			from: "speech-models",
			to: "speech-models",
			filter: ["**/*"],
		});
	}
	return extraResources;
}

const extraResources = resolveExtraResources();

// Write electron-builder config
const builderConfig = {
	appId: "io.github.hxquanq.openforge",
	productName: desktopBrand.displayName,
	executableName: desktopBrand.executableName,
	afterPack: join(projectRoot, "scripts", "windows-version-layout.mjs"),
	electronVersion,
	electronLanguages: ["zh-CN", "en-US"],
	npmRebuild: false,
	...(updatePublishConfig ? { publish: [updatePublishConfig] } : {}),
	...(releaseInfo ? { releaseInfo } : {}),
	files: ["**/*", ...extraResources.map(({ from }) => `!${from}/**/*`)],
	protocols: {
		name: desktopBrand.displayName,
		schemes: ["openforge"],
	},
	fileAssociations: [VETTA_PLUGIN_FILE_ASSOCIATION],
	mac: {
		target: ["dmg", "zip"],
		category: "public.app-category.productivity",
		icon: "build/icon.icns",
		// 签名/公证开关由 resolveMacSigning() 按环境变量决定（见
		// docs/deploy/apple-code-signing.md）：凭据齐全 → Developer ID 签名 +
		// hardened runtime + 公证；一个都不设 → 维持未签名产物，配套 DMG 里的
		// 「修复已损坏.app」。签名身份由 electron-builder 从 CSC_LINK / CSC_NAME
		// 自动发现，因此签名分支不写 identity。
		...(macSigning.enabled
			? {
					hardenedRuntime: true,
					gatekeeperAssess: false,
					entitlements: "build/entitlements.mac.plist",
					entitlementsInherit: "build/entitlements.mac.inherit.plist",
					// electron-builder 26 起 notarize 只接受布尔值，团队与密钥
					// 一律从 APPLE_TEAM_ID / APPLE_API_* 环境变量读取。
					notarize: macSigning.notarize,
				}
			: {
					identity: null,
					notarize: false,
					hardenedRuntime: false,
				}),
		// 用户的本地模型（Ollama / LM Studio / vLLM 等）通常监听在局域网
		// 明文 HTTP（http://192.168.x.x:port）。macOS 14+ 的 TCC 与 ATS 默认
		// 会静默拦截这种请求，表现为 Finder 双击启动后随机出现 "Connection
		// error."，而从终端启动 Open Forge 时 launchd context 不同会偶发放行。
		// 三个 key 缺一不可：
		//   - NSAppTransportSecurity.NSAllowsLocalNetworking：放开局域网明文 HTTP
		//   - NSLocalNetworkUsageDescription：macOS 14+ 触发本地网络权限弹窗
		//   - NSBonjourServices：协助 TCC 识别 app 需要本地网络访问
		extendInfo: {
			NSAppTransportSecurity: {
				NSAllowsLocalNetworking: true,
			},
			NSLocalNetworkUsageDescription:
				`${desktopBrand.displayName} 需要访问本地网络以连接你在局域网内运行的 AI 模型服务（如 Ollama、LM Studio、vLLM 等）。`,
			NSBonjourServices: ["_http._tcp", "_https._tcp"],
		},
	},
	// DMG 视觉与图标布局。详见 docs/adr/0003-dmg-repair-helper.md。
	// 坐标以 @1x 660×440 为准；背景图 build/background.png 与 build/background@2x.png
	// 由 scripts/generate-dmg-background.js 在 prebuild 阶段生成（两种版式的图标
	// 位置必须与那里的 ICON_CENTERS_X_2X 对齐）。
	// 未签名构建为三图标：多出的「修复已损坏.app」由 scripts/build-mac-repair-helper.js
	// osacompile 生成，用户首次需 control-click → 「打开」绕过 Gatekeeper，
	// 之后弹原生密码框对 /Applications/Open Forge.app 执行 xattr -dr com.apple.quarantine。
	// 签名+公证构建不存在「已损坏」问题，退回两图标常规版式。
	dmg: {
		background: "build/background.png",
		window: { width: 660, height: 440 },
		iconSize: 100,
		iconTextSize: 12,
		contents: macSigning.enabled
			? [
					{ x: 180, y: 200, type: "file" }, // Open Forge.app（electron-builder 自动填入产物路径）
					{ x: 480, y: 200, type: "link", path: "/Applications" },
				]
			: [
					{ x: 100, y: 200, type: "file" },
					{ x: 330, y: 200, type: "link", path: "/Applications" },
					{ x: 560, y: 200, type: "file", path: join(buildStageDir, "build", "修复已损坏.app") },
				],
	},
	win: {
		target: ["dir"],
		artifactName: "${productName}-${version}-win-${arch}.${ext}",
		icon: "build/icon.ico",
	},
	linux: {
		target: LINUX_RELEASE_TARGETS,
		category: "Utility",
		description: `${desktopBrand.displayName} AI agent desktop application`,
		icon: "build/icon.png",
		maintainer: LINUX_PACKAGE_METADATA.maintainer,
		synopsis: "AI agent desktop application",
		vendor: LINUX_PACKAGE_METADATA.vendor,
	},
	deb: { packageName: "openforge" },
	rpm: { packageName: "openforge" },
	// Sidecar binaries are picked up from the staged ./im-gateway dir
	// (populated above by the cross-build step).
	extraResources,
	directories: {
		output: join(projectRoot, "release"),
	},
	asar: true,
	disableSanityCheckAsar: resolvePlatformFamilies().has("win32"),
	// photon-node 是 createRequire 加载的 external 包，其 photon_rs_bg.wasm
	// 通过 readFileSync(__dirname + "/photon_rs_bg.wasm") 读取。asar 虚拟
	// 文件系统对 readFileSync 透明，但 wasm 这类二进制在部分 Electron 版本
	// 上偶尔出问题（photon.ts 已经有 fallback paths 兜底，但能避免就避免）。
	// 直接 unpack 到 app.asar.unpacked/，让 wasm 落到真实文件系统。
	//
// uiohook-napi / electron-liquid-glass / Sherpa-ONNX 加载预编译 .node。
	// dlopen 无法从 asar 虚拟文件系统加载原生模块，必须整包 unpack 到真实磁盘，
	// 否则 packaged 环境 require 即失败（electron-liquid-glass 仅 mac 包内存在）。
	//
	// OCR runner 包含稳定且可高度压缩的 WASM / ONNX 资源。将其放入
	// app.asar.unpacked 后 Electron 仍可透明读取，同时 Windows Inno 能按文件
	// 使用 LZMA2 压缩，避免未压缩的 app.asar 直接抬高完整安装包体积。
	asarUnpack: [
		"ocr-runner/**/*",
		...packagedNativeDependencies.asarUnpack,
	],
};
writeFileSync(join(buildStageDir, "electron-builder.json"), JSON.stringify(builderConfig, null, "\t") + "\n");

console.log(`build staged at: ${buildStageDir}`);
