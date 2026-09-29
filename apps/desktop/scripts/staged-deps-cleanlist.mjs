// Modified by The Open Forge contributors.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * staged node_modules 清洗清单（VS Code `build/.moduleignore` /
 * `.moduleignore.<platform>` 两级清单的等价物）。
 *
 * `prepare-pack.js` 把外部化运行时依赖整包复制进 `staging/node_modules`，
 * electron-builder 再把它塞进 `app.asar`；依赖包里的测试、文档、构建脚本、
 * 调试符号和异平台预编译二进制因此都会进安装包（koffi 单个包就带 18 个平台目录）。
 * 规则集中声明在这里，`prepare-pack.js` 的 staging 与 `verify-staged-deps.mjs`
 * 的产物断言共用同一份实现，避免两处各写一份。
 *
 * 安全顺序不可颠倒：
 * 1. `STAGED_DEP_KEEP_PATTERNS` 先判，命中即保留（LICENSE/NOTICE/`*.d.ts` 压过裁剪规则）；
 * 2. 只裁剪显式声明的模式，未命中的文件一律保留；
 * 3. 运行时入口（`package.json`、`.js`/`.cjs`/`.mjs`/`.json`/`.node`/`.wasm`）只允许在
 *    测试目录、文档目录、异平台目录或「已确认入口不在其中」的 native 源码目录里被裁掉，
 *    其余情况由 `findStagedDepStrippingViolations` 判为违规。
 */

/** 任何裁剪规则都不得覆盖这些文件：许可证合规与类型声明不属于可裁剪体积。 */
export const STAGED_DEP_KEEP_PATTERNS = Object.freeze([
	"LICENSE*",
	"LICENCE*",
	"NOTICE*",
	"COPYING*",
	"AUTHORS*",
	"*.d.ts",
]);

/**
 * 跨平台一律裁剪的规则。
 *
 * `category` 同时是安全分类：`findStagedDepStrippingViolations` 用它判断
 * 「被裁掉的运行时文件」是否属于允许的分类。
 */
export const STAGED_DEP_STRIP_PATTERNS = Object.freeze([
	// 测试、覆盖率与基准目录：里面的 *.js 是测试实现，不是包入口。
	{ pattern: "test/", category: "test-directory" },
	{ pattern: "tests/", category: "test-directory" },
	{ pattern: "__tests__/", category: "test-directory" },
	{ pattern: "__mocks__/", category: "test-directory" },
	{ pattern: "spec/", category: "test-directory" },
	{ pattern: "specs/", category: "test-directory" },
	{ pattern: "coverage/", category: "test-directory" },
	{ pattern: ".nyc_output/", category: "test-directory" },
	// 文档、示例与托管平台配置。
	{ pattern: "docs/", category: "documentation" },
	{ pattern: "doc/", category: "documentation" },
	{ pattern: "example/", category: "documentation" },
	{ pattern: "examples/", category: "documentation" },
	{ pattern: "samples/", category: "documentation" },
	{ pattern: "benchmark/", category: "documentation" },
	{ pattern: "benchmarks/", category: "documentation" },
	{ pattern: ".github/", category: "documentation" },
	{ pattern: ".circleci/", category: "documentation" },
	{ pattern: ".vscode/", category: "documentation" },
	{ pattern: "*.md", category: "documentation" },
	{ pattern: "*.markdown", category: "documentation" },
	{ pattern: "CHANGELOG*", category: "documentation" },
	{ pattern: "CHANGES*", category: "documentation" },
	{ pattern: "HISTORY*", category: "documentation" },
	{ pattern: "CONTRIBUTING*", category: "documentation" },
	{ pattern: "CODE_OF_CONDUCT*", category: "documentation" },
	// 构建脚本与包元数据：只在开发机构建时需要。
	{ pattern: "binding.gyp", category: "build-script" },
	{ pattern: "*.gyp", category: "build-script" },
	{ pattern: "*.gypi", category: "build-script" },
	{ pattern: "CMakeLists.txt", category: "build-script" },
	{ pattern: "Makefile", category: "build-script" },
	{ pattern: "*.mk", category: "build-script" },
	{ pattern: "*.cmake", category: "build-script" },
	{ pattern: "*.vcxproj", category: "build-script" },
	{ pattern: "*.vcxproj.filters", category: "build-script" },
	{ pattern: "*.sln", category: "build-script" },
	{ pattern: "*.podspec", category: "build-script" },
	{ pattern: "tsconfig*.json", category: "build-script" },
	{ pattern: "jest.config*", category: "build-script" },
	{ pattern: "vitest.config*", category: "build-script" },
	// ESLint 的 JS 形态配置：只在开发期被 ESLint 加载，运行时永远不会 require。
	// 单列 lint-config 分类：它们带 .js/.cjs 运行时扩展名，落进 build-script
	// 会被入口守卫判为「运行时文件被不安全分类裁剪」（首个命中的是 ssh2）。
	{ pattern: ".eslintrc.js", category: "lint-config" },
	{ pattern: ".eslintrc.cjs", category: "lint-config" },
	{ pattern: ".eslintrc*", category: "build-script" },
	{ pattern: ".prettierrc*", category: "build-script" },
	{ pattern: ".babelrc*", category: "build-script" },
	{ pattern: ".nycrc*", category: "build-script" },
	{ pattern: ".npmignore", category: "build-script" },
	{ pattern: ".gitignore", category: "build-script" },
	{ pattern: ".gitattributes", category: "build-script" },
	{ pattern: ".editorconfig", category: "build-script" },
	{ pattern: ".travis.yml", category: "build-script" },
	{ pattern: "appveyor.yml", category: "build-script" },
	// 链接期与调试产物：运行时只加载 *.node，不需要导入库、静态库或符号文件。
	{ pattern: "*.exp", category: "link-artifact" },
	{ pattern: "*.lib", category: "link-artifact" },
	{ pattern: "*.a", category: "link-artifact" },
	{ pattern: "*.pdb", category: "debug-symbol" },
	{ pattern: "*.ipdb", category: "debug-symbol" },
	{ pattern: "*.map", category: "debug-symbol" },
	// 源码与类型源文件：运行时读的是编译产物。`*.d.ts` 由保留规则兜底。
	{ pattern: "*.ts", category: "source-file" },
	{ pattern: "*.tsx", category: "source-file" },
	{ pattern: "*.tsbuildinfo", category: "source-file" },
	{ pattern: "*.flow", category: "source-file" },
	{ pattern: "*.coffee", category: "source-file" },
]);

