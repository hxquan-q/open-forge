// Copyright The Open Forge contributors.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { contract, digest, requireCapability, validateAdapters } from "./contracts.mjs";
import { assertCheckResults, assertIndependentReview } from "./evidence.mjs";
import { git, snapshot } from "./git.mjs";
import { bindRepository } from "./prepare.mjs";
import { isolatedEnvironment, runProcess } from "./process.mjs";
import { trustedServices, verifyServiceProof } from "./services.mjs";

const PLATFORMS = ["windows", "macos", "linux"];
export function releaseSubject(request, binding, repository) {
	return digest({
		repository,
		binding,
		version: request.productVersion,
		channel: request.channel,
		artifacts: request.artifacts
			.map(({ platform, sha256, size }) => ({ platform, sha256, size }))
			.sort((a, b) => a.platform.localeCompare(b.platform)),
	});
}

function publisherConfiguration(settings) {
	validateAdapters(settings);
	const publisher = settings.publisher;
	if (!publisher?.enabled) throw new Error("publisher is not configured or enabled");
	for (const command of [publisher.command, publisher.queryCommand]) {
		if (!isAbsolute(command[0]) || !existsSync(command[0])) throw new Error("publisher requires a pinned executable");
	}
	if (!isAbsolute(publisher.artifactRoot) || lstatSync(publisher.artifactRoot).isSymbolicLink())
		throw new Error("publisher requires an absolute artifact root without symbolic links");
	return publisher;
}

function artifactFacts(artifacts, directory) {
	const root = realpathSync(directory);
	if (new Set(artifacts.map((artifact) => artifact.platform)).size !== PLATFORMS.length)
		throw new Error("release artifacts must cover all three platforms");
	for (const artifact of artifacts) {
		if (!isAbsolute(artifact.path) || lstatSync(artifact.path).isSymbolicLink())
			throw new Error("invalid artifact path");
		const path = realpathSync(artifact.path);
		const inside = relative(root, path);
		if (
			!inside ||
			isAbsolute(inside) ||
			inside === ".." ||
			inside.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
		)
			throw new Error("artifact escapes the configured root");
		if (!lstatSync(path).isFile()) throw new Error("artifact must be a regular file");
		const body = readFileSync(path);
		if (body.length !== artifact.size || createHash("sha256").update(body).digest("hex") !== artifact.sha256)
			throw new Error("artifact bytes do not match their declared digest");
	}
}

function authorize({ root, store, policy, settings, request, proofs, now }) {
	contract("release-request", request);
	requireCapability(policy, request.channel === "stable" ? "publish-stable" : "publish-test");
	if (request.channel === "stable") requireCapability(policy, "promote-main");
	const publisher = publisherConfiguration(settings);
	bindRepository(store, root);
	if (store.read().control.paused) throw new Error("controller is paused");
	const remote = git(root, ["remote", "get-url", "origin"]);
	if (
		![
			`https://github.com/${publisher.repository}.git`,
			`https://github.com/${publisher.repository}`,
			`git@github.com:${publisher.repository}.git`,
		].includes(remote)
	)
		throw new Error("publisher repository does not match origin");
	const run = store.read().runs[request.runId];
	if (run?.status !== "integrated" || run.integration?.phase !== "applied")
		throw new Error("release requires an integrated final candidate");
	if (run.contract.policyDigest !== digest(policy) || run.contract.adaptersDigest !== digest(settings))
		throw new Error("release policy or settings changed");
	const evidence = run.integration.evidence;
	if (!evidence || digest(evidence.binding) !== digest(run.binding))
		throw new Error("integrated evidence is missing or stale");
	assertCheckResults(evidence.checks, policy.requiredChecks, evidence.binding);
	assertIndependentReview(evidence.review, evidence.authors, evidence.binding, policy.differentReviewerFamily);
	const current = snapshot(root);
	if (
		git(root, ["branch", "--show-current"]) !== "main" ||
		current.head !== evidence.binding.head ||
		current.tree !== evidence.binding.tree
	)
		throw new Error("release candidate no longer matches clean local main");
	const packageJson = JSON.parse(git(root, ["show", `${current.head}:apps/desktop/package.json`]));
	if (packageJson.version !== request.productVersion)
		throw new Error("release version differs from the committed Desktop version");
	artifactFacts(request.artifacts, publisher.artifactRoot);
	const subject = releaseSubject(request, evidence.binding, publisher.repository);
	const trust = trustedServices(store.root);
	const verified = proofs.map((proof) => verifyServiceProof(proof, { kind: proof.payload.kind, subject, trust, now }));
	const ci = verified.find((proof) => proof.kind === "ci");
	const required = [...policy.requiredChecks, "desktop-packaged", ...PLATFORMS.map((platform) => `tests/${platform}`)];
	if (
		!ci ||
		ci.data.repository !== publisher.repository ||
		ci.data.head !== current.head ||
		ci.data.tree !== current.tree ||
		required.some((check) => !ci.data.checks.includes(check))
	)
		throw new Error("trusted CI proof is missing required final-candidate checks");
	for (const artifact of request.artifacts) {
		if (
			!verified.some(
				(proof) =>
					proof.kind === "artifact" &&
					proof.data.platform === artifact.platform &&
					proof.data.version === request.productVersion &&
					proof.data.head === current.head &&
					proof.data.sha256 === artifact.sha256 &&
					proof.data.size === artifact.size,
			)
		)
			throw new Error(`trusted signed artifact proof missing: ${artifact.platform}`);
	}
	return { subject, publisher, binding: evidence.binding };
}

