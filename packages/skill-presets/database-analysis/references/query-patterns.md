<!-- Copyright The Open Forge contributors. -->
# Read-only query patterns

Adapt these patterns to discovered tables/columns and the actual SQL dialect. They are illustrative,
not executable queries against an unknown database. Keep exact money calculations in the database.

## Metric contract

Before SQL, record: source table, grain, numerator/denominator, event timestamp/timezone, interval,
status exclusions (cancelled/refunded/test rows), unit/currency, and whether DISTINCT is necessary.
A join from orders to order lines multiplies order-level revenue; aggregate the many side first or
use an EXISTS filter. Check raw fact counts and totals against joined results.

## Bounded discovery

- SQLite: `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 101`.
- PostgreSQL/MySQL: select table names from `information_schema.tables`, scoped to the configured
  database/schema, with a stable order and limit; the active schema is not always `public`.
- SQL Server uses `TOP`/`OFFSET … FETCH`, Oracle uses its version-appropriate row limiter. Use the
  dialect already returned by the connector; do not guess by trying unrelated syntaxes repeatedly.
- If 101 rows return when the intended bound is 100, narrow the name/schema filter rather than
  assuming those are all tables. Use `get_table_info` for confirmed candidates.

## Aggregation and time windows

```sql
SELECT channel, COUNT(*) AS orders, SUM(amount) AS revenue
FROM confirmed_orders
WHERE paid_at >= ? AND paid_at < ? AND status = ?
GROUP BY channel
ORDER BY revenue DESC, channel ASC
LIMIT 101
```

This is a pattern with example identifiers and `?` parameters, not a universal prepared statement.
Use the connector's supported placeholder convention (`?`, `$1`, etc.). Use half-open intervals
`[start, end)` to avoid boundary double counting. Compute boundaries in the requested timezone;
filter on the timestamp column rather than wrapping it in a date function when practical.

Bucket dates with the engine's supported expression (SQLite `strftime`, PostgreSQL `date_trunc`,
MySQL `DATE_FORMAT`), after resolving timezone semantics. Missing dates are unknown until the metric
contract establishes “no rows means zero”; preserve gaps otherwise. For bundled SQLite 2.14.0,
prefer SELECT/subqueries: its adapter routes queries by the leading keyword, so WITH is not a safe
assumption. Do not work around an unsupported query by permitting writes.

## Comparisons and shares

- Align period length and filters. Compute both periods together with conditional aggregates when
  feasible; a current-month partial versus previous full month is not an unbiased growth comparison.
- Aggregate ratios as `SUM(numerator) / NULLIF(SUM(denominator), 0)` with appropriate numeric casts,
  not `AVG(per_group_rate)`. Decide whether NULL means unknown before COALESCE.
- Return absolute differences when the baseline is zero or negative. Never substitute a fake
  denominator of 1 or report Infinity. Rate 20% → 25% means +5 percentage points, or +25% relative.
- Rank only after aggregation. For top-N share, query the full-population denominator with identical
  filters separately; label omitted categories, or provide an explicit “Other” based on the true total.
- Treat category values absent in one period as missing until absence is verified; changed labels,
  schema drift, late-arriving records and incomplete ingestion can all mimic business changes.

## Result budget and reproducibility

Record the actual executed SQL, safe parameters, source, query time, definition and returned scope
beside the answer. A metadata row count often only counts returned rows; it does not establish that
SQL LIMIT or a server-side cap did not omit groups. Narrow or aggregate again instead of copying a
large payload to the conversation. A chart is a view of evidence, not evidence of query correctness.