/**
 * native 包专属裁剪：带预编译二进制的包把 C/C++ 源码也发进 npm 包
 * （koffi 的 `src/` + `vendor/` 约 1.1MB，uiohook-napi 的 `src/` + `libuiohook/` 约 0.5MB）。
 * 只在包内确实存在 `*.node` 二进制、且所有声明入口都不落在这些目录里时才生效。
 */
export const STAGED_DEP_NATIVE_SOURCE_DIRECTORIES = Object.freeze(["src/", "deps/", "vendor/"]);

/**
 * 平台变体清单（对应 `.moduleignore.<platform>`）。
 *
 * `prebuilds/<os>-<arch>`（node-gyp-build / prebuildify）与
 * `build/koffi/<os>_<arch>`（koffi 的 triplet 目录）都按 OS 分目录，运行时的
 * `process.platform` 只可能命中本产物那一个；其余目录是本产物永远加载不到的字节。
 * `musl` 归入 linux（Alpine 产物），glibc 产物多带一个目录也无害。
 */
export const STAGED_DEP_PLATFORM_ALIASES = Object.freeze({
	darwin: Object.freeze(["darwin"]),
	win32: Object.freeze(["win32"]),
	linux: Object.freeze(["linux", "musl"]),
});

const NATIVE_DIRECTORY_TOKENS = Object.freeze({
	prebuilds: Object.freeze(["darwin", "linux", "musl", "win32", "freebsd", "openbsd", "sunos", "aix", "android"]),
	"build/koffi": Object.freeze(["darwin", "linux", "musl", "win32", "freebsd", "openbsd"]),
});

const FOREIGN_BINARY_EXTENSIONS = Object.freeze({
	darwin: Object.freeze(["*.dll", "*.so", "*.so.*"]),
	win32: Object.freeze(["*.dylib", "*.so", "*.so.*"]),
	linux: Object.freeze(["*.dll", "*.dylib"]),
});

