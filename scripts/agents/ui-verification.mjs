// Copyright The Open Forge contributors.
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { contract, digest } from "./contracts.mjs";
import { isolatedEnvironment, runProcess } from "./process.mjs";
import { assertSchema } from "./schema.mjs";

export const UI_COVERAGE = ["mono", "sand", "default"].flatMap((theme) =>
	["light", "dark"].map((mode) => `${theme}/${mode}`),
);
export const imageDigest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function uiPlan(value) {
	contract("ui-plan", value);
	if (!value.steps.some((s) => ["click", "fill"].includes(s.action)))
		throw new Error("UI acceptance requires an interaction");
	if (value.steps.some((s) => ["fill", "text"].includes(s.action) && typeof s.value !== "string"))
		throw new Error("UI step requires a value");
	return value;
}
const reportProperties = {
	version: { const: 1 },
	profile: { const: "fresh" },
	binding: { type: "string" },
	planDigest: { type: "string" },
	passed: { type: "boolean" },
	cleanupKnown: { type: "boolean" },
	errors: { type: "array", items: { type: "string" } },
	checks: {
		type: "array",
		maxItems: 6,
		items: {
			type: "object",
			additionalProperties: false,
			required: ["theme", "mode", "assertions", "screenshot"],
			properties: {
				theme: { enum: ["mono", "sand", "default"] },
				mode: { enum: ["light", "dark"] },
				assertions: { type: "integer", minimum: 1 },
				screenshot: {
					type: "object",
					additionalProperties: false,
					required: ["path", "sha256"],
					properties: { path: { type: "string" }, sha256: { type: "string", pattern: "^[a-f0-9]{64}$" } },
				},
			},
		},
	},
};
export function assertUiReport(report, { plan, binding, artifactRoot }) {
	assertSchema(
		{
			type: "object",
			additionalProperties: false,
			required: Object.keys(reportProperties),
			properties: reportProperties,
		},
		report,
	);
	if (!report.cleanupKnown) throw new Error("UI cleanup is unknown");
	if (!report.passed || report.errors.length || report.planDigest !== digest(plan) || report.binding !== binding)
		throw new Error("UI acceptance failed or report binding changed");
	const coverage = new Set(report.checks.map((c) => `${c.theme}/${c.mode}`));
	if (coverage.size !== 6 || UI_COVERAGE.some((id) => !coverage.has(id)))
		throw new Error("UI acceptance needs all six theme/mode results");
	const root = realpathSync(artifactRoot);
	for (const check of report.checks) {
		if (check.assertions < plan.steps.length + 2) throw new Error("UI report contains insufficient assertions");
		const path = check.screenshot.path;
		if (!isAbsolute(path)) throw new Error("UI artifact path must be absolute");
		const rel = relative(root, realpathSync(path));
		if (
			!rel ||
			rel.startsWith("..") ||
			isAbsolute(rel) ||
			statSync(path).size > 16777216 ||
			imageDigest(readFileSync(path)) !== check.screenshot.sha256
		)
			throw new Error("UI artifact changed or escaped its directory");
	}
	return report;
}

export function assertVisualReview(run, report, binding) {
	const review = run.analyses?.filter((a) => a.role === "ui-reviewer").at(-1);
	const body = review?.output?.body;
	if (
		!review ||
		review.binding.head !== binding.head ||
		review.binding.tree !== binding.tree ||
		run.authors.some((a) => a.actorId === review.identity.actorId || a.family === review.identity.family) ||
		body?.verdict !== "approve" ||
		body.gaps.length ||
		body.findings.some((f) => ["blocker", "high", "medium"].includes(f.severity)) ||
		body.artifactDigest !== digest(report.checks) ||
		UI_COVERAGE.some((id) => !body.coverage?.includes(id))
	)
		throw new Error(
			"UI runtime passed; independent visual review is still required for the exact artifacts and six themes",
		);
	return review;
}

