// Modified by The Open Forge contributors.
import type {
	PluginAgentToolHandler,
	PluginAgentToolRegistration,
	PluginContext,
	PluginFsApi,
} from "@vetta-org/plugin-sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const inspectIssues = vi.hoisted(() => vi.fn(async () => []));

vi.mock("../src/vetd/inspect", async (importOriginal) => {
	const original = await importOriginal<typeof import("../src/vetd/inspect")>();
	return { ...original, inspectIssues };
});

import { setCanvasController } from "../src/canvas/design-runtime";
import { registerDesignTools } from "../src/tools";

let screenshotHandler: PluginAgentToolHandler<{ frame?: string; frames?: string[]; all?: boolean }>;
const captureFrame = vi.fn(async (frameId: string) => `data:image/jpeg;base64,${frameId.toUpperCase()}`);

beforeEach(() => {
	inspectIssues.mockClear();
	captureFrame.mockClear();
	setCanvasController({
		port: 4321,
		captureFrame,
		session: {
			vetdPath: "C:/work/design.vetd",
			dirPath: "C:/work/design.vetd",
			manifest: {
				version: 1,
				type: "vetta-design",
				canvas: { x: 0, y: 0, zoom: 1 },
				frames: [
					{
						id: "login",
						file: "frames/login.tsx",
						x: 0,
						y: 0,
						width: 390,
						height: 844,
						title: "Login",
						meta: { width: 390, height: 844, title: "Login" },
					},
					{
						id: "detail",
						file: "frames/detail.tsx",
						x: 430,
						y: 0,
						width: 390,
						height: 844,
						title: "Detail",
						meta: { width: 390, height: 844, title: "Detail" },
					},
				],
			},
		} as never,
		notes: { notes: [] } as never,
		resolveNoteElements: vi.fn(),
		openDesign: vi.fn(),
	});
	const ctx = {
		agent: {
			registerTool: (registration: PluginAgentToolRegistration) => {
				if (registration.name === "vetd_screenshot") {
					screenshotHandler = registration.handler as typeof screenshotHandler;
				}
				return { dispose: () => {} };
			},
		},
		ui: { openActivityTab: vi.fn() },
	} as unknown as PluginContext;
	registerDesignTools(ctx);
});

afterEach(() => setCanvasController(null));

it("checks sources once and captures every member of one batch", async () => {
	const files = new Map([
		["C:/work/design.vetd/frames/login.tsx", "export default function Login() { return <div /> }"] ,
		["C:/work/design.vetd/frames/detail.tsx", "export default function Detail() { return <div /> }"] ,
		["C:/work/design.vetd/theme.css", "@theme {}"],
		["C:/work/design.vetd/package.json", "{}"],
	]);
	const writes: string[] = [];
	const fs = {
		readDir: async (dirPath: string) => {
			if (dirPath.endsWith("/.snapshots")) return [];
			return [...files.keys()]
				.filter((path) => path.startsWith(`${dirPath}/`) && !path.slice(dirPath.length + 1).includes("/"))
				.map((path) => ({
					name: path.slice(dirPath.length + 1),
					path,
					isDirectory: false,
					size: 1,
					modifiedAt: 1,
				}));
		},
		readFile: async (path: string) => {
			const content = files.get(path);
			if (content === undefined) throw new Error(`missing: ${path}`);
			return { content, encoding: "utf8" as const };
		},
		writeFile: async (path: string) => {
			writes.push(path);
		},
		stat: async () => null,
	} as unknown as PluginFsApi;

	const result = (await screenshotHandler({
		host: { fs },
		session: { cwd: "C:/work" },
		trigger: { input: { frames: ["login", "detail"] } },
	} as never)) as {
		ok: boolean;
		frames: { frame: string; path: string }[];
	};

	expect(result.ok).toBe(true);
	expect(result.frames.map((frame) => frame.frame)).toEqual(["login", "detail"]);
	expect(inspectIssues).toHaveBeenCalledTimes(1);
	expect(captureFrame).toHaveBeenCalledTimes(2);
	expect(writes.filter((path) => path.includes("/.snapshots/")).length).toBeGreaterThanOrEqual(2);
});

it("marks every reported issue with its severity so the model knows what blocks and what is a judgement call", async () => {
	inspectIssues.mockImplementationOnce(
		async () =>
			[
				{ file: "theme.css", line: 1, rule: "theme-placeholder", message: "placeholder" },
				{ file: "frames/login.tsx", line: 12, rule: "hardcoded-color", message: "hardcoded" },
				{ file: "direction.json", line: null, rule: "direction-not-chosen", message: "no direction" },
			] as never,
	);
	const files = new Map([
		["C:/work/design.vetd/frames/login.tsx", "export default function Login() { return <div /> }"],
		["C:/work/design.vetd/theme.css", "@theme {}"],
		["C:/work/design.vetd/package.json", "{}"],
	]);
	const fs = {
		readDir: async (dirPath: string) => {
			if (dirPath.endsWith("/.snapshots")) return [];
			const prefix = dirPath.endsWith("/components") ? null : `${dirPath}/`;
			return prefix === null
				? []
				: [...files.keys()]
						.filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
						.map((path) => {
							const name = path.slice(prefix.length);
							return { name, path, isDirectory: false, size: 1, modifiedAt: 1 };
						});
		},
		readFile: async (path: string) => {
			const content = files.get(path);
			if (content === undefined) throw new Error(`missing: ${path}`);
			return { content, encoding: "utf8" as const };
		},
		writeFile: async () => {},
		stat: async () => ({ isDirectory: false, size: 1, modifiedAt: 1 }),
	} as unknown as PluginFsApi;

	const result = (await screenshotHandler({
		host: { fs },
		session: { cwd: "C:/work" },
		trigger: { input: { frames: ["login"] } },
	} as never)) as { frames: { issues: { rule: string; severity: string }[] }[] };

	const severities = Object.fromEntries(result.frames[0].issues.map((issue) => [issue.rule, issue.severity]));
	expect(severities["theme-placeholder"]).toBe("error");
	expect(severities["direction-not-chosen"]).toBe("error");
	expect(severities["hardcoded-color"]).toBe("warning");
});