function buildPlatformPatterns(platform) {
	const keepTokens = STAGED_DEP_PLATFORM_ALIASES[platform];
	if (!keepTokens) throw new Error(`[staged-deps-cleanlist] unsupported platform: ${platform}`);
	const patterns = [];
	for (const [directory, tokens] of Object.entries(NATIVE_DIRECTORY_TOKENS)) {
		const separator = directory === "prebuilds" ? "-" : "_";
		for (const token of tokens) {
			if (keepTokens.includes(token)) continue;
			patterns.push(`${directory}/${token}${separator}*/`);
		}
	}
	patterns.push(...FOREIGN_BINARY_EXTENSIONS[platform]);
	return Object.freeze(patterns);
}

export const STAGED_DEP_PLATFORM_STRIP_PATTERNS = Object.freeze({
	darwin: buildPlatformPatterns("darwin"),
	win32: buildPlatformPatterns("win32"),
	linux: buildPlatformPatterns("linux"),
});

/** 运行时可能被 `require` 加载的扩展名：被裁掉时必须能给出安全分类。 */
const RUNTIME_FILE_EXTENSIONS = Object.freeze([
	".js",
	".cjs",
	".mjs",
	".json",
	".node",
	".wasm",
	".dll",
	".dylib",
	".so",
	".onnx",
	".bin",
	".dat",
]);

const RUNTIME_SAFE_CATEGORIES = Object.freeze([
	"test-directory",
	"documentation",
	"foreign-platform",
	"native-source",
	"lint-config",
]);

