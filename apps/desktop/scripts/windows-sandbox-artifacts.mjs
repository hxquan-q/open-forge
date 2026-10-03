// Modified by The Open Forge contributors.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Windows 沙盒制品的受控清单（TASK-0159，BUG-0022 的 A 项）。
 *
 * prepare-pack 过去只看 `packages/runtime-core/sandbox/bin` 是否存在且非空：目录里有任意
 * 一个条目就算「有沙盒制品」。文件名不对、字节被替换、三个 exe 只放了半个，都不会被发现，
 * 产物却照样宣称带沙盒（BUG-0022）。
 *
 * 这里把制品钉死在一份受控清单上：清单记录制品来源提交与每个可执行文件的 SHA-256，打包时
 * 逐个核对存在性与摘要，缺失或不一致**默认阻断**构建；只有显式设置
 * `VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1`（明确接受「本次产物不带 Windows 沙盒」）才降级为告警。
 *
 * 不引入外部下载源：exe 由受控构建产出后放进来源目录，清单由
 * `--write --source-dir <目录> --commit <提交>` 用真实字节生成。
 */

/** 清单在仓库内的相对路径；二进制不进库，清单进库。 */
export const WINDOWS_SANDBOX_ARTIFACT_MANIFEST_PATH = "packages/runtime-core/sandbox/windows/sandbox-artifacts.json";

/** 受控构建必须产出的可执行文件；生成清单与校验共用这一处事实源。 */
export const WINDOWS_SANDBOX_ARTIFACT_BINARIES = [
	"codex-windows-sandbox-host.exe",
	"codex-windows-sandbox-setup.exe",
	"codex-command-runner.exe",
];

/** 显式降级开关：设为 `1` 时只告警不阻断。 */
export const WINDOWS_SANDBOX_ARTIFACT_SKIP_ENV = "VETTA_SKIP_SANDBOX_ARTIFACT_CHECK";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

export function resolveWindowsSandboxArtifactEnforcement(env = process.env) {
	return env[WINDOWS_SANDBOX_ARTIFACT_SKIP_ENV] === "1" ? "warn" : "block";
}

export function sha256OfFile(filePath) {
	return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readTextIfPresent(filePath) {
	if (!existsSync(filePath) || !statSync(filePath).isFile()) return null;
	return readFileSync(filePath, "utf8");
}

/**
 * 结构校验（fail-closed）：字段缺失、类型不对、制品集合与受控清单不符都算问题。
 * `sha256` / `sourceCommit` 允许为 `null`，表示「尚未钉摘要」，由校验阶段单独报出。
 */
export function parseWindowsSandboxArtifactManifest(text) {
	const problems = [];
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return { ok: false, problems: [`清单不是合法 JSON：${detail}`] };
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { ok: false, problems: ["清单根节点必须是对象"] };
	}
	if (parsed.platform !== "win32") {
		problems.push(`platform 必须是 "win32"，实际为 ${JSON.stringify(parsed.platform)}`);
	}
	if (parsed.sourceCommit !== null && !COMMIT_PATTERN.test(String(parsed.sourceCommit))) {
		problems.push("sourceCommit 必须是 40 位小写十六进制提交号，或 null（尚未记录来源）");
	}
	const binaries = [];
	if (!Array.isArray(parsed.binaries)) {
		problems.push("binaries 必须是数组");
	} else {
		for (const [index, entry] of parsed.binaries.entries()) {
			if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
				problems.push(`binaries[${index}] 必须是对象`);
				continue;
			}
			const name = typeof entry.name === "string" ? entry.name.trim() : "";
			if (name.length === 0 || name.includes("/") || name.includes("\\")) {
				problems.push(`binaries[${index}].name 必须是不含路径分隔符的文件名`);
			} else {
				binaries.push({ name, sha256: entry.sha256 === undefined ? null : entry.sha256 });
			}
			if (entry.sha256 !== undefined && entry.sha256 !== null && !SHA256_PATTERN.test(String(entry.sha256))) {
				problems.push(`binaries[${index}].sha256 必须是 64 位小写十六进制摘要，或 null（尚未钉摘要）`);
			}
		}
		const names = binaries.map((entry) => entry.name);
		for (const required of WINDOWS_SANDBOX_ARTIFACT_BINARIES) {
			if (!names.includes(required)) problems.push(`清单缺少受控制品 ${required}`);
		}
		for (const name of names.filter((candidate) => !WINDOWS_SANDBOX_ARTIFACT_BINARIES.includes(candidate))) {
			problems.push(`清单包含未受控制品 ${name}`);
		}
		if (names.length !== new Set(names).size) problems.push("清单包含重复的制品名");
	}
	if (problems.length > 0) return { ok: false, problems };
	return {
		ok: true,
		manifest: { platform: "win32", sourceCommit: parsed.sourceCommit, binaries },
	};
}

/**
 * 逐个核对来源目录里的制品：必须存在、必须是文件、摘要必须与清单一致，且来源目录不得
 * 混入未受控文件（只有整目录都是受控制品才允许打包）。
 */
