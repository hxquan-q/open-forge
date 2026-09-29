import { defineConfig } from "vitest/config";

/**
 * Root-level config for repo-root test invocations (`bun run test:quality`,
 * direct file args). Package test runs use each package's own vitest.config.
 *
 * Claude Code auto-worktrees live under `.claude/worktrees/` **inside** the
 * repository. Their checkouts copy every test file but run no `bun install`,
 * so collecting them from the root fails on unresolvable deps. Exclude them
 * here; a worktree's own package test entry resolves its own config by cwd.
 */
export default defineConfig({
	test: {
		exclude: ["**/node_modules/**", ".claude/worktrees/**"],
	},
});
