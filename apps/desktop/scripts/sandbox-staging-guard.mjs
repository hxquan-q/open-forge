// Modified by The Open Forge contributors.
import { existsSync, readdirSync } from "node:fs";

/**
 * 打包期沙盒二进制守卫（BUG-0022）。
 *
 * prepare-pack 只在 `packages/runtime-core/sandbox/...` 存在时才把它 staged 进
 * `Resources/sandbox/<platform>/`，缺失时**静默跳过**。而本仓库既不包含、也没有任何
 * 步骤产出 Windows 沙盒 host，于是 Windows 产物必然 `sandbox.status=unavailable`
 * （reason=`binary_not_found`），用户侧只看到「沙盒受限」被置灰。这里在构建期对
 * 「声明要打包该平台，却没 staged 任何该平台沙盒二进制」给出显式告警，风格与
 * `VETTA_SKIP_VENDOR` 一致：说清后果，不中断构建。
 *
 * 只告警不失败是刻意的：是否内置沙盒 host 属于产品决策（BUG-0022 的 B 项），
 * 决策落定前让流水线失败会挡住正常发版路径。
 */

/** 平台族 → 内置沙盒资源目录名 + 仓库内二进制来源目录（相对仓库根）。 */
export const SANDBOX_BINARY_SOURCES = {
	win32: {
		label: "Windows",
		resourceDir: "windows",
		sourceDir: "packages/runtime-core/sandbox/bin",
	},
	linux: {
		label: "Linux",
		resourceDir: "linux",
		sourceDir: "packages/runtime-core/sandbox/linux",
	},
};

/**
 * 来源目录状态：
 * - `missing`：目录不存在；
 * - `empty`：目录存在但没有任何条目——等于什么都没 staged，同样会产出没有沙盒的包；
 * - `present`：至少有条目。
 *
 * 按平台族整体判定，不逐个架构核对：产物按 `sandbox/<platform>/**` 过滤，架构级缺失
 * 由对应架构的构建配置负责。
 */
export function classifySandboxSource(sourceDir) {
	if (!existsSync(sourceDir)) return "missing";
	return readdirSync(sourceDir).length > 0 ? "present" : "empty";
}

/**
 * 取出「本次构建声明要打包该平台、却没有可用沙盒二进制」的平台族。
 *
 * @param {object} options
 * @param {Iterable<string>} options.declaredFamilies 本次构建声明的平台族（darwin/win32/linux）
 * @param {Record<string, string>} [options.sourceDirs] 平台族 → 本机解析出的来源目录绝对路径；
 *   缺省回退到仓库内约定路径，报出来仍然可行动。
 * @returns {Array<{ family: string, sourceDir: string, state: "missing" | "empty" }>}
 */
export function collectMissingSandboxBinaries({ declaredFamilies, sourceDirs = {} }) {
	const missing = [];
	for (const family of declaredFamilies) {
		const source = SANDBOX_BINARY_SOURCES[family];
		// darwin 用系统自带的 sandbox-exec，没有内置二进制，不属于本守卫的范围。
		if (!source) continue;
		const sourceDir = sourceDirs[family] ?? source.sourceDir;
		const state = classifySandboxSource(sourceDir);
		if (state === "present") continue;
		missing.push({ family, sourceDir, state });
	}
	return missing;
}

/** 与 `VETTA_SKIP_VENDOR` 告警同一形态：`[prepare-pack] <事实> —— <后果>`。 */
export function formatSandboxStagingWarning({ family, sourceDir, state }) {
	const { label, resourceDir } = SANDBOX_BINARY_SOURCES[family];
	const stateText = state === "empty" ? "为空" : "不存在";
	return (
		`[prepare-pack] 沙盒二进制缺失：目标平台包含 ${label}，但来源目录${stateText}（${sourceDir}）` +
		` —— 产物将不带 ${label} 沙盒（Resources/sandbox/${resourceDir}/ 为空），` +
		"用户侧会得到 sandbox.status=unavailable；如需内置，请先把对应二进制放进该来源目录再打包"
	);
}
