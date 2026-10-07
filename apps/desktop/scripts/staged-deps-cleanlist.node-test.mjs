// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	collectStagedDependencyTree,
	createStagedDepFilter,
	findBlacklistedStagedPaths,
	findNativeSourceImports,
	findStagedDepStrippingViolations,
	findStagedNodeModulesBlacklistHits,
	isStrippedByPlan,
	listStagedDepFiles,
	matchesStagedDepPattern,
	normalizeStagedPath,
	planStagedDepStripping,
	summarizeStagedDepCleaning,
} from "./staged-deps-cleanlist.mjs";
import { resolveInstalledPackageRoot } from "./installed-package-root.mjs";
import { parseArguments, planStagedDependencyCleaning } from "./verify-staged-deps.mjs";

const desktopRoot = join(import.meta.dirname, "..");

function planFor(filePaths, { platforms = ["win32"], packageJson = {} } = {}) {
	return planStagedDepStripping({ filePaths, platforms, packageJson });
}

function createTempDirectory(prefix) {
	return mkdtempSync(join(tmpdir(), prefix));
}

function strippedPaths(filePaths, options) {
	return [...planFor(filePaths, options).strippedPaths].sort();
}

test("目录、文档与构建脚本规则按 gitignore 语义裁剪", () => {
	assert.deepEqual(
		strippedPaths([
			"package.json",
			"index.js",
			"test/unit.test.js",
			"tests/spec.js",
			"docs/guide.js",
			".github/workflows/ci.yml",
			"README.md",
			"CHANGELOG.md",
			"binding.gyp",
			"LICENSE",
			"LICENSE.md",
			"NOTICE",
			"index.d.ts",
			"index.js.map",
			"lib/index.js",
		]),
		[
			".github/workflows/ci.yml",
			"CHANGELOG.md",
			"README.md",
			"binding.gyp",
			"docs/guide.js",
			"index.js.map",
			"test/unit.test.js",
			"tests/spec.js",
		],
	);
});

test("保留清单压过任意裁剪规则", () => {
	for (const path of ["LICENSE", "LICENSE.md", "LICENCE", "NOTICE", "NOTICE.txt", "COPYING", "index.d.ts"]) {
		assert.equal(strippedPaths([path]).length, 0, `${path} must survive the cleanlist`);
	}
});

test("平台变体清单只裁掉本产物加载不到的目录", () => {
	const filePaths = [
		"prebuilds/win32-x64/uiohook-napi.node",
		"prebuilds/darwin-arm64/uiohook-napi.node",
		"prebuilds/linux-x64/uiohook-napi.node",
		"build/koffi/win32_x64/koffi.node",
		"build/koffi/darwin_arm64/koffi.node",
		"build/koffi/linux_x64/koffi.node",
		"build/koffi/win32_x64/koffi.lib",
	];
	const win32 = planFor(filePaths, { platforms: ["win32"] });
	assert.deepEqual([...win32.strippedPaths].sort(), [
		"build/koffi/darwin_arm64/koffi.node",
		"build/koffi/linux_x64/koffi.node",
		"build/koffi/win32_x64/koffi.lib",
		"prebuilds/darwin-arm64/uiohook-napi.node",
		"prebuilds/linux-x64/uiohook-napi.node",
	]);
	assert.equal(isStrippedByPlan(win32, "build/koffi/win32_x64/koffi.node"), false);
	assert.equal(isStrippedByPlan(win32, "prebuilds/win32-x64/uiohook-napi.node"), false);

	const darwin = planFor(filePaths, { platforms: ["darwin"] });
	assert.equal(isStrippedByPlan(darwin, "build/koffi/darwin_arm64/koffi.node"), false);
	assert.equal(isStrippedByPlan(darwin, "build/koffi/win32_x64/koffi.node"), true);

	// 目标平台未知（本地显式构建）时保留全部平台变体，宁可多带也不误删。
	const unknown = planFor(filePaths, { platforms: [] });
	assert.deepEqual([...unknown.strippedPaths].sort(), ["build/koffi/win32_x64/koffi.lib"]);
});

test("目标平台之外的动态库按扩展名裁剪", () => {
	assert.deepEqual(
		strippedPaths(["native/helper.dll", "native/helper.dylib", "native/libhelper.so", "native/libhelper.so.1"]),
		["native/helper.dylib", "native/libhelper.so", "native/libhelper.so.1"],
	);
	assert.deepEqual(
		strippedPaths(["native/helper.dll", "native/helper.dylib", "native/libhelper.so"], { platforms: ["linux"] }),
		["native/helper.dll", "native/helper.dylib"],
	);
});