function acceptReceipt(store, id, document, settings, now, operation, generation) {
	const release = store.read().releases[id];
	if (release.generation !== generation || digest(release.operation) !== digest(operation))
		throw new Error("publisher operation was fenced during execution");
	const payload = verifyServiceProof(document, {
		kind: "publication",
		subject: release.subject,
		trust: trustedServices(store.root),
		now,
	});
	const data = payload.data;
	if (
		payload.keyId !== settings.publisher.keyId ||
		data.idempotencyKey !== operation.key ||
		data.operation !== operation.dispatched
	)
		throw new Error("publisher receipt does not match the dispatched operation");
	if (payload.issuedAt < operation.startedAt - 1000) throw new Error("publisher receipt predates the operation");
	if (data.status !== "not-found" && data.rolloutPercent !== operation.percent)
		throw new Error("publisher receipt rollout differs from intent");
	if (data.status === "not-found" && operation.dispatched !== "query")
		throw new Error("publication returned an unknown release");
	if (operation.dispatched !== "query" && (operation.action === "pause") !== (data.status === "paused"))
		throw new Error("publisher did not confirm the requested state");
	return store.transaction((state) => {
		const item = state.releases[id];
		if (digest(item.operation) !== digest(operation)) throw new Error("publication operation changed");
		item.receipts.push(document);
		item.status = data.status === "not-found" ? "unpublished-confirmed" : data.status;
		if (operation.action === "pause" && data.status === "published") item.status = "pause-required";
		if (
			data.status === "published" &&
			(item.percent !== data.rolloutPercent || item.stageStartedAt === null || operation.action === "resume")
		)
			item.stageStartedAt = now;
		item.percent = data.rolloutPercent;
		item.remoteId = data.remoteId;
		item.operation.status = "confirmed";
		item.pid = null;
		state.audit.push({ event: "release-receipt", id, status: item.status, at: now });
		return item;
	});
}

