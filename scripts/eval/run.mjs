/**
 * Development-only Agent eval sidecar.
 * Does not run during check / test:changed / husky.
 *
 *   bun run eval:agent
 *   bun run eval:agent -- deepeval|promptfoo|maseval
 *
 * Live credentials may come from scripts/eval/.env (gitignored).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const evalRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(evalRoot, "..", "..");
const known = new Set(["deepeval", "promptfoo", "maseval", "all"]);

function loadEvalDotEnv() {
	const envPath = join(evalRoot, ".env");
	if (!existsSync(envPath)) return [];
	const loaded = [];
	for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq <= 0) continue;
		const key = line.slice(0, eq).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
		let value = line.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (process.env[key] === undefined) {
			process.env[key] = value;
			loaded.push(key);
		}
	}
	return loaded;
}

const loadedKeys = loadEvalDotEnv();
if (loadedKeys.length > 0) {
	console.log(`[eval:agent] loaded scripts/eval/.env keys: ${loadedKeys.join(", ")}`);
}

const live = process.env.OPENFORGE_EVAL === "1";

function selectedFrameworks() {
	const requested = process.argv.slice(2).filter((arg) => known.has(arg));
	if (requested.length === 0 || requested.includes("all")) {
		return live ? ["deepeval", "promptfoo", "maseval"] : ["deepeval"];
	}
	return requested.filter((name) => name !== "all");
}

if (live && !process.env.DEEPSEEK_API_KEY) {
	console.error("[eval:agent] OPENFORGE_EVAL=1 requires DEEPSEEK_API_KEY (shell or scripts/eval/.env).");
	process.exit(2);
}

const evalEnv = {
	...process.env,
	VETTA_KNOWLEDGE_DISABLED: "1",
	DEEPEVAL_DISABLE_DOTENV: "1",
	PROMPTFOO_DISABLE_TELEMETRY: "1",
	PROMPTFOO_DISABLE_SHARING: "1",
	PROMPTFOO_CONFIG_DIR: join(repoRoot, "scripts", "eval", "results", "promptfoo-home"),
};

function run(label, command, args) {
	console.log(`[eval:agent] ${label}`);
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		env: evalEnv,
		stdio: "inherit",
		shell: false,
	});
	if (result.error) throw result.error;
	return result.status ?? 1;
}

function pythonForMaseval() {
	const win = join(evalRoot, ".venv", "Scripts", "python.exe");
	const unix = join(evalRoot, ".venv", "bin", "python");
	if (existsSync(win)) return win;
	if (existsSync(unix)) return unix;
	return null;
}

const frameworks = selectedFrameworks();
let exitCode = 0;

if (frameworks.includes("deepeval")) {
	const args = ["scripts/quality/run-vitest.mjs", "--run", "--config", "scripts/eval/vitest.eval.config.ts"];
	if (!live) {
		args.push("scripts/eval/harness");
		console.log("[eval:agent] DeepEval harness-only (set OPENFORGE_EVAL=1 or scripts/eval/.env)");
	} else {
		console.log("[eval:agent] DeepEval live suites enabled; credentials come from env/.env");
	}
	const status = run("deepeval", "bun", args);
	if (status !== 0) exitCode = status;
}

if (frameworks.includes("promptfoo")) {
	if (!live) {
		console.log("[eval:agent] Promptfoo skipped (set OPENFORGE_EVAL=1)");
	} else {
		const status = run("promptfoo", "bun", ["scripts/eval/promptfoo/run.mjs"]);
		if (status !== 0) exitCode = status;
	}
}

if (frameworks.includes("maseval")) {
	if (!live) {
		console.log("[eval:agent] MASEval skipped (set OPENFORGE_EVAL=1)");
	} else {
		const python = pythonForMaseval();
		if (!python) {
			console.error(
				"[eval:agent] MASEval venv missing. Create scripts/eval/.venv and pip install -r scripts/eval/maseval/requirements.txt",
			);
			exitCode = exitCode || 2;
		} else {
			const status = run("maseval", python, ["scripts/eval/maseval/run.py"]);
			if (status !== 0) exitCode = status;
		}
	}
}

if (live) {
	const summaryStatus = run("summary", "bun", ["scripts/eval/summarize-results.mjs"]);
	if (summaryStatus !== 0) exitCode = exitCode || summaryStatus;
}

process.exit(exitCode);