export function normalizeStagedPath(value) {
	return value.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function segmentSource(segment) {
	return segment
		.split("*")
		.map((part) => escapeRegExp(part))
		.join("[^/]*");
}

function compilePattern(pattern) {
	const isDirectory = pattern.endsWith("/");
	const body = normalizeStagedPath(isDirectory ? pattern.slice(0, -1) : pattern);
	return {
		pattern,
		isDirectory,
		anchored: body.includes("/"),
		regex: new RegExp(`^${body.split("/").map(segmentSource).join("/")}$`, "i"),
	};
}

const COMPILED_KEEP_PATTERNS = STAGED_DEP_KEEP_PATTERNS.map((pattern) => compilePattern(pattern));

function ancestorPaths(path) {
	const segments = path.split("/").slice(0, -1);
	return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function matchesCompiledPath(compiled, path, { includeSelf = true } = {}) {
	if (compiled.isDirectory) {
		// 目录规则匹配「任意一级祖先目录」。树里的目录路径本身也可以命中
		// （`prebuilds/win32-x64`），但文件清单里的条目只按祖先判定，
		// 避免把同名无扩展名文件误当成目录裁掉。
		const candidates = includeSelf ? [path, ...ancestorPaths(path)] : ancestorPaths(path);
		for (const candidate of candidates) {
			const scoped = compiled.anchored ? candidate : candidate.slice(candidate.lastIndexOf("/") + 1);
			if (compiled.regex.test(scoped)) return true;
		}
		return false;
	}
	if (compiled.anchored) return compiled.regex.test(path);
	return compiled.regex.test(path.slice(path.lastIndexOf("/") + 1));
}

export function matchesStagedDepPattern(pattern, path, options) {
	return matchesCompiledPath(compilePattern(pattern), normalizeStagedPath(path), options);
}

/** 保留规则优先：命中即永不被裁。 */
export function isStagedDepPathKept(path) {
	const normalized = normalizeStagedPath(path);
	return COMPILED_KEEP_PATTERNS.some((compiled) => matchesCompiledPath(compiled, normalized));
}

function findStripRule(rules, path) {
	// 这里判定的都是文件条目，目录规则只按祖先匹配。
	for (const rule of rules) {
		if (matchesCompiledPath(compilePattern(rule.pattern), path, { includeSelf: false })) return rule;
	}
	return undefined;
}

/** 运行时真正 dlopen 的二进制扩展名：只有它们受「目标平台文件必须活着」保护。 */
const NATIVE_ARTIFACT_EXTENSIONS = Object.freeze([".node", ".dll", ".dylib", ".so", ".wasm"]);

function isNativeArtifact(path) {
	const lower = path.toLowerCase();
	return NATIVE_ARTIFACT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isTargetPlatformArtifact(path, platforms) {
	if (!isNativeArtifact(path)) return false;
	for (const segment of path.split("/").slice(0, -1)) {
		const token = segment.split(/[-_]/)[0].toLowerCase();
		for (const platform of platforms) {
			if (STAGED_DEP_PLATFORM_ALIASES[platform]?.includes(token)) return true;
		}
	}
	return false;
}

/**
 * 计算一个依赖包目录的裁剪计划（纯函数：只读入文件清单与 package.json）。
 *
 * `platforms` 为空时不裁平台变体目录——宁可多带 bytes，也不在目标平台未知时误删。
 */
export function planStagedDepStripping({ filePaths, platforms = [], packageJson = {} }) {
	const targetPlatforms = [...new Set(platforms)];
	const normalizedPaths = filePaths.map(normalizeStagedPath).filter((path) => path.length > 0);
	const nativePackage = normalizedPaths.some((path) => path.toLowerCase().endsWith(".node"));
	const entryPaths = declaredEntryPaths(packageJson);
	const rules = [...STAGED_DEP_STRIP_PATTERNS];

	if (nativePackage) {
		const entriesOutsideNativeSources = entryPaths.every((entry) =>
			STAGED_DEP_NATIVE_SOURCE_DIRECTORIES.every((directory) => !entry.startsWith(directory)),
		);
		if (entriesOutsideNativeSources) {
			for (const pattern of STAGED_DEP_NATIVE_SOURCE_DIRECTORIES) {
				rules.push({ pattern, category: "native-source" });
			}
		}
	}
	for (const platform of targetPlatforms) {
		for (const pattern of STAGED_DEP_PLATFORM_STRIP_PATTERNS[platform] ?? []) {
			rules.push({ pattern, category: "foreign-platform" });
		}
	}

	const ruleByPath = new Map();
	for (const path of normalizedPaths) {
		if (isStagedDepPathKept(path)) continue;
		const rule = findStripRule(rules, path);
		if (rule) ruleByPath.set(path, rule);
	}

	const totalByDirectory = new Map();
	const strippedByDirectory = new Map();
	const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
	for (const path of normalizedPaths) {
		for (const ancestor of ancestorPaths(path)) bump(totalByDirectory, ancestor);
	}
	for (const path of ruleByPath.keys()) {
		for (const ancestor of ancestorPaths(path)) bump(strippedByDirectory, ancestor);
	}
	const prunedDirectories = new Set(
		[...totalByDirectory.keys()].filter(
			(directory) => strippedByDirectory.get(directory) === totalByDirectory.get(directory),
		),
	);

	return {
		platforms: targetPlatforms,
		filePaths: normalizedPaths,
		prunedDirectories,
		strippedPaths: new Set(ruleByPath.keys()),
		rules,
		ruleForPath: (path) => ruleByPath.get(normalizeStagedPath(path)),
	};
}

/** 裁剪计划对单条路径的判定：整目录被裁或该文件被裁都返回 true。 */
export function isStrippedByPlan(plan, path) {
	const normalized = normalizeStagedPath(path);
	if (!normalized) return false;
	if (plan.prunedDirectories.has(normalized) || plan.strippedPaths.has(normalized)) return true;
	return ancestorPaths(normalized).some((ancestor) => plan.prunedDirectories.has(ancestor));
}

/**
 * 清洗后的树不允许再含黑名单命中：命中即说明这条路径没被裁掉
 * （规则漏配、清单被绕过，或复制时没带 filter）。
 */
export function findBlacklistedStagedPaths({ filePaths, platforms = [], packageJson = {} }) {
	const plan = planStagedDepStripping({ filePaths, platforms, packageJson });
	return [...plan.strippedPaths].sort();
}

/**
 * 安全不变量：清洗只能删掉「确定不是运行时入口」的东西。
 *
 * 1. `package.json`、声明入口与保留规则命中的文件必须活着；
 * 2. 运行时扩展名文件只允许出现在测试/文档/异平台/native 源码这些分类里；
 * 3. 目标平台的二进制（`prebuilds/win32-x64/*.node`、`build/koffi/win32_x64/*.node` 等）必须活着。
 */
export function findStagedDepStrippingViolations({ filePaths = [], plan, packageJson = {}, label = "dependency" }) {
	const violations = [];
	const normalizedPaths = filePaths.map(normalizeStagedPath);
	const present = new Set(normalizedPaths);
	const stripped = (path) => isStrippedByPlan(plan, path);

	if (present.has("package.json") && stripped("package.json")) {
		violations.push(`${label}: package.json would be stripped`);
	}
	for (const entry of declaredEntryPaths(packageJson)) {
		if (present.has(entry) && stripped(entry)) {
			violations.push(`${label}: declared entry would be stripped: ${entry}`);
		}
	}
	for (const path of normalizedPaths) {
		if (!isStagedDepPathKept(path)) continue;
		if (stripped(path)) violations.push(`${label}: keep-listed file would be stripped: ${path}`);
	}
	for (const path of normalizedPaths) {
		if (!stripped(path) || !hasRuntimeExtension(path)) continue;
		const rule = plan.ruleForPath(path);
		if (rule && RUNTIME_SAFE_CATEGORIES.includes(rule.category)) continue;
		const category = rule ? rule.category : "no matching rule";
		violations.push(`${label}: runtime file stripped by ${category}: ${path}`);
	}
	for (const path of normalizedPaths) {
		if (!isTargetPlatformArtifact(path, plan.platforms ?? [])) continue;
		if (stripped(path)) violations.push(`${label}: target platform artifact would be stripped: ${path}`);
	}
	return violations;
}

/**
 * 构建期硬断言：清洗计划一旦碰到运行时入口就立刻失败，而不是把破损的依赖打进安装包。
 */
export function assertStagedDependencyPlan({ label, filePaths, plan, packageJson = {} }) {
	const violations = findStagedDepStrippingViolations({ filePaths, plan, packageJson, label });
	if (violations.length > 0) {
		throw new Error(
			`[staged-deps-cleanlist] ${violations.length} violation(s):\n- ${violations.join("\n- ")}`,
		);
	}
}

/** 列出包目录内的全部文件（相对包根的 POSIX 路径）。符号链接按文件处理，避免漏计。 */
export function listStagedDepFiles(rootDirectory) {
	const files = [];
	const walk = (currentDirectory, relativeDirectory) => {
		for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
			const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
			if (entry.isDirectory()) walk(join(currentDirectory, entry.name), relativePath);
			else files.push(relativePath);
		}
	};
	walk(rootDirectory, "");
	return files;
}

export function readStagedDepFileSizes(rootDirectory, filePaths) {
	const sizes = new Map();
	for (const relativePath of filePaths) {
		try {
			sizes.set(relativePath, statSync(join(rootDirectory, relativePath)).size);
		} catch {
			sizes.set(relativePath, 0);
		}
	}
	return sizes;
}

/** 裁剪前后字节数（纯函数，便于把体积证据写进交付记录）。 */
export function summarizeStagedDepCleaning({ filePaths, sizesByPath, plan }) {
	let bytes = 0;
	let keptBytes = 0;
	let keptFiles = 0;
	for (const rawPath of filePaths) {
		const path = normalizeStagedPath(rawPath);
		const size = sizesByPath.get(rawPath) ?? sizesByPath.get(path) ?? 0;
		bytes += size;
		if (!isStrippedByPlan(plan, path)) {
			keptBytes += size;
			keptFiles += 1;
		}
	}
	return {
		files: filePaths.length,
		bytes,
		keptFiles,
		keptBytes,
		strippedFiles: filePaths.length - keptFiles,
		strippedBytes: bytes - keptBytes,
	};
}

/**
 * `cpSync` 的 filter：复制外部依赖时逐条应用清洗清单。
 *
 * 传入 `packageJson` 可省一次读盘；未传时从容器的 package.json 读取
 * （native 源码目录裁剪需要声明的入口路径）。
 */
export function createStagedDepFilter({ sourceDir, platforms = [], packageJson }) {
	const resolvedPackageJson =
		packageJson ?? JSON.parse(readFileSync(join(sourceDir, "package.json"), "utf8"));
	const plan = planStagedDepStripping({
		filePaths: listStagedDepFiles(sourceDir),
		platforms,
		packageJson: resolvedPackageJson,
	});
	return createStagedDepPlanFilter({ sourceDir, plan });
}

/** 已有清洗计划时直接构造 filter，避免重复遍历包目录。 */
export function createStagedDepPlanFilter({ sourceDir, plan }) {
	return (source) => {
		const relativePath = normalizeStagedPath(relative(sourceDir, source));
		if (!relativePath) return true;
		return !isStrippedByPlan(plan, relativePath);
	};
}

/** staging 树里的包根：`node_modules/<name>`、`node_modules/@scope/<name>` 及其嵌套 `node_modules`。 */
export function listStagedPackageRoots(nodeModulesDirectory) {
	const roots = [];
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const packageRoots = [];
			if (entry.name.startsWith("@")) {
				for (const scoped of readdirSync(join(directory, entry.name), { withFileTypes: true })) {
					if (scoped.isDirectory()) packageRoots.push(join(directory, entry.name, scoped.name));
				}
			} else {
				packageRoots.push(join(directory, entry.name));
			}
			for (const packageRoot of packageRoots) {
				roots.push(packageRoot);
				const nested = join(packageRoot, "node_modules");
				if (existsSync(nested)) visit(nested);
			}
		}
	};
	visit(nodeModulesDirectory);
	return roots;
}

