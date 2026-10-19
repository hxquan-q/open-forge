// Copyright The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { digest } from "./contracts.mjs";
import { git, snapshot } from "./git.mjs";
import {
	publishRelease,
	reconcileRelease,
	releaseSubject,
	resumeRollout,
	rolloutDecision,
	updateRollout,
} from "./release.mjs";
import { canonical } from "./schema.mjs";
import { cleanupSubject, recoverCleanup, trustedServices, verifyServiceProof } from "./services.mjs";
import { createStore } from "./store.mjs";

const roots = [];
function fixture({ loseResponse = false } = {}) {
	const root = mkdtempSync(join(tmpdir(), "forge-release-"));
	roots.push(root);
	const repo = join(root, "repo");
	execFileSync("git", ["init", "--quiet", "--initial-branch=main", repo], { windowsHide: true });
	git(repo, ["config", "user.name", "Fixture"]);
	git(repo, ["config", "user.email", "fixture@example.invalid"]);
	git(repo, ["config", "commit.gpgsign", "false"]);
	git(repo, ["remote", "add", "origin", "https://github.com/hxquan-q/open-forge.git"]);
	writeFileSync(join(repo, "feature.txt"), "candidate");
	mkdirSync(join(repo, "apps", "desktop"), { recursive: true });
	writeFileSync(join(repo, "apps", "desktop", "package.json"), JSON.stringify({ version: "0.1.3" }));
	git(repo, ["add", "--", "feature.txt", "apps/desktop/package.json"]);
	git(repo, ["commit", "--quiet", "-m", "candidate"]);
	const store = createStore(join(root, "state"));
	const keys = generateKeyPairSync("ed25519");
	const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
	writeFileSync(
		join(store.root, "trusted-services.json"),
		JSON.stringify({
			version: 1,
			keys: [{ id: "fixture", publicKey, roles: ["ci", "artifact", "publication", "telemetry", "cleanup"] }],
		}),
	);
	const proof = (kind, subject, data, now = Date.now()) => {
		const payload = {
			version: 1,
			kind,
			keyId: "fixture",
			issuedAt: now - 100,
			expiresAt: now + 60000,
			subject,
			data,
		};
		return { payload, signature: sign(null, Buffer.from(canonical(payload)), keys.privateKey).toString("base64") };
	};
	const policy = JSON.parse(
		readFileSync(fileURLToPath(new URL("../../project/autonomy-policy.json", import.meta.url)), "utf8"),
	);
	policy.level = 4;
	policy.capabilities = ["publish-test", "publish-stable", "promote-main"];
	policy.requiredChecks = ["tests", "check"];
	policy.limits.wallTimeMs = 5000;
	policy.limits.stallMs = 3000;
	const artifacts = ["windows", "macos", "linux"].map((platform) => {
		writeFileSync(join(root, `${platform}.bin`), platform);
		return {
			platform,
			path: join(root, `${platform}.bin`),
			sha256: digest(platform),
			size: Buffer.byteLength(platform),
		};
	});
	const remotePath = join(root, "remote.json");
	const publisherPath = join(root, "publisher.mjs");
	const keyPath = join(root, "fixture-private.pem");
	writeFileSync(keyPath, keys.privateKey.export({ type: "pkcs8", format: "pem" }));
	const canonicalPath = fileURLToPath(new URL("./schema.mjs", import.meta.url));
	writeFileSync(
		publisherPath,
		`import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {sign} from 'node:crypto';import {pathToFileURL} from 'node:url';const {canonical}=await import(pathToFileURL(${JSON.stringify(canonicalPath)}));let input='';for await(const c of process.stdin)input+=c;const request=JSON.parse(input);const file=${JSON.stringify(remotePath)};let remote=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;if(request.operation!=='query'){remote={calls:(remote?.calls??0)+1,status:request.operation==='pause'?'paused':'published',rolloutPercent:request.percent};writeFileSync(file,JSON.stringify(remote));}const payload={version:1,kind:'publication',keyId:'fixture',issuedAt:Math.max(Date.now(),request.requestedAt),expiresAt:Math.max(Date.now(),request.requestedAt)+60000,subject:request.subject,data:{idempotencyKey:request.idempotencyKey,operation:request.operation,status:remote?.status??'not-found',rolloutPercent:remote?.rolloutPercent??0,remoteId:'fixture-release'}};if(${loseResponse}&&request.operation==='publish'){console.log('response lost');}else{console.log(JSON.stringify({payload,signature:sign(null,Buffer.from(canonical(payload)),readFileSync(${JSON.stringify(keyPath)})).toString('base64')}));}`,
	);
	const settings = {
		version: 1,
		adapters: [
			{
				id: "fixture",
				enabled: false,
				provider: "fixture",
				family: "fixture",
				model: "unconfigured",
				roles: ["reviewer"],
				command: [process.execPath],
				doctorCommand: [process.execPath, "--version"],
				isolation: "none",
			},
		],
		publisher: {
			enabled: true,
			repository: "hxquan-q/open-forge",
			command: [process.execPath, publisherPath],
			queryCommand: [process.execPath, publisherPath],
			keyId: "fixture",
			artifactRoot: root,
		},
	};
	const code = snapshot(repo);
	const binding = { head: code.head, tree: code.tree, policy: digest(policy), contract: digest("fixture contract") };
	const author = { actorId: "author", family: "family-a", model: "fixture" };
	const review = {
		verdict: "approve",
		findings: [],
		reviewer: { actorId: "reviewer", family: "family-b", model: "fixture" },
		binding,
	};
	const checks = ["tests", "check"].map((id) => ({
		id,
		status: "passed",
		exitCode: 0,
		binding,
		...(id === "tests" ? { tests: { passed: 1, failed: 0 } } : {}),
	}));
	store.transaction((state) => {
		state.runs.run = {
			task: "TASK-0001",
			status: "integrated",
			contract: { adaptersDigest: digest(settings), policyDigest: digest(policy) },
			binding,
			authors: [author],
			checks,
			review,
			integration: { phase: "applied", evidence: { binding, authors: [author], checks, review } },
		};
	});
	const request = { version: 1, runId: "run", productVersion: "0.1.3", channel: "stable", artifacts };
	const subject = releaseSubject(request, binding, settings.publisher.repository);
	const proofs = [
		proof("ci", subject, {
			repository: settings.publisher.repository,
			head: code.head,
			tree: code.tree,
			checks: ["tests", "check", "desktop-packaged", "tests/windows", "tests/macos", "tests/linux"],
			passed: true,
		}),
		...artifacts.map((artifact) =>
			proof("artifact", subject, {
				platform: artifact.platform,
				version: request.productVersion,
				head: code.head,
				sha256: artifact.sha256,
				size: artifact.size,
				signatureVerified: true,
			}),
		),
	];
	return { root: repo, repo, store, policy, settings, request, proofs, proof, subject, remotePath };
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("publishes once only after CI and artifact proofs, then holds, advances and confirms a remote pause", async () => {
	const context = fixture();
	const release = await publishRelease(context);
	expect(release).toMatchObject({ status: "published", percent: 1 });
	expect((await publishRelease(context)).id).toBe(release.id);
	expect(JSON.parse(readFileSync(context.remotePath, "utf8")).calls).toBe(1);
	const later = release.stageStartedAt + context.policy.rollout.holdMs + 100;
	const telemetry = context.request.artifacts.map((artifact) =>
		context.proof(
			"telemetry",
			context.subject,
			{
				platform: artifact.platform,
				from: release.stageStartedAt,
				to: later,
				sessions: 500,
				crashes: 1,
				baselineSessions: 500,
				baselineCrashes: 1,
			},
			later,
		),
	);
	expect(rolloutDecision(release, [], context.policy, new Map(), later).action).toBe("pause");
	const advanced = await updateRollout({ ...context, id: release.id, proofs: telemetry, now: later });
	expect(advanced).toMatchObject({ status: "published", percent: 10 });
	const paused = await updateRollout({ ...context, id: release.id, proofs: [], now: later + 1 });
	expect(paused.status).toBe("paused");
	expect(JSON.parse(readFileSync(context.remotePath, "utf8")).status).toBe("paused");
	const resumedAt = advanced.stageStartedAt + context.policy.rollout.holdMs + 100;
	const healthy = context.request.artifacts.map((artifact) =>
		context.proof(
			"telemetry",
			context.subject,
			{
				platform: artifact.platform,
				from: advanced.stageStartedAt,
				to: resumedAt,
				sessions: 500,
				crashes: 1,
				baselineSessions: 500,
				baselineCrashes: 1,
			},
			resumedAt,
		),
	);
	const resumed = await resumeRollout({ ...context, id: release.id, proofs: healthy, now: resumedAt });
	expect(resumed).toMatchObject({ status: "published", percent: 10, stageStartedAt: resumedAt });
	expect(
		rolloutDecision(resumed, healthy, context.policy, trustedServices(context.store.root), resumedAt).reason,
	).toBe("observation-window");
});

it("reconciles a lost response before any retry and never treats local intent as published", async () => {
	const context = fixture({ loseResponse: true });
	const unknown = await publishRelease(context);
	expect(unknown.status).toBe("publication-unknown");
	expect((await publishRelease(context)).status).toBe("publication-unknown");
	expect(JSON.parse(readFileSync(context.remotePath, "utf8")).calls).toBe(1);
	const recovered = await reconcileRelease({ ...context, id: unknown.id });
	expect(recovered.status).toBe("published");
	expect(JSON.parse(readFileSync(context.remotePath, "utf8")).calls).toBe(1);
});

it("rejects unsigned, wrong-subject, missing-platform and stale authorization before dispatch", async () => {
	const context = fixture();
	await expect(publishRelease({ ...context, proofs: context.proofs.slice(0, 3) })).rejects.toThrow(/artifact/);
	const altered = structuredClone(context.proofs[0]);
	altered.payload.data.passed = false;
	await expect(publishRelease({ ...context, proofs: [altered, ...context.proofs.slice(1)] })).rejects.toThrow();
	const proof = context.proofs[0];
	const future = context.proof("ci", context.subject, proof.payload.data, Date.now() + 60000);
	const expired = context.proof("ci", context.subject, proof.payload.data, Date.now() - 120000);
	for (const invalidTime of [future, expired])
		expect(() =>
			verifyServiceProof(invalidTime, {
				kind: "ci",
				subject: context.subject,
				trust: trustedServices(context.store.root),
			}),
		).toThrow(/clock interval/);
	const tampered = structuredClone(proof);
	tampered.payload.data.checks = ["tests"];
	expect(() =>
		verifyServiceProof(tampered, {
			kind: "ci",
			subject: context.subject,
			trust: trustedServices(context.store.root),
		}),
	).toThrow(/signature/);
	expect(() =>
		verifyServiceProof(proof, { kind: "ci", subject: "a".repeat(64), trust: trustedServices(context.store.root) }),
	).toThrow(/subject/);
	await expect(publishRelease({ ...context, policy: { ...context.policy, level: 0 } })).rejects.toThrow(/paused/);
	writeFileSync(context.request.artifacts[0].path, "tampered");
	await expect(publishRelease(context)).rejects.toThrow(/artifact/);
});

it("requires sandbox-owner proof to recover unknown cleanup and keeps the operator pause", () => {
	const context = fixture();
	context.store.transaction((state) => {
		state.runs.orphan = { task: "TASK-0002", status: "cleanup-required", pid: 999999, cleanupUnknown: true };
		state.leases["TASK-0002"] = { generation: 4, runId: "orphan" };
		state.control.paused = true;
	});
	const subject = cleanupSubject(context.store.read(), "run", "orphan");
	const proof = context.proof("cleanup", subject, {
		resource: "run",
		id: "orphan",
		generation: 4,
		resourceId: "fixture-vm",
		processTreeGone: true,
		mountsRevoked: true,
		credentialsRevoked: true,
	});
	expect(recoverCleanup(context.store, proof)).toEqual({
		resource: "run",
		id: "orphan",
		status: "failed",
		paused: true,
	});
	expect(() => recoverCleanup(context.store, proof)).toThrow(/cleanup/);
	expect(context.store.read().leases["TASK-0002"]).toMatchObject({ generation: 5, status: "released" });
});

it("does not let one undersampled platform hide another platform's crash regression", async () => {
	const context = fixture();
	const release = await publishRelease(context);
	const now = Date.now();
	const proofs = context.request.artifacts.map((artifact, index) =>
		context.proof(
			"telemetry",
			context.subject,
			{
				platform: artifact.platform,
				from: now - 1000,
				to: now,
				sessions: index === 0 ? 1 : 500,
				crashes: index === 1 ? 100 : 0,
				baselineSessions: 500,
				baselineCrashes: 1,
			},
			now,
		),
	);
	expect(rolloutDecision(release, proofs, context.policy, trustedServices(context.store.root), now)).toMatchObject({
		action: "pause",
		reason: "crash-threshold",
	});
});

it("fences an interrupted publisher before reconciling its idempotent remote result", async () => {
	const context = fixture({ loseResponse: true });
	const item = await publishRelease(context);
	context.store.transaction((state) => {
		state.releases[item.id].status = "publishing";
		state.releases[item.id].operation.status = "pending";
		state.releases[item.id].pid = 999999;
	});
	await expect(reconcileRelease({ ...context, id: item.id })).rejects.toThrow(/unknown/);
	const subject = cleanupSubject(context.store.read(), "release", item.id);
	const proof = context.proof("cleanup", subject, {
		resource: "release",
		id: item.id,
		generation: item.generation,
		resourceId: "fixture-publisher-job",
		processTreeGone: true,
		mountsRevoked: true,
		credentialsRevoked: true,
	});
	expect(recoverCleanup(context.store, proof).paused).toBe(true);
	expect(context.store.read().releases[item.id].generation).toBe(item.generation + 1);
	expect((await reconcileRelease({ ...context, id: item.id })).status).toBe("published");
	expect(context.store.read().control.paused).toBe(true);
});

it("can still request a protective pause when policy is disabled after publication", async () => {
	const context = fixture();
	const item = await publishRelease(context);
	const paused = await updateRollout({
		...context,
		id: item.id,
		policy: { ...context.policy, paused: true },
		proofs: [],
	});
	expect(paused).toMatchObject({
		status: "paused",
		lastDecision: { action: "pause", reason: "policy-changed-or-paused" },
	});
});

it("reserves a version and channel across run ids to prevent duplicate publication", async () => {
	const context = fixture();
	await publishRelease(context);
	context.store.transaction((state) => {
		state.runs.other = structuredClone(state.runs.run);
	});
	await expect(publishRelease({ ...context, request: { ...context.request, runId: "other" } })).rejects.toThrow(
		/version.*reserved/,
	);
	expect(JSON.parse(readFileSync(context.remotePath, "utf8")).calls).toBe(1);
});