test("native 源码目录只在包内确有二进制且入口不在其中时裁剪", () => {
	assert.deepEqual(
		strippedPaths(["package.json", "index.js", "build/Release/addon.node", "src/addon.cc", "vendor/napi.h"], {
			packageJson: { main: "index.js" },
		}),
		["src/addon.cc", "vendor/napi.h"],
	);

	// 入口落在 src/ 里时整个 native 源码裁剪都不生效：宁可多带源码，也不删入口。
	assert.deepEqual(
		strippedPaths(["package.json", "index.js", "build/Release/addon.node", "src/addon.cc"], {
			packageJson: { main: "src/addon.js" },
		}),
		[],
	);

	// 没有二进制的纯 JS 包不裁 src/：那里的实现可能被运行时 require。
	assert.deepEqual(
		strippedPaths(["package.json", "index.js", "src/helper.js"], { packageJson: { main: "index.js" } }),
		[],
	);
});

test("整目录命中时目录本身被裁，混合目录里的保留文件继续留在包里", () => {
	const plan = planFor(["test/a.js", "test/b.js", "test/fixture.json", "lib/index.js"]);
	assert.equal(isStrippedByPlan(plan, "test"), true);
	assert.equal(isStrippedByPlan(plan, "test/a.js"), true);
	assert.equal(isStrippedByPlan(plan, "lib"), false);
	assert.equal(isStrippedByPlan(plan, "lib/index.js"), false);
});

test("模式匹配覆盖通配、目录语义与大小写差异", () => {
	assert.equal(matchesStagedDepPattern("*.map", "dist/index.js.map"), true);
	assert.equal(matchesStagedDepPattern("build/koffi/win32_*/", "build/koffi/win32_arm64/koffi.node"), true);
	assert.equal(matchesStagedDepPattern("build/koffi/win32_*/", "build/koffi/win32_arm64"), true);
	assert.equal(matchesStagedDepPattern("build/koffi/win32_*/", "build/koffi/darwin_arm64/koffi.node"), false);
	assert.equal(matchesStagedDepPattern("*.md", "README.MD"), true);
	assert.equal(matchesStagedDepPattern("test/", "nested/test/case.js"), true);
	assert.equal(matchesStagedDepPattern("test/", "nested/latest/case.js"), false);
});

test("运行时文件的裁剪必须落在安全分类里", () => {
	const plan = planFor(["package.json", "index.js", "test/fixture.js"]);
	assert.deepEqual(
		findStagedDepStrippingViolations({ filePaths: ["package.json", "index.js", "test/fixture.js"], plan }),
		[],
	);

	const forgedPlan = {
		platforms: ["win32"],
		strippedPaths: new Set(["index.js"]),
		prunedDirectories: new Set(),
		rules: [],
		ruleForPath: () => undefined,
	};
	assert.deepEqual(findStagedDepStrippingViolations({ filePaths: ["index.js"], plan: forgedPlan }), [
		"dependency: runtime file stripped by no matching rule: index.js",
	]);

	const strippedEntryPlan = {
		platforms: ["win32"],
		strippedPaths: new Set(["main.js"]),
		prunedDirectories: new Set(),
		rules: [],
		ruleForPath: () => ({ pattern: "test/", category: "test-directory" }),
	};
	assert.deepEqual(
		findStagedDepStrippingViolations({
			filePaths: ["package.json", "main.js"],
			plan: strippedEntryPlan,
			packageJson: { main: "main.js" },
			label: "demo",
		}),
		["demo: declared entry would be stripped: main.js"],
	);

	const unsafeCategoryPlan = {
		platforms: ["win32"],
		strippedPaths: new Set(["lib/index.js"]),
		prunedDirectories: new Set(),
		rules: [],
		ruleForPath: () => ({ pattern: "tsconfig*.json", category: "build-script" }),
	};
	assert.deepEqual(findStagedDepStrippingViolations({ filePaths: ["lib/index.js"], plan: unsafeCategoryPlan }), [
		"dependency: runtime file stripped by build-script: lib/index.js",
	]);

	const targetBinaryPlan = {
		platforms: ["win32"],
		strippedPaths: new Set(["prebuilds/win32-x64/demo.node"]),
		prunedDirectories: new Set(),
		rules: [],
		ruleForPath: () => ({ pattern: "prebuilds/darwin-*/", category: "foreign-platform" }),
	};
	assert.deepEqual(
		findStagedDepStrippingViolations({ filePaths: ["prebuilds/win32-x64/demo.node"], plan: targetBinaryPlan }),
		["dependency: target platform artifact would be stripped: prebuilds/win32-x64/demo.node"],
	);
});