async function dispatch({ root, store, policy, settings, id, action, percent, now = Date.now(), query = false }) {
	const publisher = publisherConfiguration(settings);
	const expected = digest(store.read().releases[id]);
	store.transaction((state) => {
		const item = state.releases[id];
		if (digest(item) !== expected) throw new Error("release changed before dispatch");
		if (item.cleanupUnknown) throw new Error("publisher cleanup requires recovery");
		if (state.control.paused && !query && action !== "pause") throw new Error("controller is paused");
		if (!query) {
			if (action === "publish" && item.status !== "prepared") throw new Error("publication already started");
			if (
				action === "advance" &&
				(item.status !== "published" ||
					percent !== policy.rollout.steps[policy.rollout.steps.indexOf(item.percent) + 1])
			)
				throw new Error("rollout stage changed before advance");
			if (["pause", "resume"].includes(action) && percent !== item.percent)
				throw new Error("rollout stage changed before control action");
			if (action === "resume" && item.status !== "paused") throw new Error("release is not paused");
			if (action === "pause" && !["published", "pause-required"].includes(item.status))
				throw new Error("release cannot be paused before reconciliation");
			item.generation++;
			item.operation = {
				action,
				dispatched: action,
				percent,
				key: digest([id, item.generation, action, percent]),
				startedAt: now,
				status: "pending",
			};
		} else {
			if (item.status !== "publication-unknown" || item.operation.status !== "unknown")
				throw new Error("release has no unknown operation to reconcile");
			item.generation++;
			item.operation.dispatched = "query";
			item.operation.status = "pending";
		}
		item.status = "publishing";
		state.audit.push({ event: query ? "release-query" : "release-intent", id, action, percent, at: now });
	});
	const item = store.read().releases[id];
	let processResult;
	try {
		processResult = await runProcess({
			command: query ? publisher.queryCommand : publisher.command,
			cwd: root,
			env: isolatedEnvironment(join(store.root, "publisher-process")),
			input: JSON.stringify({
				operation: query ? "query" : action,
				subject: item.subject,
				idempotencyKey: item.operation.key,
				percent,
				repository: publisher.repository,
				version: item.version,
				channel: item.channel,
				artifacts: item.artifacts,
				requestedAt: now,
			}),
			timeoutMs: policy.limits.wallTimeMs,
			stallMs: policy.limits.stallMs,
			maxOutputBytes: policy.limits.outputBytes,
			onSpawn: (pid) =>
				store.transaction((state) => {
					if (state.releases[id].generation !== item.generation) throw new Error("publisher process was fenced");
					state.releases[id].pid = pid;
				}),
		});
		if (processResult.reason !== "success") throw new Error(`publisher ended with ${processResult.reason}`);
		const receivedAt = Math.max(now, Date.now());
		return acceptReceipt(
			store,
			id,
			JSON.parse(processResult.stdout),
			settings,
			receivedAt,
			item.operation,
			item.generation,
		);
	} catch (error) {
		return store.transaction((state) => {
			const release = state.releases[id];
			if (release.generation !== item.generation || digest(release.operation) !== digest(item.operation))
				return release;
			release.status = "publication-unknown";
			release.operation.status = "unknown";
			release.failure = error.message;
			release.cleanupUnknown = processResult?.cleanupUnknown ?? false;
			if (release.cleanupUnknown) state.control.paused = true;
			release.pid = release.cleanupUnknown ? processResult.pid : null;
			state.audit.push({ event: "release-unknown", id, at: now });
			return release;
		});
	}
}

export async function publishRelease(context) {
	const now = context.now ?? Date.now();
	const { subject, binding } = authorize({ ...context, now });
	const id = digest([subject, context.request.runId]);
	const existing = context.store.read().releases[id];
	if (existing) return existing;
	context.store.transaction((state) => {
		if (state.releases[id]) throw new Error("release intent already exists");
		if (
			Object.values(state.releases).some(
				(item) => item.version === context.request.productVersion && item.channel === context.request.channel,
			)
		)
			throw new Error("release version and channel are already reserved");
		state.releases[id] = {
			id,
			subject,
			binding,
			version: context.request.productVersion,
			channel: context.request.channel,
			artifacts: context.request.artifacts,
			policyDigest: digest(context.policy),
			publisherDigest: digest(context.settings.publisher),
			status: "prepared",
			generation: 0,
			percent: 0,
			stageStartedAt: null,
			receipts: [],
			cleanupUnknown: false,
			pid: null,
		};
	});
	return dispatch({ ...context, id, action: "publish", percent: context.policy.rollout.steps[0], now });
}

function existingRelease(context) {
	const item = context.store.read().releases[context.id];
	if (!item) throw new Error("unknown release");
	if (item.publisherDigest !== digest(context.settings.publisher))
		throw new Error("publisher changed; operator reconciliation required");
	return item;
}

