#!/bin/bash
# 流式 markdown 渲染基准：真实 Chromium（chrome channel）+ React production profiling 构建。
# 度量 apps/desktop/scripts/markdown-render.bench.mjs（既有仓库基准，勿改其负载语义）。
set -euo pipefail
cd "$(dirname "$0")/.."
REPS="${VETTA_BENCH_REPS:-3}"
mkdir -p .auto/tmp
rm -f .auto/tmp/bench-*.json

for i in $(seq 1 "$REPS"); do
	cmd.exe /c "set VETTA_TEST_BROWSER=chrome&& node apps/desktop/scripts/markdown-render.bench.mjs .auto/tmp/bench-$i.json" > ".auto/tmp/bench-$i.log" 2>&1 || { tail -30 ".auto/tmp/bench-$i.log"; exit 1; }
done

"/mnt/c/Program Files/nodejs/node.exe" - "$REPS" <<'EOF'
const fs = require("node:fs");
const reps = Number(process.argv[2]);
const runs = [];
for (let i = 1; i <= reps; i++) {
	const raw = JSON.parse(fs.readFileSync(`.auto/tmp/bench-${i}.json`, "utf8"));
	runs.push(Object.fromEntries(raw.results.map((r) => [r.name, r])));
}
const scenarios = ["prose", "table", "code"];
const metric = (name) => {
	const values = runs.map((r) => r[name]).filter(Boolean);
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};
const med = (name, key) => {
	const values = runs.map((r) => r[name]?.[key]).filter((v) => typeof v === "number");
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};
const spread = (name, key) => {
	const values = runs.map((r) => r[name]?.[key]).filter((v) => typeof v === "number");
	if (values.length < 2) return 0;
	const min = Math.min(...values), max = Math.max(...values), mid = med(name, key) || 1;
	return +((max - min) / mid * 100).toFixed(1);
};
let total = 0;
for (const s of scenarios) total += med(s, "reactRenderMs");
const p95Max = Math.max(...scenarios.map((s) => med(s, "p95CommitMs")));
const parseRuns = scenarios.reduce((sum, s) => sum + med(s, "parseRuns"), 0);
const spreadMax = Math.max(...scenarios.map((s) => spread(s, "reactRenderMs")));
console.log(`METRIC total_react_ms=${total.toFixed(1)}`);
for (const s of scenarios) console.log(`METRIC ${s}_ms=${med(s, "reactRenderMs").toFixed(1)}`);
console.log(`METRIC p95_max_ms=${p95Max.toFixed(1)}`);
console.log(`METRIC parse_runs_total=${parseRuns}`);
console.log(`METRIC spread_pct=${spreadMax}`);
EOF