/**
 * 已落盘的 staging 树里仍命中黑名单的路径。
 *
 * 清洗计划在复制前已经断言过，这里是复制之后的成品校验：filter 一旦漏接
 * （清单被绕过、复制走了另一条路径），这些路径就会留下来并被点名。
 */
export function findStagedNodeModulesBlacklistHits({ nodeModulesDirectory, platforms = [] }) {
	const hits = [];
	if (!existsSync(nodeModulesDirectory)) return hits;
	for (const packageRoot of listStagedPackageRoots(nodeModulesDirectory)) {
		let packageJson;
		try {
			packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
		} catch {
			continue;
		}
		for (const hit of findBlacklistedStagedPaths({
			filePaths: listStagedDepFiles(packageRoot),
			platforms,
			packageJson,
		})) {
			hits.push(normalizeStagedPath(relative(nodeModulesDirectory, join(packageRoot, hit))));
		}
	}
	return hits;
}

/**
 * 依赖闭包 → staging 目标清单。
 *
 * 与 `prepare-pack.js` 原来的 `stageDepTree` 语义一致：先复制包本身，再把
 * `dependencies` 逐层嵌套复制到 `<owner>/node_modules/<dep>`；同一顶层包内
 * 重复出现的 `owner>dep` 只复制一次。抽出来是为了让产物断言脚本能复用
 * 同一份闭包计算，而不是各写一份。
 */
