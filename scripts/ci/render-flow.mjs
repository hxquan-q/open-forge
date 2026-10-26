// Copyright The Open Forge contributors.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
export const ORGANIZATION = "621301e6c5006adb19febbd6";
export const CODEUP = "https://codeup.aliyun.com/621301e6c5006adb19febbd6/Allstar_AI/ALLSTAR-AI.git";
export const GITHUB = "https://github.com/hxquan-q/open-forge.git";
// Public Yunxiao build-cluster image; Docker Hub images are not reachable from the cluster.
const CONTAINER = "build-steps-public-registry.cn-beijing.cr.aliyuncs.com/build-steps/alinux3:latest";
const BUN_SHA256 = "951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f";

export function renderPipelines({ connectionId = "e35k9qkwkyicf6yy", variableGroupId } = {}) {
	// Flow validates certificate.serviceConnection against the connection UUID, not its numeric list id.
	if (!/^[A-Za-z0-9._-]{1,64}$/.test(connectionId)) throw new Error("Invalid Codeup service connection ID.");
	if (variableGroupId !== undefined && !/^[A-Za-z0-9._-]{1,64}$/.test(String(variableGroupId)))
		throw new Error("Invalid variable group ID.");
	const commandJob = (name, run, instanceType) => ({
		name,
		runsOn: { group: "public/cn-beijing", container: CONTAINER, ...(instanceType ? { instanceType } : {}) },
		steps: { command: { name, step: "Command", with: { run } } },
	});
	const syncSource = readFileSync(join(directory, "codeup-sync.mjs"), "utf8");
	// Flow substitutes ${...} in command text and does not reliably honour the $$ escape
	// inside quoted heredocs, which corrupted the script's template literals. Base64
	// transports the reviewed control script byte-for-byte.
	const syncArchive = Buffer.from(syncSource, "utf8").toString("base64");
	const sync = {
		sources: {
			github: {
				type: "git",
				name: "GitHub source",
				endpoint: GITHUB,
				branch: "dev",
				cloneDepth: 1,
				triggerEvents: ["push"],
				// Documented as a regular expression; every branch push must reach the sync job.
				branchesFilter: ".*",
			},
		},
		...(variableGroupId ? { variableGroups: [String(variableGroupId)] } : {}),
		stages: {
			sync: {
				name: "同步全部分支与标签",
				jobs: {
					mirror: commandJob(
						"快进同步（拒绝覆盖与删除）",
						[
							"set -euo pipefail",
							"set +x",
							"dnf install -y nodejs",
							"control_dir=$(mktemp -d)",
							"trap 'rm -rf -- \"$control_dir\"' EXIT",
							`printf '%s' '${syncArchive}' | base64 -d > "$control_dir/sync.mjs"`,
							'node "$control_dir/sync.mjs"',
						].join("\n"),
					),
				},
			},
		},
	};
	const manifest = JSON.parse(readFileSync(resolve(directory, "../../package.json"), "utf8"));
	if (manifest.packageManager !== "bun@1.3.14")
		throw new Error("Update the audited Bun archive checksum for the new packageManager version.");
	const ciRun = [
		"set -euo pipefail",
		"set +x",
		"if printenv CODEUP_GIT_TOKEN >/dev/null; then echo 'Write credential must not be available to CI'; exit 1; fi",
		'expected_sha="$CI_COMMIT_SHA"',
		"[[ \"$expected_sha\" =~ ^[0-9a-f]{40}$ ]] || { echo 'Missing full source SHA'; exit 1; }",
		'git config --global --add safe.directory "$PWD"',
		'git checkout --detach "$expected_sha"',
		'test "$(git rev-parse HEAD)" = "$expected_sha"',
		"printf 'Verified Codeup revision: %s\\n' \"$expected_sha\"",
		"dnf install -y nodejs ripgrep unzip",
		"tool_dir=$(mktemp -d)",
		"trap 'rm -rf -- \"$tool_dir\"' EXIT",
		'curl --fail --silent --show-error --location --retry 3 https://registry.npmmirror.com/-/binary/bun/bun-v1.3.14/bun-linux-x64.zip --output "$tool_dir/bun.zip"',
		`echo '${BUN_SHA256}  '"$tool_dir/bun.zip" | sha256sum --check --status`,
		'unzip -q "$tool_dir/bun.zip" -d "$tool_dir"',
		'export PATH="$tool_dir/bun-linux-x64:$PATH"',
		"test \"$(bun --version)\" = '1.3.14'",
		"export BUN_CONFIG_REGISTRY=https://registry.npmmirror.com",
		"export CI=true",
		"node scripts/quality/install-ci-dependencies.mjs",
		"bun run check",
		"bun run test:quality",
		"bun run verify:runtime-contract",
		"bun run verify:artifact:installed",
		"git fetch origin refs/heads/main:refs/remotes/origin/main",
		"test_base=$(git merge-base HEAD refs/remotes/origin/main)",
		'if test "$test_base" = "$expected_sha"; then',
		"  if git rev-parse --verify HEAD^ >/dev/null 2>&1; then test_base=$(git rev-parse HEAD^); else test_base=; fi",
		"fi",
		'if test -n "$test_base"; then bun run test:changed --base "$test_base"; else bun run test; fi',
		"bun run build:cli",
		"bun run --cwd apps/docs-site check",
		"bun run --cwd apps/docs-site test",
		"bun run build:docs",
		"bun run --cwd apps/docs-site test:production",
		"printf 'Checks, tests and builds passed for %s\\n' \"$expected_sha\"",
	].join("\n");
	const ci = {
		sources: {
			codeup: {
				type: "codeup",
				name: "ALLSTAR-AI",
				endpoint: CODEUP,
				branch: "dev",
				cloneDepth: 0,
				triggerEvents: ["push"],
				// The first sync imports every branch; only dev should spend build minutes.
				branchesFilter: "^dev$",
				certificate: { type: "serviceConnection", serviceConnection: connectionId },
			},
		},
		stages: {
			verify: {
				name: "Linux 检查、测试与构建",
				jobs: { verify: commandJob("校验 → 测试 → CLI / Docs 构建", ciRun, "LARGE_4C8G") },
			},
		},
	};
	return [
		{ name: "ALLSTAR-AI GitHub → Codeup 同步", content: JSON.stringify(sync, null, 2) },
		{ name: "ALLSTAR-AI Codeup 构建与测试", content: JSON.stringify(ci, null, 2) },
	];
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	const output = process.argv[2];
	if (!output) throw new Error("Usage: node scripts/ci/render-flow.mjs <output-directory> [variable-group-id]");
	mkdirSync(output, { recursive: true });
	const pipelines = renderPipelines({ variableGroupId: process.argv[3] });
	writeFileSync(join(output, "pipelines.json"), `${JSON.stringify(pipelines, null, 2)}\n`);
	for (const [index, pipeline] of pipelines.entries())
		writeFileSync(join(output, index === 0 ? "sync.yaml" : "ci.yaml"), `${pipeline.content}\n`);
	console.log("Rendered two Flow YAML definitions (JSON syntax, YAML 1.2 compatible); no credentials included.");
}
