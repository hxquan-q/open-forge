import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const resultsDir = join(dirname(fileURLToPath(import.meta.url)), "results");

const KIND_PREFIX = {
	deepeval: "tool-routing-",
	promptfoo: "promptfoo-tool-routing-",
	maseval: "maseval-tool-routing-",
};

function casePassed(entry) {
	if (typeof entry.passed === "boolean") return entry.passed;
	return Array.isArray(entry.violations) && entry.violations.length === 0 && !entry.errorMessage;
}

async function latestReport(prefix) {
	const names = (await readdir(resultsDir)).filter((name) => name.startsWith(prefix) && name.endsWith(".json"));
	if (names.length === 0) return null;
	names.sort();
	const name = names[names.length - 1];
	const path = join(resultsDir, name);
	const body = JSON.parse(await readFile(path, "utf8"));
	return { path, body };
}

function summarizeCases(cases = []) {
	const failed = [];
	let passed = 0;
	for (const entry of cases) {
		if (casePassed(entry)) {
			passed += 1;
			continue;
		}
		failed.push({
			id: entry.id,
			firstToolName: entry.firstToolName ?? null,
			violations: entry.violations ?? [],
			errorMessage: entry.errorMessage ?? null,
		});
	}
	return { total: cases.length, passed, failed };
}

async function main() {
	await mkdir(resultsDir, { recursive: true });
	const frameworks = {};
	const unstable = new Map();

	for (const [name, prefix] of Object.entries(KIND_PREFIX)) {
		const report = await latestReport(prefix);
		if (!report) {
			frameworks[name] = { present: false };
			continue;
		}
		const summary = summarizeCases(report.body.cases);
		frameworks[name] = {
			present: true,
			path: report.path,
			createdAt: report.body.createdAt,
			...summary,
		};
		for (const fail of summary.failed) {
			const bucket = unstable.get(fail.id) ?? { id: fail.id, frameworks: [], firstTools: [] };
			bucket.frameworks.push(name);
			if (fail.firstToolName) bucket.firstTools.push(fail.firstToolName);
			unstable.set(fail.id, bucket);
		}
	}

	const summary = {
		kind: "three-framework-summary",
		createdAt: new Date().toISOString(),
		frameworks,
		unstableCases: [...unstable.values()].sort((a, b) => a.id.localeCompare(b.id)),
	};
	const outputPath = join(resultsDir, `three-framework-summary-${new Date().toISOString().replaceAll(":", "-")}.json`);
	await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);

	console.log("[eval:agent:summary]");
	for (const [name, info] of Object.entries(frameworks)) {
		if (!info.present) {
			console.log(`  ${name}: (no report)`);
			continue;
		}
		console.log(
			`  ${name}: ${info.passed}/${info.total} passed; failed=${info.failed.map((f) => f.id).join(",") || "none"}`,
		);
	}
	if (summary.unstableCases.length > 0) {
		console.log(
			`  unstable across frameworks: ${summary.unstableCases.map((c) => `${c.id}(${c.frameworks.join("+")})`).join("; ")}`,
		);
	}
	console.log(`  wrote ${outputPath}`);
	return summary;
}

await main();
