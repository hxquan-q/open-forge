// Modified by The Open Forge contributors.
/**
 * Environment for Vitest child processes.
 *
 * Vitest keeps an existing NODE_ENV instead of defaulting to "test", so whatever
 * NODE_ENV the host process happens to carry reaches the test workers. When that
 * is "production" (e.g. an IDE or CLI running in production mode), React resolves
 * its production build — which has no `act` — and every `@testing-library/react`
 * render fails with `React.act is not a function`, producing hundreds of
 * unrelated failures that look like real regressions.
 *
 * Tests are never a production build, so the runner pins NODE_ENV explicitly.
 */
export function createVitestEnv(baseEnv) {
	return { ...baseEnv, NODE_ENV: "test" };
}

/** Keep memory-heavy Windows workers bounded; an explicit CLI limit remains authoritative. */
export function createVitestArgs(args, platform = process.platform) {
	if (platform !== "win32" || args.some((arg) => /^--maxWorkers(?:=|$)/.test(arg))) return args;
	return ["--maxWorkers=2", ...args];
}
