// Copyright The Open Forge contributors.
import { execFile } from "node:child_process";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { prepareComputerUse } from "./prepare-computer-use.mjs";

if (process.platform !== "win32" || process.arch !== "x64") {
	console.log("[computer-use] native contract tests skipped: Windows x64 only");
} else {
	const bundle = await prepareComputerUse();
	const source = resolve(import.meta.dirname, "../native/computer-use");
	const result = await promisify(execFile)(join(bundle, "runtime", "python.exe"), ["-I", "-B", "-m", "unittest", "discover", "-s", source, "-p", "test_*.py"], { cwd: source, windowsHide: true });
	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
}
