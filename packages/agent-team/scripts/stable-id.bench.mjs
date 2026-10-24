// Copyright The Open Forge contributors.
/**
 * Throughput benchmark for stableTeamEventId, interleaving the current
 * implementation against the BigInt reference on identical inputs.
 */
import { tsImport } from "tsx/esm/api";

const { stableTeamEventId, fnv64Reference } = await tsImport("../src/context-projector.ts", import.meta.url);
const OFF = 0xcbf29ce484222325n;
const MASK = 0xffffffffffffffffn;

function reference(parts) {
	const canonical = parts.map((part) => `${part.length}:${part}`).join("|");
	return `team-v1-${fnv64Reference(canonical, OFF)}${fnv64Reference(canonical, OFF ^ MASK)}`;
}

const scenarios = [
	{ name: "single_80kb", parts: ["x".repeat(80_000)] },
	{ name: "parts_401x200b", parts: Array.from({ length: 401 }, () => "x".repeat(200)) },
];

const med = (values) => {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)];
};

const results = [];
for (const scenario of scenarios) {
	const rows = { current: [], reference: [] };
	// Interleave variants within the same window to neutralize machine drift.
	for (let round = 0; round < 8; round += 1) {
		for (const [variant, fn] of [["current", stableTeamEventId], ["reference", reference]]) {
			const started = performance.now();
			fn(scenario.parts);
			rows[variant].push(performance.now() - started);
		}
	}
	// The two must agree; assert equivalence on the actual workload.
	if (stableTeamEventId(scenario.parts) !== reference(scenario.parts))
		throw new Error(`${scenario.name}: implementations disagree`);
	results.push({
		name: scenario.name,
		currentMs: Number(med(rows.current).toFixed(2)),
		referenceMs: Number(med(rows.reference).toFixed(2)),
		speedup: Number((med(rows.reference) / med(rows.current)).toFixed(2)),
	});
}
const report = { version: 1, runtime: process.version, results };
console.log(JSON.stringify(report, null, 2));
console.log(`METRIC current_80kb_ms=${results[0].currentMs}`);
console.log(`METRIC reference_80kb_ms=${results[0].referenceMs}`);
console.log(`METRIC current_401x200_ms=${results[1].currentMs}`);
console.log(`METRIC reference_401x200_ms=${results[1].referenceMs}`);