test("ESLint 的 JS 形态配置按 lint-config 分类裁剪，不触发运行时入口守卫", () => {
	// ssh2 是首个带 .eslintrc.js 的运行时依赖：旧实现把它归入 build-script，
	// 与 .js 运行时扩展名组合被守卫判违规，打包在 prepare-pack 阶段硬失败。
	const filePaths = ["package.json", "index.js", "lib/ssh.js", ".eslintrc.js", ".eslintrc.cjs"];
	const plan = planFor(filePaths);

	assert.deepEqual(findStagedDepStrippingViolations({ filePaths, plan }), []);
	assert.deepEqual(
		[...plan.strippedPaths].sort(),
		[".eslintrc.cjs", ".eslintrc.js"],
	);
	assert.equal(isStrippedByPlan(plan, "index.js"), false);
	assert.equal(isStrippedByPlan(plan, "lib/ssh.js"), false);
});

test("体积汇总按裁剪计划给出清洗前后字节数", () => {
	const filePaths = ["index.js", "test/unit.js", "README.md"];
	const sizesByPath = new Map([
		["index.js", 1000],
		["test/unit.js", 400],
		["README.md", 100],
	]);
	const summary = summarizeStagedDepCleaning({ filePaths, sizesByPath, plan: planFor(filePaths) });
	assert.deepEqual(summary, {
		files: 3,
		bytes: 1500,
		keptFiles: 1,
		keptBytes: 1000,
		strippedFiles: 2,
		strippedBytes: 500,
	});
});

test("清洗后的树不再命中黑名单，未清洗的树会被点名", () => {
	const cleaned = ["index.js", "package.json", "build/Release/addon.node"];
	assert.deepEqual(findBlacklistedStagedPaths({ filePaths: cleaned, platforms: ["win32"] }), []);
	assert.deepEqual(
		findBlacklistedStagedPaths({
			filePaths: [...cleaned, "binding.gyp", "test/legacy.js", "prebuilds/darwin-arm64/uiohook-napi.node"],
			platforms: ["win32"],
		}),
		["binding.gyp", "prebuilds/darwin-arm64/uiohook-napi.node", "test/legacy.js"],
	);
});

test("识别仍引用被裁 native 源码目录的 JS", () => {
	assert.deepEqual(findNativeSourceImports('require("./src/cnoke/cnoke.js");'), ["./src/cnoke/cnoke.js"]);
	assert.deepEqual(findNativeSourceImports('import value from "../vendor/helper.js";'), ["../vendor/helper.js"]);
	assert.deepEqual(findNativeSourceImports('require("./build/koffi/win32_x64/koffi.node");'), []);
});

