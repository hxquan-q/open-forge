// Modified by The Open Forge contributors.
import { execFileSync, spawnSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const workflow = readFileSync(join(import.meta.dirname, "../../.github/workflows/desktop-release.yml"), "utf8");
const packagedWorkflow = readFileSync(
	join(import.meta.dirname, "../../.github/workflows/desktop-packaged.yml"),
	"utf8",
);
const upgradeWorkflow = readFileSync(
	join(import.meta.dirname, "../../.github/workflows/desktop-upgrade-e2e.yml"),
	"utf8",
);

const require = createRequire(join(import.meta.dirname, "../../apps/desktop/package.json"));
const { parse } = require("yaml");
const jobs = parse(workflow).jobs;
function actionSteps(name) {
	return parse(readFileSync(join(import.meta.dirname, `../../.github/actions/${name}/action.yml`), "utf8")).runs.steps;
}

/**
 * Render a path the way the bash step will read it.
 *
 * The checkpoint steps are POSIX shell: they run `tar` and redirect into `$GITHUB_ENV`.
 * Node builds Windows paths with backslashes, and MSYS leaves a mixed
 * `C:\dir/apps/desktop` untouched — tar then reads the leading `C:` as a remote host and
 * fails with "Cannot open". Converting to the `/c/...` form the shell actually expects
 * keeps these steps testable on Windows instead of skipping them there.
 */
function shellPath(value) {
	if (process.platform !== "win32") return value;
	const normalized = value.replaceAll("\\", "/");
	const drive = normalized.match(/^([A-Za-z]):\/(.*)$/);
	return drive ? `/${drive[1].toLowerCase()}/${drive[2]}` : normalized;
}

describe("Desktop release workflow contracts", () => {
	it("saves successful dependency downloads before later build or verification failures", () => {
		const steps = actionSteps("install-bun-dependencies");
		const restore = steps.findIndex((step) => step.uses === "actions/cache/restore@v4");
		const install = steps.findIndex((step) => step.run?.includes("install-ci-dependencies.mjs"));
		const save = steps.findIndex((step) => step.uses === "actions/cache/save@v4");
		expect(restore).toBeLessThan(install);
		expect(install).toBeLessThan(save);
		expect(steps[save].if).toBe("steps.bun-cache.outputs.cache-hit != 'true'");
		expect(steps[restore].with.path).toBe("~/.bun/install/cache");
		expect(steps[restore].with.key).toContain("runner.arch");
	});

	it("isolates model inputs and saves resources before compilation without caching application outputs", () => {
		const steps = actionSteps("prepare-desktop-resources");
		const restore = steps.find((step) => step.uses === "actions/cache/restore@v4");
		expect(restore.with["restore-keys"]).toBeUndefined();
		for (const input of [
			"runtimes/manifest.json",
			"speech-input/model-manifest.json",
			"fetch-ocr-models.js",
			"runner.arch",
		]) {
			expect(restore.with.key).toContain(input);
		}
		const save = steps.findIndex((step) => step.uses === "actions/cache/save@v4");
		expect(steps.findIndex((step) => step.name === "Download release resources")).toBeLessThan(save);
		expect(steps[save].with.path).toBe(restore.with.path);
		expect(restore.with.path).not.toMatch(/node_modules|build-stage|\.turbo|release\//);
		expect(
			jobs.build.steps.findIndex((step) => step.uses === "./.github/actions/prepare-desktop-resources"),
		).toBeLessThan(jobs.build.steps.findIndex((step) => step.name === "Build updater artifacts"));
	});

	it("retries verification using the same run's completed build without packaging again", () => {
		expect(jobs.build.strategy["fail-fast"]).toBe(false);
		expect(jobs.verify?.needs).toEqual(["prepare", "build"]);
		expect(jobs.verify?.strategy.matrix).toEqual(jobs.build.strategy.matrix);
		const buildSteps = jobs.build.steps;
		const verifySteps = jobs.verify?.steps ?? [];
		expect(buildSteps.some((step) => step.name === "Run packaged app and updater E2E")).toBe(false);
		const checkpoint = buildSteps.find((step) => step.name === "Upload build checkpoint");
		expect(checkpoint?.with.name).toBe("release-build-$" + "{{ matrix.platform }}");
		expect(checkpoint?.with["retention-days"]).toBe(30);
		expect(checkpoint?.with.overwrite).toBe(true);
		const download = verifySteps.find((step) => step.uses === "actions/download-artifact@v4");
		expect(download?.with.name).toBe(checkpoint?.with.name);
		expect(download?.with["run-id"]).toBeUndefined();
		expect(verifySteps.some((step) => step.run?.includes("matrix.command"))).toBe(false);
		expect(verifySteps.findIndex((step) => step.name === "Restore build checkpoint")).toBeLessThan(
			verifySteps.findIndex((step) => step.name === "Verify platform updater artifacts"),
		);
		for (const target of ["publish-r2", "publish-github"]) {
			expect(jobs[target].needs).toContain("verify");
			expect(jobs[target].steps.find((step) => step.uses === "actions/download-artifact@v4").with.pattern).toBe(
				"desktop-*",
			);
		}
	});

	it("restores a failed verification attempt with original bytes, executable modes, symlinks and candidate version", () => {
		const root = mkdtempSync(join(tmpdir(), "vetta-release-checkpoint-"));
		try {
			const desktop = join(root, "apps/desktop");
			const release = join(desktop, "release");
			const runnerTemp = join(root, "runner");
			mkdirSync(release, { recursive: true });
			mkdirSync(runnerTemp);
			writeFileSync(join(desktop, "package.json"), JSON.stringify({ version: "0.5.58" }));
			writeFileSync(join(release, "Vetta"), "signed executable fixture");
			chmodSync(join(release, "Vetta"), 0o755);
			if (process.platform !== "win32") symlinkSync("Vetta", join(release, "bundle-link"));
			writeFileSync(join(release, "latest.yml"), "version: 0.5.59\n");
			writeFileSync(join(release, "installer.exe.files.json"), "verification manifest");
			const envFile = join(root, "github-env");
			const env = {
				...process.env,
				RUNNER_TEMP: shellPath(runnerTemp),
				GITHUB_WORKSPACE: shellPath(root),
				GITHUB_ENV: shellPath(envFile),
				VETTA_REQUIRE_MAC_SIGNATURE: "1",
				BUILD_VERSION: "0.5.59",
			};
			execFileSync(
				"bash",
				["-e", "-c", jobs.build.steps.find((step) => step.name === "Archive build checkpoint").run],
				{ cwd: root, env },
			);
			mkdirSync(join(runnerTemp, "release-checkpoint"));
			writeFileSync(
				join(runnerTemp, "release-checkpoint/release-build.tar"),
				readFileSync(join(runnerTemp, "release-build.tar")),
			);
			// Verification can mutate the unpacked executable; retries must start from the saved build.
			writeFileSync(join(release, "Vetta"), "mutated during failed test");
			const restore = jobs.verify.steps.find((step) => step.name === "Restore build checkpoint").run;
			for (let attempt = 0; attempt < 2; attempt += 1) {
				execFileSync("bash", ["-e", "-c", restore], { cwd: root, env });
				expect(readFileSync(join(release, "Vetta"), "utf8")).toBe("signed executable fixture");
				expect(readFileSync(join(release, "installer.exe.files.json"), "utf8")).toBe("verification manifest");
				expect(JSON.parse(readFileSync(join(desktop, "package.json"), "utf8")).version).toBe("0.5.59");
				if (process.platform !== "win32") {
					expect(statSync(join(release, "Vetta")).mode & 0o777).toBe(0o755);
					expect(readlinkSync(join(release, "bundle-link"))).toBe("Vetta");
				}
			}
			expect(readFileSync(envFile, "utf8")).toContain("VETTA_REQUIRE_MAC_SIGNATURE=1");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("prewarms tag-readable downloads on the default branch without building or publishing", () => {
		const warm = parse(readFileSync(join(import.meta.dirname, "../../.github/workflows/desktop-cache.yml"), "utf8"));
		expect(warm.on.schedule).toHaveLength(1);
		expect(warm.jobs.warm.if).toContain("github.event.repository.default_branch");
		// 发布矩阵由 prepare 动态生成；runner 集合取平台 JSON 字面量的并集。
		const releaseRunners = [...new Set([...workflow.matchAll(/"runner":"([^"]+)"/g)].map((m) => m[1]))].sort();
		expect([...warm.jobs.warm.strategy.matrix.runner].sort()).toEqual(releaseRunners);
		expect(warm.jobs.warm.steps.some((step) => /dist:|publish:/.test(step.run ?? ""))).toBe(false);
	});

	it("runs release identity regression coverage through the quality gate", () => {
		const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8"));
		expect(manifest.scripts["test:quality"].split(/\s+/)).toContain(
			"scripts/release/verify-desktop-release-identity.test.mjs",
		);
	});

	it("checks remote tag identity before building and immediately before publishing", () => {
		const command = "node scripts/release/verify-desktop-release-identity.mjs";
		const prepare = jobs.prepare.steps.find((step) => step.name === "Verify release source identity");
		expect(prepare).toBeDefined();
		expect(prepare.run).toBe(command);
		expect(prepare.if).toContain("steps.config.outputs.should_publish == 'true'");
		expect(prepare.if).toContain("steps.config.outputs.channel != 'test'");
		expect(prepare.env.RELEASE_TARGET).toBe("$" + "{{ steps.config.outputs.release_target }}");
		expect(prepare.env.BUILD_VERSION).toBe("$" + "{{ steps.config.outputs.build_version }}");
		const r2Steps = jobs["publish-r2"].steps;
		const r2Guard = r2Steps.findIndex((step) => step.name === "Verify release source identity");
		const r2Publish = r2Steps.findIndex((step) => step.name === "Publish artifacts before metadata");
		expect(r2Guard).toBeGreaterThan(-1);
		expect(r2Guard).toBe(r2Publish - 1);
		expect(r2Steps[r2Guard].if).toContain("needs.prepare.outputs.channel != 'test'");
		expect(r2Steps[r2Guard].env.RELEASE_TARGET).toBe("r2");
		expect(r2Steps[r2Guard].run).toBe(command);
		const githubPublish = jobs["publish-github"].steps.find(
			(step) => step.name === "Publish release after all assets are ready",
		);
		expect(githubPublish.env.RELEASE_TARGET).toBe("$" + "{{ needs.prepare.outputs.release_target }}");
		expect(githubPublish.run.trimStart().startsWith(command)).toBe(true);
		const finalGuard = githubPublish.run.indexOf(
			`${command} --github-draft`,
			githubPublish.run.indexOf("gh release create"),
		);
		expect(finalGuard).toBeGreaterThan(githubPublish.run.indexOf("gh release create"));
		expect(finalGuard).toBeLessThan(githubPublish.run.indexOf("gh release upload"));
	});

	describe("isolated release draft workflows", () => {
		let template;
		let sha;

		beforeAll(() => {
			template = mkdtempSync(join(tmpdir(), "openforge-release-template-"));
			const cwd = join(template, "source");
			mkdirSync(join(cwd, "scripts/release"), { recursive: true });
			mkdirSync(join(cwd, "apps/desktop/release"), { recursive: true });
			mkdirSync(join(cwd, ".github/release-notes"), { recursive: true });
			for (const name of ["verify-desktop-release-identity.mjs", "release-notes.mjs"]) {
				cpSync(join(import.meta.dirname, "../release", name), join(cwd, "scripts/release", name));
			}
			writeFileSync(join(cwd, "apps/desktop/package.json"), JSON.stringify({ version: "1.2.3" }));
			writeFileSync(join(cwd, ".github/release-notes/v1.2.3.md"), "# Open Forge 1.2.3\n");
			writeFileSync(join(cwd, "apps/desktop/release/artifact.zip"), "candidate artifact");
			const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
			git("init", "--quiet");
			git("init", "--quiet", "--bare", join(template, "remote.git"));
			git("remote", "add", "origin", "../remote.git");
			git(
				"-c",
				"user.name=Release Fixture",
				"-c",
				"user.email=fixture@example.invalid",
				"-c",
				"core.hooksPath=disabled-hooks",
				"commit",
				"--allow-empty",
				"--no-gpg-sign",
				"-m",
				"candidate",
			);
			sha = git("rev-parse", "HEAD");
		});

		afterAll(() => {
			if (template) rmSync(template, { recursive: true, force: true });
		});

		it("keeps copied repositories, tags, remotes and release state independent", () => {
			const root = mkdtempSync(join(tmpdir(), "openforge-release-copy-"));
			const first = join(root, "first");
			const second = join(root, "second");
			const git = (directory, ...args) =>
				execFileSync("git", args, {
					cwd: join(directory, "source"),
					encoding: "utf8",
					stdio: "pipe",
				}).trim();
			try {
				cpSync(template, first, { recursive: true });
				cpSync(template, second, { recursive: true });
				const objectPath = join("source/.git/objects", sha.slice(0, 2), sha.slice(2));
				const objectIdentities = new Set();
				for (const directory of [template, first, second]) {
					expect(git(directory, "rev-parse", "HEAD")).toBe(sha);
					expect(git(directory, "config", "--get", "remote.origin.url")).toBe("../remote.git");
					expect(git(directory, "rev-parse", "--git-common-dir")).toBe(".git");
					expect(existsSync(join(directory, "source/.git/objects/info/alternates"))).toBe(false);
					const object = statSync(join(directory, objectPath));
					expect(object.nlink).toBe(1);
					objectIdentities.add(`${object.dev}:${object.ino}`);
				}
				expect(objectIdentities.size).toBe(3);
				git(first, "-c", "tag.gpgSign=false", "tag", "v1.2.3", sha);
				git(first, "push", "--quiet", "origin", "refs/tags/v1.2.3");
				writeFileSync(join(first, "github.json"), JSON.stringify({ uploaded: true }));
				writeFileSync(join(first, "source/apps/desktop/release/artifact.zip"), "first copy only");
				for (const directory of [template, second]) {
					expect(git(directory, "tag", "--list", "v1.2.3")).toBe("");
					expect(git(directory, "ls-remote", "--tags", "origin", "refs/tags/v1.2.3")).toBe("");
					expect(existsSync(join(directory, "github.json"))).toBe(false);
					expect(readFileSync(join(directory, "source/apps/desktop/release/artifact.zip"), "utf8")).toBe(
						"candidate artifact",
					);
				}
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});

		it.each([
			{
				name: "rejects a stale draft target before uploading or publishing when the tag is missing",
				target: "stale",
				releaseTarget: "github",
				retry: false,
			},
			{
				name: "resumes a same-candidate draft without a tag",
				target: "candidate",
				releaseTarget: "github",
				retry: false,
			},
			{
				name: "creates a candidate draft and resumes it after an upload failure",
				target: "missing",
				releaseTarget: "github",
				retry: true,
			},
			{
				name: "publishes a supplementary R2 release using the matching remote tag",
				target: "main",
				releaseTarget: "r2",
				retry: false,
			},
		])("$name", ({ target, releaseTarget, retry }) => {
			const root = mkdtempSync(join(tmpdir(), "openforge-release-draft-"));
			const cwd = join(root, "source");
			const bin = join(root, "bin");
			const statePath = join(root, "github.json");
			try {
				cpSync(template, root, { recursive: true });
				mkdirSync(bin);
				const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
				if (releaseTarget === "r2") {
					git("-c", "tag.gpgSign=false", "tag", "v1.2.3", sha);
					git("push", "--quiet", "origin", "refs/tags/v1.2.3");
				}
				writeFileSync(
					statePath,
					JSON.stringify({
						draft:
							target === "missing"
								? null
								: {
										tagName: "v1.2.3",
										isDraft: true,
										targetCommitish:
											target === "candidate" ? sha : target === "stale" ? "a".repeat(40) : target,
									},
						failUploadOnce: retry,
						events: [],
					}),
				);
				writeFileSync(join(bin, "gh"), "#!/usr/bin/env node\nrequire(process.env.RELEASE_FIXTURE_GH);\n");
				chmodSync(join(bin, "gh"), 0o755);
				// Native Windows spawn cannot execute the Bash shim. Intercept only the gh process boundary.
				writeFileSync(
					join(root, "gh-spawn.cjs"),
					`
				const cp = require("node:child_process");
				const spawnSync = cp.spawnSync;
				cp.spawnSync = (command, args, options) => command === "gh"
					? spawnSync(process.execPath, [process.env.RELEASE_FIXTURE_GH, ...args], options)
					: spawnSync(command, args, options);
				require("node:module").syncBuiltinESMExports();
			`,
				);
				writeFileSync(
					join(root, "gh.cjs"),
					`
				const fs = require("node:fs");
				const state = JSON.parse(fs.readFileSync(process.env.RELEASE_FIXTURE_STATE, "utf8"));
				const args = process.argv.slice(2);
				if (args[0] !== "release") process.exit(2);
				state.events.push(args);
				fs.writeFileSync(process.env.RELEASE_FIXTURE_STATE, JSON.stringify(state));
				if (args[1] === "view") {
					if (!state.draft) process.exit(1);
					if (args.includes("--jq")) console.log(state.draft.isDraft);
					else console.log(JSON.stringify(state.draft));
				} else if (args[1] === "create") {
					state.draft = { tagName: args[2], isDraft: true, targetCommitish: args[args.indexOf("--target") + 1] };
				} else if (args[1] === "upload") {
					if (!state.draft?.isDraft) process.exit(2);
					if (state.failUploadOnce) {
						state.failUploadOnce = false;
						fs.writeFileSync(process.env.RELEASE_FIXTURE_STATE, JSON.stringify(state));
						process.exit(1);
					}
					state.uploaded = true;
				} else if (args[1] === "edit") {
					if (args.includes("--draft=false")) {
						if (!state.uploaded) process.exit(2);
						state.draft.isDraft = false;
					}
				} else process.exit(2);
				fs.writeFileSync(process.env.RELEASE_FIXTURE_STATE, JSON.stringify(state));
			`,
				);
				const step = jobs["publish-github"].steps.find(
					(entry) => entry.name === "Publish release after all assets are ready",
				);
				const run = () =>
					spawnSync("bash", ["-euo", "pipefail", "-c", `export PATH="${shellPath(bin)}:$PATH"\n${step.run}`], {
						cwd,
						env: {
							...process.env,
							BUILD_VERSION: "1.2.3",
							GITHUB_SHA: sha,
							RELEASE_TARGET: releaseTarget,
							RELEASE_FIXTURE_GH: join(root, "gh.cjs"),
							RELEASE_FIXTURE_STATE: statePath,
							NODE_OPTIONS: `--require "${join(root, "gh-spawn.cjs").replaceAll("\\", "/")}"`,
						},
						encoding: "utf8",
						timeout: 20_000,
					});
				let result = run();
				expect(result.error).toBeUndefined();
				if (target === "stale") {
					expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0);
					expect(result.stderr).toContain("draft target does not match the candidate SHA");
					const { events } = JSON.parse(readFileSync(statePath, "utf8"));
					expect(events.some((args) => args[1] === "upload" || args.includes("--draft=false"))).toBe(false);
					return;
				}
				if (retry) {
					expect(result.status).not.toBe(0);
					const state = JSON.parse(readFileSync(statePath, "utf8"));
					expect(state.draft).toEqual({ tagName: "v1.2.3", isDraft: true, targetCommitish: sha });
					expect(state.events.some((args) => args.includes("--draft=false"))).toBe(false);
					result = run();
				}
				expect(result.error).toBeUndefined();
				expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
				const state = JSON.parse(readFileSync(statePath, "utf8"));
				expect(state.draft.isDraft).toBe(false);
				expect(state.uploaded).toBe(true);
				expect(state.events.filter((args) => args[1] === "create")).toHaveLength(target === "missing" ? 1 : 0);
				expect(state.events.filter((args) => args[1] === "upload")).toHaveLength(retry ? 2 : 1);
				expect(state.events.filter((args) => args.includes("--draft=false"))).toHaveLength(1);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});
	});

	it("runs quality and packaging tests before the platform matrix", () => {
		expect(workflow).toContain("  quality:");
		expect(workflow).toContain("run: bun run check");
		expect(workflow).toContain("run: bun run test:quality");
		expect(workflow).toContain("run: bun run verify:desktop:contracts");
		expect(workflow).toContain("run: bun run test:desktop:packaging");
		expect(workflow).toContain("needs: [prepare, quality]");
	});

	it("verifies the public update feed after either publish target", () => {
		expect(workflow.match(/node scripts\/verify-update-feed\.mjs/g)).toHaveLength(2);
		expect(workflow.match(/needs: \[prepare, quality, build, verify\]/g)).toHaveLength(2);
		for (const target of ["r2", "github"]) {
			const feed = jobs[`verify-feed-${target}`];
			expect(feed.needs).toEqual(["prepare", `publish-${target}`]);
			expect(feed.steps.some((step) => step.run?.includes("verify-update-feed.mjs"))).toBe(true);
			expect(feed.steps.some((step) => step.uses?.includes("download-artifact"))).toBe(false);
			expect(feed.steps.some((step) => /publish:|gh release|matrix.command/.test(step.run ?? ""))).toBe(false);
			expect(JSON.stringify(feed)).not.toContain("secrets.");
		}
	});

	it("runs packaged boot and updater E2E on every release platform", () => {
		expect(workflow).toContain("Run packaged app and updater E2E");
		expect(workflow).toContain('VETTA_E2E_UPDATE_FEED: "1"');
		expect(workflow).toContain("xvfb-run --auto-servernum bun run test:e2e:packaged");
		const initialVerify = workflow.indexOf("- name: Verify platform updater artifacts");
		const packagedE2e = workflow.indexOf("- name: Run packaged app and updater E2E");
		const finalVerify = workflow.indexOf("- name: Re-verify platform updater artifacts after packaged E2E");
		const upload = workflow.indexOf("- name: Upload updater artifacts");
		expect(initialVerify).toBeLessThan(packagedE2e);
		expect(packagedE2e).toBeLessThan(finalVerify);
		expect(finalVerify).toBeLessThan(upload);
	});

	it("keeps the pull-request packaged E2E matrix cross-platform", () => {
		expect(packagedWorkflow).toContain("runner: windows-latest");
		expect(packagedWorkflow).toContain("runner: macos-latest");
		expect(packagedWorkflow).toContain("runner: ubuntu-latest");
		expect(packagedWorkflow).toContain("bun run test:e2e:packaged");
		expect(packagedWorkflow).toContain("xvfb-run --auto-servernum");
	});

	it("installs Linux bubblewrap build dependencies in packaged and release builds", () => {
		for (const workflowSource of [packagedWorkflow, workflow]) {
			expect(workflowSource).toContain("Install Linux packaging dependencies");
			expect(workflowSource).toContain("if: runner.os == 'Linux'");
			expect(workflowSource).toContain("build-essential libcap-dev meson ninja-build pkg-config xz-utils");
		}
	});

	it("builds, verifies, installs, and uploads all Linux release formats", () => {
		expect(workflow).toContain('"command":"dist:linux"');
		expect(workflow).toContain('"verify":"verify:updates:linux:release"');
		expect(workflow).toContain("pkg-config xz-utils rpm");
		expect(workflow).toContain("Verify native Linux package installation");
		expect(workflow).toContain("ubuntu:24.04");
		expect(workflow).toContain("fedora:latest");
		expect(workflow).toContain("dnf install --assumeyes --nogpgcheck");
		const install = jobs.verify.steps.find((step) => step.name === "Verify native Linux package installation");
		expect(install.run).toContain('from "./scripts/linux-packaging-contract.mjs"');
		expect(install.run.match(/--env "PACKAGE_EXECUTABLE=\$\{PACKAGE_EXECUTABLE\}"/g)).toHaveLength(2);
		expect(install.run.match(/--env "PACKAGE_TYPE=\$\{PACKAGE_TYPE\}"/g)).toHaveLength(2);
		expect(install.run.match(/test -x "\$\{PACKAGE_EXECUTABLE\}"/g)).toHaveLength(2);
		expect(install.run).toMatch(/test "\$\(cat "\$\{PACKAGE_TYPE\}"\)" = "deb"/);
		expect(install.run).toMatch(/test "\$\(cat "\$\{PACKAGE_TYPE\}"\)" = "rpm"/);
		expect(install.run).not.toContain("/opt/Open Forge");
		expect(workflow).toContain('-iname "*openforge*.desktop"');
		expect(workflow).not.toContain("/opt/Vetta");
		expect(workflow).toContain("apps/desktop/release/*.AppImage");
		expect(workflow).toContain("apps/desktop/release/*.deb");
		expect(workflow).toContain("apps/desktop/release/*.rpm");
	});

	it("keeps pull-request Linux packaging on the AppImage smoke target", () => {
		expect(packagedWorkflow).toContain("command: dist:linux:test");
		const desktopPackage = JSON.parse(
			readFileSync(join(import.meta.dirname, "../../apps/desktop/package.json"), "utf8"),
		);
		expect(desktopPackage.scripts["dist:linux:test"]).toContain("dist:linux:appimage");
	});

	it("builds, verifies, and uploads all Windows release formats", () => {
		expect(workflow).toContain('"command":"dist:win"');
		expect(workflow).toContain('"verify":"verify:updates:windows"');
		expect(workflow).toContain("Verify supplemental Windows packages");
		expect(workflow).toContain("run: bun run verify:packages:windows");
		expect(workflow).toContain("apps/desktop/release/*.exe");
		expect(workflow).toContain("apps/desktop/release/*.msi");
		expect(workflow).toContain("apps/desktop/release/*.zip");

		const desktopPackage = JSON.parse(
			readFileSync(join(import.meta.dirname, "../../apps/desktop/package.json"), "utf8"),
		);
		expect(desktopPackage.scripts["dist:win"]).toBe("bun run package:win");
		expect(desktopPackage.scripts["package:win"]).toMatch(/--platform win$/);
	});

	it("keeps pull-request Windows packaging on the unpacked smoke target", () => {
		expect(packagedWorkflow).toContain("build-command: pack:win:test");
		const desktopPackage = JSON.parse(
			readFileSync(join(import.meta.dirname, "../../apps/desktop/package.json"), "utf8"),
		);
		expect(desktopPackage.scripts["pack:win:test"]).toContain("pack:win");
	});

	it("installs the Electron audio runtime required by Ubuntu 24.04", () => {
		const packagedSmokeJob = packagedWorkflow.split("\n  smoke:\n")[1];
		const releaseBuildJob = workflow.split("\n  build:\n")[1]?.split("\n  publish-github:\n")[0];
		for (const jobSource of [packagedSmokeJob, releaseBuildJob]) {
			expect(jobSource).toBeDefined();
			expect(jobSource).toContain("Install Linux Electron runtime dependencies");
			expect(jobSource).toContain("libasound2t64");
		}
	});

	it("installs the IM gateway Go toolchain from its module declaration", () => {
		const packagedSmokeJob = packagedWorkflow.split("\n  smoke:\n")[1];
		const releaseBuildJob = workflow.split("\n  build:\n")[1]?.split("\n  publish-github:\n")[0];
		for (const jobSource of [packagedSmokeJob, releaseBuildJob]) {
			expect(jobSource).toBeDefined();
			expect(jobSource).toContain("Set up Go for IM gateway");
			expect(jobSource).toContain("uses: actions/setup-go@v5");
			expect(jobSource).toContain("go-version-file: apps/im-gateway/go.mod");
			expect(jobSource).toContain("cache-dependency-path: apps/im-gateway/go.sum");
		}
	});

	it("uses the same publish jobs for tagged stable and dispatched test/stable releases", () => {
		expect(workflow).toContain("build_version:");
		expect(workflow).toContain("should-publish: $" + "{{ steps.config.outputs.should_publish }}");
		expect(workflow).toContain("needs.prepare.outputs.should-publish == 'true'");
		expect(workflow).toContain("'desktop-test'");
		expect(workflow).toContain("environment: $" + "{{");
		expect(workflow).toContain("'desktop-production' }}");
		expect(workflow).toContain("OUTPUT_BUILD_VERSION");
		expect(workflow).toContain("REQUIRE_RELEASE_SIGNATURE");
		expect(workflow).toContain("needs.prepare.outputs.should-publish == 'true'");
		expect(workflow).toContain('--target "' + "$" + '{GITHUB_SHA}"');
	});

	// im-gateway 的 sidecar 由 prepare-pack.js 交叉编译进发布包，但它的 Go 测试
	// 既不在 `bun run check` 里，im-gateway.yml 也不 gate 本流水线。少了这道门禁，
	// 测试失败的 sidecar 会被静默打包发布。
	it("gates the release on the IM gateway Go tests", () => {
		const qualityJob = workflow.slice(workflow.indexOf("\n  quality:"), workflow.indexOf("\n  build:"));
		expect(qualityJob).toContain("go test ./...");
		expect(qualityJob).toContain("working-directory: apps/im-gateway");
		expect(qualityJob).toContain("go-version-file: apps/im-gateway/go.mod");
	});

	it("builds each macOS architecture on a matching hosted runner", () => {
		expect(workflow).toContain("runs-on: $" + "{{ matrix.runner }}");
		expect(workflow).toContain('"runner":"macos-15"');
		expect(workflow).toContain('"runner":"macos-15-intel"');
		expect(workflow).toContain('"platform":"macos-arm64"');
		expect(workflow).toContain('"platform":"macos-x64"');
		expect(workflow).not.toContain("vetta-mac");
	});

	it("allows enough wall clock for signing and notarizing both macOS architectures", () => {
		const buildJob = workflow.slice(workflow.indexOf("\n  build:"), workflow.indexOf("\n  publish-r2:"));
		const timeout = Number(buildJob.match(/timeout-minutes: (\d+)/)?.[1]);
		expect(timeout).toBeGreaterThanOrEqual(120);
	});

	// R2 是更新源，GitHub Release 是对外的下载入口和版本说明归档。早先两个发布 job
	// 按 release_target 互斥，商业版发版在 GitHub 上什么都看不到。
	it("publishes a GitHub Release alongside R2 for every non-test channel", () => {
		expect(workflow).toContain("  publish-github:");
		expect(workflow).toContain("needs.prepare.outputs.channel != 'test'");
		expect(workflow).not.toContain("needs.prepare.outputs.release_target != 'r2'");
	});

	it("uses the versioned release note as the GitHub Release body", () => {
		expect(workflow).toContain("node scripts/release/release-notes.mjs --check");
		expect(workflow).toContain('--notes-file "' + "$" + '{NOTES_FILE}"');
		expect(workflow).not.toContain("--generate-notes");
		// 正文缺失要在质量阶段就失败，而不是等平台矩阵签名公证跑完。
		const qualityJob = workflow.slice(workflow.indexOf("\n  quality:"), workflow.indexOf("\n  build:"));
		expect(qualityJob).toContain("node scripts/release/release-notes.mjs --check");
	});

	it("publishes the Release under the Open Forge brand and marks 0.x as pre-release", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the literal workflow shell expression
		expect(workflow).toContain('--title "Open Forge ${VERSION}"');
		// biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the literal workflow shell expression
		expect(workflow).not.toContain('"Vetta ${VERSION}"');
		expect(workflow).toContain("=~ ^0\\.");
		expect(workflow).toContain('PRERELEASE_ARGS+=("--prerelease")');
	});

	it("excludes macOS legs from published releases when signing secrets are absent", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the literal GitHub Actions expression
		expect(jobs.build.strategy.matrix.include).toBe("${{ fromJSON(needs.prepare.outputs.platform-matrix) }}");
		expect(jobs.verify.strategy.matrix.include).toBe(jobs.build.strategy.matrix.include);
		expect(jobs.prepare.outputs["platform-matrix"]).toContain("platform-matrix");
		expect(jobs.prepare.outputs["macos-enabled"]).toContain("macos-enabled");
		expect(jobs.prepare.outputs["update-metadata-files"]).toContain("update-metadata-files");
		expect(workflow).toContain("VAR_MACOS_RELEASE");
		expect(workflow).toContain("excluding macOS legs");
		for (const target of ["r2", "github"]) {
			expect(JSON.stringify(jobs[`verify-feed-${target}`])).toContain("VETTA_UPDATE_FEED_METADATA");
		}
	});

	it("allows unsigned macOS releases only through an explicit opt-in", () => {
		expect(workflow).toContain("VAR_ALLOW_UNSIGNED");
		expect(workflow).toContain("VETTA_ALLOW_UNSIGNED_RELEASE");
		expect(workflow).toContain("including unsigned macOS legs");
		expect(workflow).toContain("VETTA_REQUIRE_MAC_SIGNATURE=0");
		expect(workflow).toContain("excluding macOS legs");
	});

	it("can explicitly downgrade the Windows sandbox check for a release", () => {
		expect(workflow).toContain("VETTA_SKIP_WINDOWS_SANDBOX");
		expect(workflow).toContain("VETTA_SKIP_SANDBOX_ARTIFACT_CHECK");
		expect(workflow).toContain("Windows 产物未包含内置沙盒");
	});

	it("provides an isolated test-channel workflow for real install and restart upgrades", () => {
		expect(upgradeWorkflow).toContain("baseline_version:");
		expect(upgradeWorkflow).toContain("candidate_version:");
		expect(upgradeWorkflow).toContain("environment: desktop-test");
		expect(upgradeWorkflow).toContain("bun run test:e2e:upgrade");
		expect(upgradeWorkflow).toContain("xvfb-run --auto-servernum");
		expect(upgradeWorkflow).toContain("upgrade-e2e-diagnostics");
	});
});
