/** Stable package-root facade for Coding Agent Extensions. */

/** 项目级共享约定（`.vetta/` / `.vetta-local/`，TASK-0020）。 */
export * from "./projects/index.js";
export * from "./public-api/extensions.js";
/** 单一 Catalog 收敛规则（Profile × 显式选择 × 项目策略，TASK-0021）。 */
export { resolveCapabilityNameConflict, resolveToolCatalogPolicy } from "./tool-policy/catalog-policy.js";
