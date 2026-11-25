// Copyright The Open Forge contributors.
// Historical diagnostic only: synthetic V8 heap probe; no application state or Provider.
import { aiTerminalOutputFromResult } from "../../../apps/desktop/src/renderer/shared/store/ai-terminal-atoms.ts";

if (typeof global.gc !== "function") throw new Error("Run with node --expose-gc --experimental-strip-types");
const gc = () => { for (let i = 0; i < 4; i++) global.gc?.(); };
const heapMiB = () => Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
function collect(copy: boolean, count: number, bytes: number): string[] {
	const outputs: string[] = [];
	for (let i = 0; i < count; i++) {
		// Materialized strings, not lazy repeat ropes. Only the returned summaries escape.
		const text = Buffer.alloc(bytes, 65 + (i % 20)).toString("utf8");
		const output = aiTerminalOutputFromResult({ content: [{ type: "text", text }] });
		if (output) outputs.push(copy ? Buffer.from(output, "utf8").toString("utf8") : output);
	}
	return outputs;
}
for (const sample of [
	{ copy: true, count: 3, bytes: 16 * 1024 * 1024 },
	{ copy: false, count: 3, bytes: 16 * 1024 * 1024 },
	{ copy: false, count: 100, bytes: 50 * 1024 },
]) {
	const { copy, count, bytes } = sample;
	gc();
	const before = heapMiB();
	const outputs = collect(copy, count, bytes);
	gc();
	const after = heapMiB();
	console.log(JSON.stringify({ probe: copy ? "copied-small-summary-control" : "production-output-retention", count, sourceBytesPerItem: bytes, retainedCharacters: outputs.reduce((sum, text) => sum + text.length, 0), beforeMiB: before, afterMiB: after, deltaMiB: Math.round((after - before) * 100) / 100 }));
	outputs.length = 0;
	gc();
	console.log(JSON.stringify({ probe: "after-releasing-output", heapMiB: heapMiB() }));
}
