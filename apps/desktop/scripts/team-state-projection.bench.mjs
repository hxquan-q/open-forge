// Copyright The Open Forge contributors.
import { tsImport } from "tsx/esm/api";

const { runTeamStateBenchmark } = await tsImport("./team-state-projection.bench.ts", import.meta.url);
const report = runTeamStateBenchmark(process.argv.includes("--holdout"));
console.log(JSON.stringify(report, null, 2));
const prefix = report.holdout ? "holdout" : "team_state";
console.log(`METRIC ${prefix}_ms=${report.totalMs}`);
for (const result of report.results) {
	console.log(`METRIC ${result.name}_ms=${result.medianMs}`);
	console.log(`METRIC ${result.name}_cold_ms=${result.coldMs}`);
}
console.log(`METRIC spread_pct=${Math.max(...report.results.map((result) => result.spreadPct))}`);
