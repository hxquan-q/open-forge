// Modified by The Open Forge contributors.
import { writeSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent/config";
import {
	type CodingToolExecutable,
	type CodingToolInspection,
	createManagedCodingToolExecutableResolver,
} from "@vetta/runtime-node/coding";

const HELP_TEXT = `Open Forge doctor

Usage:
  openforge doctor
  openforge doctor -h
  openforge doctor --help

Description:
  Report how the managed coding tools (fd / ripgrep) resolve on this machine:
  managed cache directory, PATH, or missing, with version and offline state.
  Read-only diagnostics: never downloads, never requires the Desktop app.

Output:
  One table row per tool plus the tools directory in use.
`;

export type DoctorCommand = { type: "help" } | { type: "run" } | { type: "error"; message: string; exitCode: number };

export function parseDoctorCommand(args: string[]): DoctorCommand | undefined {
	if (args[0] !== "doctor") return undefined;
	const subcommand = args[1];
	if (subcommand === "-h" || subcommand === "--help") return { type: "help" };
	if (subcommand === undefined) return { type: "run" };
	return { type: "error", message: `Unexpected argument: ${subcommand}`, exitCode: 2 };
}

export interface RunDoctorCommandOptions {
	/** 诊断的 tools 目录；缺省与 agent 运行时一致（agentDir/bin）。 */
	readonly toolsDirectory?: string;
	/** 注入解析记录以供测试；缺省用本机静态检查。 */
	readonly inspect?: (tool: CodingToolExecutable) => Promise<CodingToolInspection>;
	readonly write?: (text: string) => void;
}

export async function runDoctorCommand(command: DoctorCommand, options: RunDoctorCommandOptions = {}): Promise<number> {
	const write = options.write ?? ((text: string) => writeSync(1, text));
	if (command.type === "help") {
		write(HELP_TEXT);
		return 0;
	}
	if (command.type === "error") {
		write(`${command.message}\n`);
		return command.exitCode;
	}
	const toolsDirectory = options.toolsDirectory ?? join(getAgentDir(), "bin");
	const resolver = createManagedCodingToolExecutableResolver({ toolsDirectory });
	const inspect =
		options.inspect ??
		((tool: CodingToolExecutable) =>
			resolver.inspect ? resolver.inspect(tool) : Promise.resolve({ tool, source: "missing", offline: false }));
	const inspections = await Promise.all((["fd", "rg"] as const).map((tool) => inspect(tool)));
	write(renderDoctorReport(inspections, toolsDirectory));
	return 0;
}

/** 纯渲染：每工具一行 来源/版本/路径/状态，只依赖解析记录字段。 */
export function renderDoctorReport(inspections: readonly CodingToolInspection[], toolsDirectory: string): string {
	const header = ["Tool", "Source", "Version", "Path", "Status"];
	const rows = inspections.map((inspection) => {
		const status = [
			inspection.offline ? "offline mode enabled" : undefined,
			inspection.lastError ? `last download failed: ${inspection.lastError}` : undefined,
		]
			.filter((part) => part !== undefined)
			.join("; ");
		return [
			inspection.tool,
			inspection.source,
			inspection.version ?? "-",
			inspection.path ?? "-",
			status.length > 0 ? status : "ok",
		];
	});
	const widths = header.map((_, index) =>
		Math.max(header[index]?.length ?? 0, ...rows.map((row) => row[index].length)),
	);
	const table = [header, ...rows]
		.map((row) =>
			row
				.map((cell, index) => cell.padEnd(widths[index] ?? 0))
				.join("  ")
				.trimEnd(),
		)
		.join("\n");
	return `Open Forge doctor - managed coding tools\nTools directory: ${toolsDirectory}\n\n${table}\n`;
}