/** The driver owns only the host it starts. Every failure still attempts full cleanup. */
export async function runUiVerification({ authorized, plan, binding, reportPath, driver }) {
	if (authorized !== true) throw new Error("Explicit UI execution authorization is required");
	uiPlan(plan);
	if (!/^[a-f0-9]{64}$/u.test(binding ?? "")) throw new Error("invalid UI binding");
	await driver.preflight();
	const report = {
		version: 1,
		profile: "fresh",
		binding,
		planDigest: digest(plan),
		passed: false,
		cleanupKnown: false,
		checks: [],
		errors: [],
	};
	try {
		await driver.start();
		const runtime = await driver.accept();
		report.checks = runtime.checks;
		report.errors = runtime.errors;
		report.passed = report.errors.length === 0;
	} catch (error) {
		report.errors.push(error.message);
	} finally {
		try {
			report.cleanupKnown = (await driver.stop()) === true;
		} catch {
			report.cleanupKnown = false;
		}
		if (!report.cleanupKnown) report.passed = false;
		writeFileSync(reportPath, JSON.stringify(report), { mode: 0o600 });
	}
	if (report.passed) assertUiReport(report, { plan, binding, artifactRoot: dirname(reportPath) });
	return report;
}

function jsonOutput(stdout) {
	for (const line of stdout.trim().split(/\r?\n/u).reverse()) {
		try {
			return JSON.parse(line);
		} catch {
			/* Skip command traces. */
		}
	}
	throw new Error("UI command returned no JSON report");
}
export function uiDriver({ root, planPath, reportPath, binding, signal }) {
	const runId = randomUUID();
	const script = join(root, "apps/desktop/scripts/ui-verification.mjs");
	const env = isolatedEnvironment(join(dirname(reportPath), "ui-environment"));
	const host = new AbortController();
	const abort = () => host.abort();
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) host.abort();
	let serving;
	let finished;
	const command = async (action, extra = [], cleanup = false) => {
		const result = await runProcess({
			command: ["bun", script, action, "--profile", "fresh", "--run-id", runId, ...extra],
			cwd: root,
			env,
			signal: cleanup ? undefined : signal,
			timeoutMs: cleanup ? 10000 : 120000,
			stallMs: 120000,
		});
		if (result.cleanupUnknown) throw new Error("UI command cleanup unknown");
		return { ...result, data: cleanup ? null : jsonOutput(result.stdout) };
	};
	return {
		async preflight() {
			const status = await command("status");
			if (status.data.hostPid || status.data.running)
				throw new Error("Existing fresh UI host must be stopped by its owner");
		},
		async start() {
			serving = runProcess({
				command: ["bun", script, "serve", "--profile", "fresh", "--run-id", runId],
				cwd: root,
				env,
				signal: host.signal,
				timeoutMs: 240000,
				stallMs: 240000,
			}).then((r) => {
				finished = r;
				return r;
			});
			const deadline = Date.now() + 120000;
			while (Date.now() < deadline && !host.signal.aborted) {
				if (finished) throw new Error("UI host exited before readiness");
				const status = await command("status");
				if (status.data.ready && status.data.runId === runId) return;
				await delay(500, undefined, { signal: host.signal });
			}
			throw new Error("UI host readiness timed out or was cancelled");
		},
		async accept() {
			const result = await command("accept", [planPath, reportPath, binding]);
			if (result.reason !== "success") throw new Error("UI acceptance command failed");
			return result.data;
		},
		async stop() {
			signal?.removeEventListener("abort", abort);
			if (!serving) return true;
			let detached = false;
			try {
				detached = (await command("detach", [], true)).reason === "success";
			} catch {
				detached = false;
			} finally {
				host.abort();
			}
			const result = await serving;
			return detached && !result.cleanupUnknown && ["cancelled", "success"].includes(result.reason);
		},
	};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const [authorization, planPath, reportPath, binding] = process.argv.slice(2);
		if (authorization !== "--authorize-ui" || !planPath || !reportPath || !binding || process.argv.length !== 6)
			throw new Error("Expected --authorize-ui <plan> <report> <binding>");
		const plan = uiPlan(JSON.parse(readFileSync(planPath, "utf8")));
		mkdirSync(dirname(reportPath), { recursive: true });
		const signal = new AbortController();
		for (const name of ["SIGINT", "SIGTERM"]) process.once(name, () => signal.abort());
		const result = await runUiVerification({
			authorized: true,
			plan,
			binding,
			reportPath,
			driver: uiDriver({ root: process.cwd(), planPath, reportPath, binding, signal: signal.signal }),
		});
		console.log(JSON.stringify(result));
		if (!result.passed) process.exitCode = 1;
	} catch (error) {
		console.error(JSON.stringify({ error: error.message }));
		process.exitCode = 1;
	}
}
