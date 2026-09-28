/**
 * Enforce conformance-suite coverage for cross-boundary protocols (TASK-0112).
 *
 * tests/contracts/protocol-registry.json inventories every cross-boundary
 * protocol surface. Each protocol must either name conformance suite test
 * files (which must exist) or be listed in EXEMPT_PROTOCOLS. Exemptions are
 * shrinking-only: EXEMPT_PROTOCOLS must stay a subset of the frozen
 * EXEMPT_PROTOCOLS_BASELINE, and every exempt id must have an approver
 * recorded in tests/contracts/OWNERS.
 *
 * Usage:
 *   bun run scripts/quality/check-protocol-suites.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, isDirectRun, ok, repoRoot } from "./lib.mjs";

const REGISTRY_PATH = "tests/contracts/protocol-registry.json";
const OWNERS_PATH = "tests/contracts/OWNERS";

// Active exemptions. Today there are none — every registered protocol ships
// a conformance suite. Adding an entry is a governance change: it must stay
// within EXEMPT_PROTOCOLS_BASELINE and cite an approver in
// tests/contracts/OWNERS.
const EXEMPT_PROTOCOLS = [];

// Frozen grandfather ceiling recorded when this gate was introduced
// (TASK-0112). Shrinking-only: entries may be removed over time, never added.
// Extending this list is a deliberate baseline change visible in review.
const EXEMPT_PROTOCOLS_BASELINE = [];

function loadOwners(root) {
	const path = join(root, OWNERS_PATH);
	if (!existsSync(path)) return new Map();
	const owners = new Map();
	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const [id, owner, ...rest] = trimmed.split(/\s{2,}|\t+/);
		if (id) owners.set(id, { owner: owner ?? "", reason: rest.join(" ") });
	}
	return owners;
}

export function findProtocolSuiteProblems(root, { exempt = [], baseline = [] } = {}) {
	const problems = [];
	const registryPath = join(root, REGISTRY_PATH);
	if (!existsSync(registryPath)) return [`${REGISTRY_PATH}: missing`];
	let registry;
	try {
		registry = JSON.parse(readFileSync(registryPath, "utf8"));
	} catch (error) {
		return [`${REGISTRY_PATH}: invalid JSON (${error.message})`];
	}
	const protocols = Array.isArray(registry?.protocols) ? registry.protocols : [];
	const ids = new Set();
	for (const protocol of protocols) {
		if (typeof protocol?.id !== "string" || protocol.id === "") {
			problems.push(`${REGISTRY_PATH}: entry missing id`);
			continue;
		}
		if (ids.has(protocol.id)) problems.push(`${REGISTRY_PATH}: duplicate protocol id ${protocol.id}`);
		ids.add(protocol.id);
		const suites = Array.isArray(protocol.suites) ? protocol.suites : [];
		if (suites.length === 0) continue; // must be exempt — checked below
		for (const suite of suites) {
			if (typeof suite !== "string" || !existsSync(join(root, suite))) {
				problems.push(`${protocol.id}: suite file missing: ${suite}`);
			}
		}
	}

	const exemptSet = new Set(exempt);
	const baselineSet = new Set(baseline);
	const owners = loadOwners(root);
	for (const id of exemptSet) {
		if (!baselineSet.has(id)) {
			problems.push(`EXEMPT_PROTOCOLS: ${id} expands the exemption set — the set is shrinking-only`);
		}
		if (!ids.has(id)) {
			problems.push(`EXEMPT_PROTOCOLS: ${id} is not a registered protocol`);
		}
		if (!owners.has(id)) {
			problems.push(`EXEMPT_PROTOCOLS: ${id} has no approver in ${OWNERS_PATH}`);
		}
	}
	for (const protocol of protocols) {
		const suites = Array.isArray(protocol.suites) ? protocol.suites : [];
		if (suites.length === 0 && !exemptSet.has(protocol.id)) {
			problems.push(
				`${protocol.id}: no conformance suite and not exempt — add a suite or an OWNERS-approved exemption`,
			);
		}
		if (suites.length > 0 && exemptSet.has(protocol.id)) {
			problems.push(`${protocol.id}: has a conformance suite but is still exempt — remove it from EXEMPT_PROTOCOLS`);
		}
	}
	return problems;
}

export function main(args = process.argv.slice(2), root = repoRoot) {
	if (args.length > 0) {
		console.error(`unknown argument: ${args[0]}`);
		return 1;
	}
	const problems = findProtocolSuiteProblems(root, {
		exempt: EXEMPT_PROTOCOLS,
		baseline: EXEMPT_PROTOCOLS_BASELINE,
	});
	if (problems.length > 0) {
		fail(`[protocol-suites] ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join("\n")}`);
		return 1;
	}
	ok("[protocol-suites] every registered protocol has a conformance suite (0 exemptions)");
	return 0;
}

if (isDirectRun(import.meta.url)) {
	process.exit(main());
}
