// Copyright The Open Forge contributors.
import { createReadStream } from "node:fs";
import { AnalysisInputError, analyze } from "./analysis.mjs";

const MAX_BYTES = 1024 * 1024;
const usage =
	"Usage: node analyze.mjs <aggregate-result.json|->\nReads JSON only; no database connection, network access, or file writes.\n";

async function readInput(path) {
	const stream = path === "-" ? process.stdin : createReadStream(path);
	const chunks = [];
	let size = 0;
	try {
		for await (const chunk of stream) {
			size += chunk.length;
			if (size > MAX_BYTES)
				throw new AnalysisInputError("Input exceeds 1 MiB; aggregate or narrow the query in SQL.");
			chunks.push(chunk);
		}
	} catch (error) {
		if (error instanceof AnalysisInputError) throw error;
		throw new AnalysisInputError("Could not read the input file or stdin.");
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		// JSON parse errors can quote private rows. Only return a fixed, actionable message.
		throw new AnalysisInputError("Input must be valid JSON.");
	}
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
	process.stdout.write(usage);
} else {
	try {
		if (args.length !== 1) throw new AnalysisInputError(usage.trim());
		const result = analyze(await readInput(args[0]));
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	} catch (error) {
		process.stderr.write(
			`${error instanceof AnalysisInputError ? error.message : "Analysis failed; check the input contract."}\n`,
		);
		process.exitCode = 1;
	}
}