export function collectStagedDependencyTree({ roots, destinationRoot, resolvePackageRoot, fromDir }) {
	const entries = [];
	for (const root of roots) {
		const seen = new Set();
		const visit = (dep, sourceDir, destDir) => {
			entries.push({ dep, sourceDir, destDir });
			const packageJson = JSON.parse(readFileSync(join(sourceDir, "package.json"), "utf8"));
			for (const transDep of Object.keys(packageJson.dependencies ?? {})) {
				const key = `${dep}>${transDep}`;
				if (seen.has(key)) continue;
				seen.add(key);
				visit(
					transDep,
					resolvePackageRoot(transDep, sourceDir),
					join(destDir, "node_modules", transDep),
				);
			}
		};
		visit(root, resolvePackageRoot(root, fromDir), join(destinationRoot, root));
	}
	return entries;
}

const NATIVE_SOURCE_IMPORT_PATTERN = /(?:from|import|require)\s*\(?\s*["'`](\.{1,2}\/(?:src|deps|vendor)\/[^"'`]+)["'`]/g;

/** 已裁掉 native 源码目录的包里，仍活着的 JS 不得再引用这些目录。 */
export function findNativeSourceImports(source) {
	const matches = [];
	for (const match of source.matchAll(NATIVE_SOURCE_IMPORT_PATTERN)) matches.push(match[1]);
	return matches;
}


function hasRuntimeExtension(path) {
	const lower = path.toLowerCase();
	return RUNTIME_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function declaredEntryPaths(packageJson) {
	const entries = new Set();
	const collect = (value) => {
		if (typeof value === "string") {
			entries.add(normalizeStagedPath(value));
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) collect(item);
			return;
		}
		if (value && typeof value === "object") {
			for (const item of Object.values(value)) collect(item);
		}
	};
	for (const field of ["main", "module", "browser", "exports", "bin", "types"]) {
		collect(packageJson?.[field]);
	}
	return [...entries].filter((entry) => entry.length > 0 && !entry.startsWith(".."));
}