export function reconcileRelease(context) {
	const release = existingRelease(context);
	return dispatch({ ...context, action: release.operation.action, percent: release.operation.percent, query: true });
}

export function rolloutDecision(release, documents, policy, trust, now = Date.now()) {
	let telemetry;
	let insufficientSamples = false;
	try {
		telemetry = documents.map((document) => {
			const payload = verifyServiceProof(document, { kind: "telemetry", subject: release.subject, trust, now });
			if (payload.issuedAt + 1000 < payload.data.to)
				throw new Error("telemetry proof predates its observation window");
			return payload.data;
		});
		if (new Set(telemetry.map((item) => item.platform)).size !== 3 || telemetry.length !== 3)
			throw new Error("missing platform telemetry");
		for (const item of telemetry) {
			if (
				item.from > item.to ||
				item.to > now ||
				now - item.to > policy.rollout.maxTelemetryAgeMs ||
				item.crashes > item.sessions ||
				item.baselineCrashes > item.baselineSessions
			)
				throw new Error("invalid or stale telemetry");
			if (item.sessions < policy.rollout.minSessions || item.baselineSessions < policy.rollout.minSessions) {
				insufficientSamples = true;
				continue;
			}
			const rate = item.crashes / item.sessions;
			const baseline = item.baselineCrashes / item.baselineSessions;
			if (
				rate > policy.rollout.maxCrashRate ||
				(baseline === 0 ? rate > 0 : rate > baseline * policy.rollout.maxCrashRatio)
			)
				return { action: "pause", reason: "crash-threshold" };
		}
	} catch (error) {
		return { action: "pause", reason: error.message };
	}
	if (insufficientSamples) return { action: "hold", reason: "insufficient-samples" };
	if (
		telemetry.some(
			(item) => item.from > release.stageStartedAt || item.to < release.stageStartedAt + policy.rollout.holdMs,
		) ||
		now - release.stageStartedAt < policy.rollout.holdMs
	)
		return { action: "hold", reason: "observation-window" };
	const index = policy.rollout.steps.indexOf(release.percent);
	if (index < 0) return { action: "pause", reason: "unknown-rollout-stage" };
	return index === policy.rollout.steps.length - 1
		? { action: "hold", reason: "full-rollout-observed" }
		: { action: "advance", percent: policy.rollout.steps[index + 1], reason: "healthy-observation-window" };
}

export async function updateRollout(context) {
	const release = existingRelease(context);
	if (!["published", "pause-required", "paused"].includes(release.status))
		throw new Error("release needs publication reconciliation first");
	const now = context.now ?? Date.now();
	const decision =
		release.policyDigest !== digest(context.policy) || context.policy.paused || context.store.read().control.paused
			? { action: "pause", reason: "policy-changed-or-paused" }
			: rolloutDecision(release, context.proofs, context.policy, trustedServices(context.store.root), now);
	context.store.transaction((state) => {
		state.releases[context.id].lastDecision = { ...decision, at: now };
	});
	if (decision.action === "hold" || (decision.action === "pause" && release.status === "paused"))
		return context.store.read().releases[context.id];
	if (decision.action === "advance") {
		requireCapability(context.policy, release.channel === "stable" ? "publish-stable" : "publish-test");
		if (release.status === "paused") throw new Error("paused release requires explicit operator resume");
	} else
		context.store.transaction((state) => {
			state.releases[context.id].status = "pause-required";
		});
	return dispatch({ ...context, action: decision.action, percent: decision.percent ?? release.percent, now });
}

export function resumeRollout(context) {
	const release = existingRelease(context);
	if (release.status !== "paused" || release.policyDigest !== digest(context.policy))
		throw new Error("release is not paused under the current policy");
	requireCapability(context.policy, release.channel === "stable" ? "publish-stable" : "publish-test");
	const now = context.now ?? Date.now();
	const decision = rolloutDecision(release, context.proofs, context.policy, trustedServices(context.store.root), now);
	if (!["healthy-observation-window", "full-rollout-observed"].includes(decision.reason))
		throw new Error("resume requires a fresh complete healthy observation window");
	return dispatch({ ...context, action: "resume", percent: release.percent, now });
}