export function verifyWindowsSandboxArtifacts({ manifest, sourceDir, digestOf = sha256OfFile }) {
	const problems = [];
	if (manifest.sourceCommit === null) {
		problems.push("清单未记录来源提交（sourceCommit 为 null），无法追溯这批制品来自哪次受控构建");
	}
	const expected = new Map(manifest.binaries.map((entry) => [entry.name, entry.sha256]));
	for (const [name, sha256] of expected) {
		const filePath = join(sourceDir, name);
		if (!existsSync(filePath) || !statSync(filePath).isFile()) {
			problems.push(`缺少受控制品 ${name}（${filePath}）`);
			continue;
		}
		if (sha256 === null) {
			problems.push(`受控制品 ${name} 尚未钉摘要（清单 sha256 为 null）`);
			continue;
		}
		const actual = digestOf(filePath);
		if (actual !== sha256) {
			problems.push(`受控制品 ${name} 摘要不一致：清单 ${sha256}，实际 ${actual}`);
		}
	}
	if (existsSync(sourceDir)) {
		for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
			if (entry.isFile() && !expected.has(entry.name)) {
				problems.push(`来源目录存在未受控文件 ${entry.name}（${join(sourceDir, entry.name)}）`);
			}
		}
	}
	return problems;
}

export function formatWindowsSandboxArtifactReport(problems) {
	return [
		"[prepare-pack] Windows 沙盒制品未通过受控清单校验：目标平台包含 Windows，产物会带上不可信的沙盒（或干脆没有），用户侧会得到 sandbox.status=unavailable。",
		...problems.map((problem) => `  · ${problem}`),
		`  修复：由受控构建产出 ${WINDOWS_SANDBOX_ARTIFACT_BINARIES.join(" / ")}，放进来源目录后运行`,
		"  `node apps/desktop/scripts/windows-sandbox-artifacts.mjs --write --source-dir <来源目录> --commit <制品来源提交>` 重新钉摘要。",
		`  只有明确接受「本次产物不带 Windows 沙盒」时才设置 ${WINDOWS_SANDBOX_ARTIFACT_SKIP_ENV}=1 降级为告警。`,
	].join("\n");
}

/**
 * 打包期判定入口。
 *
 * @returns {{ status: "not-declared" | "ok" | "blocked", enforcement: "block" | "warn", message: string | null }}
 *   `enforcement` 是调用方该采取的处置：`block` 中断构建，`warn` 只打印。
 */
export function assessWindowsSandboxArtifacts({
	declaredFamilies,
	manifestPath,
	sourceDir,
	env = process.env,
	readText = readTextIfPresent,
	digestOf = sha256OfFile,
}) {
	const enforcement = resolveWindowsSandboxArtifactEnforcement(env);
	if (!Array.from(declaredFamilies).includes("win32")) {
		return { status: "not-declared", enforcement, message: null };
	}
	const text = readText(manifestPath);
	if (text === null) {
		return {
			status: "blocked",
			enforcement,
			message: formatWindowsSandboxArtifactReport([`受控清单不存在或不含文件：${manifestPath}`]),
		};
	}
	const parsed = parseWindowsSandboxArtifactManifest(text);
	if (!parsed.ok) {
		return { status: "blocked", enforcement, message: formatWindowsSandboxArtifactReport(parsed.problems) };
	}
	const problems = verifyWindowsSandboxArtifacts({ manifest: parsed.manifest, sourceDir, digestOf });
	if (problems.length > 0) {
		return { status: "blocked", enforcement, message: formatWindowsSandboxArtifactReport(problems) };
	}
	return { status: "ok", enforcement, message: null };
}
/** 用来源目录里的真实字节重写清单：制品升级后由维护者执行一次。 */
export function writeWindowsSandboxArtifactManifest({
	manifestPath,
	sourceDir,
	sourceCommit,
	digestOf = sha256OfFile,
}) {
	if (typeof sourceCommit !== "string" || !COMMIT_PATTERN.test(sourceCommit)) {
		return { ok: false, problems: ["--commit 必须是受控构建产物的 40 位小写十六进制提交号"] };
	}
	const problems = [];
	const binaries = [];
	for (const name of WINDOWS_SANDBOX_ARTIFACT_BINARIES) {
		const filePath = join(sourceDir, name);
		if (!existsSync(filePath) || !statSync(filePath).isFile()) {
			problems.push(`缺少受控制品 ${name}（${filePath}）`);
			continue;
		}
		binaries.push({ name, sha256: digestOf(filePath) });
	}
	if (problems.length > 0) return { ok: false, problems };
	const payload = { platform: "win32", sourceCommit, binaries };
	writeFileSync(manifestPath, `${JSON.stringify(payload, null, "\t")}\n`, "utf8");
	return { ok: true, manifest: payload };
}

function readFlag(args, flag, fallback) {
	const index = args.indexOf(flag);
	if (index < 0) return fallback;
	const value = args[index + 1];
	return value === undefined || value.startsWith("--") ? fallback : value;
}

function main() {
	const args = process.argv.slice(2);
	const repoRoot = join(import.meta.dirname, "..", "..", "..");
	const manifestPath = readFlag(args, "--manifest", join(repoRoot, WINDOWS_SANDBOX_ARTIFACT_MANIFEST_PATH));
	const sourceDir = readFlag(args, "--source-dir", join(repoRoot, "packages", "runtime-core", "sandbox", "bin"));

	if (args.includes("--write")) {
		const result = writeWindowsSandboxArtifactManifest({
			manifestPath,
			sourceDir,
			sourceCommit: readFlag(args, "--commit", ""),
		});
		if (!result.ok) {
			console.error(`[sandbox-artifacts] 无法生成清单：\n${result.problems.map((item) => `  · ${item}`).join("\n")}`);
			process.exitCode = 1;
			return;
		}
		console.log(`[sandbox-artifacts] 已用 ${sourceDir} 的真实摘要重写 ${manifestPath}`);
		return;
	}

	const assessment = assessWindowsSandboxArtifacts({ declaredFamilies: ["win32"], manifestPath, sourceDir });
	if (assessment.message) console.error(assessment.message);
	if (assessment.status === "ok") console.log(`[sandbox-artifacts] 清单校验通过：${manifestPath}`);
	process.exitCode = assessment.status === "blocked" ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
