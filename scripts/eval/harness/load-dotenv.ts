import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load KEY=VALUE pairs from scripts/eval/.env into process.env.
 * Does not override variables already set in the process environment.
 * Never logs values.
 */
export function loadEvalDotEnv(envPath = defaultEvalEnvPath()): readonly string[] {
	if (!existsSync(envPath)) return [];
	const loaded: string[] = [];
	const text = readFileSync(envPath, "utf8");
	for (const rawLine of text.split(/\r?\n/)) {
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

export function defaultEvalEnvPath(): string {
	return join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
}

export function evalDotEnvPresent(): boolean {
	return existsSync(defaultEvalEnvPath());
}
