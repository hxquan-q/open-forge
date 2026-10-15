<!-- Copyright The Open Forge contributors. -->
# Aggregate analysis helper

Run `node <this-skill-directory>/scripts/analyze.mjs <result.json>` or use `-` to read JSON from stdin.
Use a shell-safe file argument or a quoted stdin mechanism; never interpolate row values into shell
code. Node must be available and shell execution permitted. The helper reads only the given JSON;
it does not connect to a database, execute SQL, access the network, or write files.

Input (construct from actual, verified aggregate rows; the example is synthetic):

```json
{
  "rows": [
    { "month": "2026-08", "revenue": "200.00" },
    { "month": "2026-09", "revenue": "250.00" }
  ],
  "dimension": "month",
  "metrics": ["revenue"],
  "truncated": false,
  "rowCount": 2,
  "chartType": "line",
  "title": "Revenue by month",
  "compare": { "baseline": "2026-08", "current": "2026-09" }
}
```

- Required: `rows`, `dimension`, `metrics`, `truncated: false`. The completeness flag is a caller
  assertion, not proof: verify caps/counts first. Even complete top-N results remain a subset.
- `rowCount` is optional and, if supplied, must match the array length. Transfer a connector's
  returned row count only if it counts this result, not affected rows or the underlying table.
- One unique nonempty string dimension per row; group duplicates in SQL. Stringify known date/group
  labels explicitly and give SQL NULL groups an unambiguous label. Input order is preserved.
- One to eight unique numeric metrics; missing columns are errors, explicit `null` stays unknown.
  Extra columns are ignored and never emitted; omit them from input to minimize data exposure.
- `compare` is optional; both labels must exist and differ. Baseline direction is explicit, not
  inferred from row order. Omit it for an empty set, ranking, or simple breakdown.
- `chartType`: `bar` (default) or `line`; optional nonempty `title`. Labels/field names/title are
  limited to 256 characters, input to 1 MiB, and rows to 2000. Oversize results are rejected, not cut.

## Numeric semantics

Finite JSON numbers within the safe integer magnitude and plain decimal strings are accepted.
Decimal strings with more than 15 significant digits, nonnumeric values, underflow-to-zero strings,
NaN/Infinity and unsafe magnitudes are rejected. Use an explicitly disclosed scale/rounding in SQL
or keep high-precision values in a text table; do not coerce bigint IDs or exact money into charts.
Already-rounded numbers from a database driver cannot be recovered by this helper.

The helper is for approximate analysis, not exact accounting: fractional differences/growth are
rounded to 15 significant digits. It reports per-metric known/missing counts, min/max and optionally
baseline/current, absolute `change` and `percentChange`. It deliberately does not sum arbitrary
columns or average averages/percentages. Exact aggregates and weighted metrics belong in SQL.

`percentChange` is null for zero/negative baselines, missing values or arithmetic outside the safe
range. `reason` distinguishes `zero_baseline`, `negative_baseline`, `missing_value`, `out_of_range`;
otherwise it is null. A missing value also makes `change` null. A missing comparison label is an
input error, not a measured zero.

## Output and recovery

- `chart` follows `application/vnd.vetta.chart+json`: `type`, optional `title`, `labels`, `series`.
  Create an `artifact` of `kind: "analysis"` using only this object as serialized content.
- Empty results produce `warnings: ["empty_result"]` and `chart: null`. NULL metric values produce
  `missing_values` and suppress the chart: the current renderer would otherwise invent zeroes.
  Keep the summary/table and explain the limitation; query corrected data rather than filling gaps.
- Success exits 0 with JSON on stdout. Validation/read errors exit 1 with a concise message on
  stderr and no report. Messages do not echo row values, input fragments or private paths.
- Correct the input/query based on the error, then rerun. Do not silently drop rows, erase warnings,
  assert false completeness or round high-precision data without explaining the change.