test("依赖闭包按 owner 的 node_modules 嵌套复制，环形依赖不会无限展开", () => {
	const root = createTempDirectory("of-staged-deps-tree-");
	const writePackage = (directory, manifest) => {
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
	};
	try {
		writePackage(join(root, "owner"), { name: "owner", dependencies: { alpha: "^1.0.0", beta: "^1.0.0" } });
		writePackage(join(root, "owner", "node_modules", "alpha"), { name: "alpha", dependencies: { beta: "^1.0.0" } });
		writePackage(join(root, "owner", "node_modules", "beta"), { name: "beta", dependencies: { alpha: "^1.0.0" } });

		const entries = collectStagedDependencyTree({
			roots: ["owner"],
			destinationRoot: "/staging/node_modules",
			fromDir: root,
			// 固定 fixture 的解析结果，单独验证闭包遍历本身（真实解析由上面的集成用例覆盖）。
			resolvePackageRoot: (dep) => {
				for (const candidate of [join(root, dep), join(root, "owner", "node_modules", dep)]) {
					if (existsSync(candidate)) return candidate;
				}
				throw new Error(`fixture is missing ${dep}`);
			},
		});
		assert.deepEqual(
			entries.map((entry) => [entry.dep, normalizeStagedPath(entry.destDir)]),
			[
				["owner", "/staging/node_modules/owner"],
				["alpha", "/staging/node_modules/owner/node_modules/alpha"],
				["beta", "/staging/node_modules/owner/node_modules/alpha/node_modules/beta"],
				["alpha", "/staging/node_modules/owner/node_modules/alpha/node_modules/beta/node_modules/alpha"],
				["beta", "/staging/node_modules/owner/node_modules/beta"],
			],
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("cpSync 过滤器按清洗计划落盘，且不动目录外的文件", () => {
	const root = createTempDirectory("of-staged-deps-copy-");
	const source = join(root, "source");
	const destination = join(root, "destination");
	const writeFile = (relativePath, contents) => {
		const target = join(source, relativePath);
		mkdirSync(join(target, ".."), { recursive: true });
		writeFileSync(target, contents);
	};
	try {
		writeFile("package.json", JSON.stringify({ name: "demo", main: "index.js" }));
		writeFile("index.js", "module.exports = 1;");
		writeFile("index.d.ts", "export declare const value: number;");
		writeFile("LICENSE.md", "license text");
		writeFile("README.md", "readme");
		writeFile("binding.gyp", "{}");
		writeFile("test/unit.js", "test");
		writeFile("prebuilds/win32-x64/demo.node", "binary");
		writeFile("prebuilds/darwin-arm64/demo.node", "binary");

		cpSync(source, destination, {
			recursive: true,
			filter: createStagedDepFilter({ sourceDir: source, platforms: ["win32"] }),
		});

		const copied = listStagedDepFiles(destination).sort();
		assert.deepEqual(copied, ["LICENSE.md", "index.d.ts", "index.js", "package.json", "prebuilds/win32-x64/demo.node"]);
		assert.deepEqual(findBlacklistedStagedPaths({ filePaths: copied, platforms: ["win32"] }), []);
		assert.equal(existsSync(join(source, "README.md")), true, "source tree must stay untouched");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});



test("staging 树的黑名单校验能区分清洗过的树与漏接 filter 的树", () => {
	const root = createTempDirectory("of-staged-tree-");
	const writeFile = (target, contents) => {
		mkdirSync(join(target, ".."), { recursive: true });
		writeFileSync(target, contents);
	};
	try {
		const dependencyRoot = join(root, "dependency");
		writeFile(join(dependencyRoot, "package.json"), JSON.stringify({ name: "demo", main: "index.js" }));
		writeFile(join(dependencyRoot, "index.js"), "module.exports = 1;");
		writeFile(join(dependencyRoot, "binding.gyp"), "{}");
		writeFile(join(dependencyRoot, "test", "unit.js"), "test");
		writeFile(join(dependencyRoot, "prebuilds", "win32-x64", "demo.node"), "binary");
		writeFile(join(dependencyRoot, "prebuilds", "darwin-arm64", "demo.node"), "binary");

		const cleanStaging = join(root, "clean", "node_modules");
		const dirtyStaging = join(root, "dirty", "node_modules");
		mkdirSync(cleanStaging, { recursive: true });
		mkdirSync(dirtyStaging, { recursive: true });
		cpSync(dependencyRoot, join(cleanStaging, "demo"), {
			recursive: true,
			filter: createStagedDepFilter({ sourceDir: dependencyRoot, platforms: ["win32"] }),
		});
		cpSync(dependencyRoot, join(dirtyStaging, "demo"), { recursive: true });

		assert.deepEqual(
			findStagedNodeModulesBlacklistHits({ nodeModulesDirectory: cleanStaging, platforms: ["win32"] }),
			[],
		);
		assert.deepEqual(
			findStagedNodeModulesBlacklistHits({ nodeModulesDirectory: dirtyStaging, platforms: ["win32"] }),
			["demo/binding.gyp", "demo/prebuilds/darwin-arm64/demo.node", "demo/test/unit.js"],
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("已安装的真实依赖在三个目标平台上都不触碰运行时入口", () => {
	for (const platform of ["darwin", "win32", "linux"]) {
		const { errors, dependencies } = planStagedDependencyCleaning({ platforms: [platform], fromDir: desktopRoot });
		assert.deepEqual(errors, [], `${platform}: required external dependencies must resolve`);
		assert.ok(dependencies.length > 0, `${platform}: expected at least one installed external dependency`);
		for (const dependency of dependencies) {
			assert.deepEqual(dependency.violations, [], `${dependency.dep} (${platform})`);
		}
	}
});

test("异平台专属的 required 依赖在构建主机缺席时不误报", () => {
	// sherpa-onnx-win-x64 声明 os=win32：Linux/macOS 主机的 node_modules 里不会
	// 有它，在异平台主机上校验 win32 清洗计划时缺席不算违规；换到该包的目标平台
	// 主机（win32 runner）上仍必须缺席即报错，保住真实打包前的兜底校验。
	const resolveWithoutSherpa = (dep, fromDir) => {
		if (dep === "sherpa-onnx-win-x64") throw new Error("not installed");
		return resolveInstalledPackageRoot(dep, fromDir);
	};

	const foreignHost = planStagedDependencyCleaning({
		platforms: ["win32"],
		hostPlatform: "linux",
		resolveRoot: resolveWithoutSherpa,
	});
	assert.deepEqual(foreignHost.errors, []);
	assert.ok(
		foreignHost.dependencies.every((dependency) => dependency.dep !== "sherpa-onnx-win-x64"),
		"foreign-platform dep absent on host should be excluded from the cleaning plan",
	);

	const matchingHost = planStagedDependencyCleaning({
		platforms: ["win32"],
		hostPlatform: "win32",
		resolveRoot: resolveWithoutSherpa,
	});
	assert.deepEqual(matchingHost.errors, [
		"declared external dependency is not installed: sherpa-onnx-win-x64",
	]);
});

test("真实原生依赖保留本平台二进制，裁掉异平台二进制与调试产物", () => {
	const { dependencies } = planStagedDependencyCleaning({ platforms: ["win32"], fromDir: desktopRoot });
	const koffi = dependencies.find((dependency) => dependency.dep === "koffi");
	if (koffi) {
		assert.equal(isStrippedByPlan(koffi.plan, "build/koffi/win32_x64/koffi.node"), false);
		assert.equal(isStrippedByPlan(koffi.plan, "build/koffi/darwin_arm64/koffi.node"), true);
		assert.equal(isStrippedByPlan(koffi.plan, "index.js"), false);
		assert.ok(
			koffi.summary.strippedBytes > 10 * 1024 * 1024,
			`koffi should drop its foreign platform binaries, dropped ${koffi.summary.strippedBytes}`,
		);
	}
	const uiohook = dependencies.find((dependency) => dependency.dep === "uiohook-napi");
	if (uiohook) {
		assert.equal(isStrippedByPlan(uiohook.plan, "prebuilds/win32-x64/uiohook-napi.node"), false);
		assert.equal(isStrippedByPlan(uiohook.plan, "prebuilds/darwin-arm64/uiohook-napi.node"), true);
		assert.equal(isStrippedByPlan(uiohook.plan, "binding.gyp"), true);
		assert.equal(isStrippedByPlan(uiohook.plan, "dist/index.js"), false);
	}
	const nodePty = dependencies.find((dependency) => dependency.dep === "@lydell/node-pty-win32-x64");
	if (nodePty) {
		assert.equal(isStrippedByPlan(nodePty.plan, "conpty.node"), false);
		assert.equal(isStrippedByPlan(nodePty.plan, "conpty.pdb"), true);
	}
});

test("产物树扫描要求显式且唯一的平台", () => {
	assert.throws(() => parseArguments(["--staging"]), /只接受一个 --platform/);
	assert.throws(
		() => parseArguments(["--staging", "--platform", "linux", "--platform", "darwin"]),
		/只接受一个 --platform/,
	);
	assert.deepEqual(parseArguments(["--staging", "--platform", "linux"]).platforms, ["linux"]);
	assert.deepEqual(parseArguments(["--resources", "out", "--platform", "win32"]).platforms, ["win32"]);
});

test("无树扫描时仍默认三个平台族", () => {
	assert.deepEqual(parseArguments([]).platforms, ["darwin", "win32", "linux"]);
});

test("单平台扫描不把本平台的 prebuild 判为应裁剪", () => {
	const files = [
		"package.json",
		"index.js",
		"prebuilds/darwin-x64/uiohook-napi.node",
		"prebuilds/linux-x64/uiohook-napi.node",
	];
	const hits = findBlacklistedStagedPaths({
		filePaths: files,
		platforms: ["darwin"],
		packageJson: { name: "uiohook-napi", main: "index.js" },
	});
	assert.deepEqual(hits, ["prebuilds/linux-x64/uiohook-napi.node"]);
});
