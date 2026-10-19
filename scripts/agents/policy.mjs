// Copyright The Open Forge contributors.
import { matchesPath } from "./git.mjs";

const PATH_GATES = {
	security: [
		"**/auth/**",
		"**/oauth/**",
		"**/sandbox/**",
		"**/*credential*",
		"apps/desktop/src/preload/**",
		"apps/desktop/src/main/ipc/**",
		"apps/desktop/src/main/open-external.ts",
		"packages/remote-*/**",
	],
	data: ["packages/runtime-storage/**", "packages/runtime-node/src/conversation/**", "**/migrat*/**"],
	"license-brand": ["LICENSE", "NOTICE", "THIRD_PARTY*", "**/build/icons/**"],
	billing: ["**/*subscription*", "**/*pricing*", "**/*billing*"],
	"release-signing-update": [
		"scripts/release/**",
		".github/workflows/desktop-release.yml",
		".github/workflows/desktop-upgrade-e2e.yml",
		"apps/desktop/src/main/updater*",
		"apps/desktop/src/main/inno-windows-update*",
		"apps/desktop/build/**",
	],
	"tests-and-guards": [
		"scripts/quality/**",
		"scripts/agents/**",
		"schemas/agents/**",
		"project/autonomy-policy.json",
		"project/agents.json",
		"project/decisions/waivers/**",
		".github/workflows/**",
		"AGENTS.md",
		"**/AGENTS.md",
		".agents/**",
		"docs/dev/agent-rules/**",
		"**/DESIGN.md",
		"**/.impeccable/**",
		"biome.json",
		"**/vitest*.config.*",
	],
};
const SECURITY =
	/(?:https?:\/\/|\bfetch\s*\(|\b(?:spawn|exec|execFile)\s*\(|shell\.openExternal|contextBridge|ipcMain\.|nodeIntegration|contextIsolation|webSecurity|rejectUnauthorized|safeStorage|keychain|\beval\s*\(|new\s+Function|postinstall)/u;
const DATA =
	/(?:\b(?:rmSync|unlinkSync|rimraf)\s*\(|fs\.(?:rm|unlink)|\b(?:DROP|DELETE\s+FROM)\b|schemaVersion|tombstone)/u;
const TEST_DISABLE = /(?:\.(?:skip|only|todo|fails)\s*\(|\bskip\s*:\s*true|\btestTimeout\b|\bhookTimeout\b)/u;
const KNOWN =
	/(?:\.(?:[cm]?[jt]sx?|json|md|css|html|ya?ml|toml|lock|txt|svg|sh|ps1|go|kt)|(?:^|\/)(?:LICENSE|NOTICE))$/iu;

function modifiedLines(before, after) {
	const old = new Set(before.split("\n"));
	return after
		.split("\n")
		.filter((line) => !old.has(line))
		.join("\n");
}

/** A conservative classifier, not a proof that arbitrary source has no security effect. */
export function classifyChanges(changes) {
	const gates = new Set();
	const unknown = [];
	const reasons = [];
	for (const change of changes) {
		const { path, before, after } = change;
		if (
			(change.oldMode && change.newMode && change.oldMode !== change.newMode) ||
			["100755", "120000"].includes(change.newMode)
		)
			gates.add("security");
		if (
			typeof before !== "string" ||
			typeof after !== "string" ||
			!KNOWN.test(path) ||
			before.length + after.length > 2000000 ||
			before.includes("\0") ||
			after.includes("\0")
		) {
			unknown.push(path);
			continue;
		}
		for (const [gate, patterns] of Object.entries(PATH_GATES)) {
			if (patterns.some((pattern) => matchesPath(path, pattern))) {
				gates.add(gate);
				reasons.push({ gate, path, reason: "protected path" });
			}
		}
		const additions = modifiedLines(before, after);
		if (SECURITY.test(additions)) gates.add("security");
		if (DATA.test(additions)) gates.add("data");
		if (/(?:\.test\.|\.spec\.|\/tests?\/)/u.test(path)) {
			const assertions = before.split("\n").filter((line) => /\b(?:expect|assert)\s*\(/u.test(line));
			if (
				assertions.some((line) => !after.split("\n").includes(line)) ||
				TEST_DISABLE.test(additions) ||
				(before && !after)
			)
				gates.add("tests-and-guards");
		}
		if (path.endsWith("package.json")) {
			try {
				const old = before ? JSON.parse(before) : {};
				const current = after ? JSON.parse(after) : {};
				if (["name", "license", "productName", "author"].some((key) => old[key] !== current[key]))
					gates.add("license-brand");
				if (old.scripts?.postinstall !== current.scripts?.postinstall) gates.add("security");
				if (path === "apps/desktop/package.json" && old.version !== current.version) {
					const a = /^(\d+)\.(\d+)\.(\d+)$/u.exec(old.version ?? "");
					const b = /^(\d+)\.(\d+)\.(\d+)$/u.exec(current.version ?? "");
					if (!a || !b) unknown.push(path);
					else if (a[1] !== b[1] || (a[1] === "0" && a[2] !== b[2])) gates.add("major-version");
				}
			} catch {
				unknown.push(path);
			}
		}
	}
	return { gates: [...gates].sort(), unknown: [...new Set(unknown)].sort(), reasons };
}

export function assertGateClear(result) {
	if (result.unknown.length)
		throw new Error(`unclassified changes require investigation: ${result.unknown.join(", ")}`);
	if (result.gates.length) throw new Error(`human gates require bound approval: ${result.gates.join(", ")}`);
	return true;
}
