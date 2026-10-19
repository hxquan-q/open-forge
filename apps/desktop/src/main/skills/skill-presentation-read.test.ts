// Copyright The Open Forge contributors.
//
// 这条链路跨两台机器：技能列表的运行时从远端发现技能（资源身份是 `ssh://<hostId>/…`），
// 而展示图标的解析在本机 `readFileSync`。回环 SSH 把「远端」落成本机的一个临时目录，
// 于是同一份用例能在两个平台上跑真实资源访问，同时钉住两件事：
//   - 路径身份：技能列表运行时必须保留 URI，展示消费方才能判断「这条要跳过」；
//   - 不再本机读取：远端技能不产生展示解析告警，本地技能（用户技能目录）图标照常解析。
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VETTA_HOME_ENV } from "@vetta/action-rpc";
import { isSshProjectUri } from "@vetta/ssh-transport";
import { createLoopbackSshConnection, toLoopbackRemotePath } from "@vetta/ssh-transport/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// VETTA_HOME 与家目录在模块求值期被捕获（清单、scene、agent 目录、`~/.agents/skills` 都在其下），
// 所以必须在 import 技能服务之前挪进沙箱，否则用例会读到开发者本机的真实技能目录。
const sandbox = mkdtempSync(join(tmpdir(), "vetta-skill-presentation-"));
const vettaHome = join(sandbox, "home");
const fakeUserHome = join(sandbox, "user");
mkdirSync(vettaHome, { recursive: true });
mkdirSync(fakeUserHome, { recursive: true });
process.env[VETTA_HOME_ENV] = vettaHome;
// win32 的 os.homedir() 读 USERPROFILE，POSIX 读 HOME；两边都指进沙箱。
process.env.HOME = fakeUserHome;
process.env.USERPROFILE = fakeUserHome;

const connection = createLoopbackSshConnection();
vi.mock("../ssh/ssh-runtime.js", () => ({ getSshConnection: () => connection }));

// 展示解析失败只以告警形式露出（列表本身降级返回），这正是线上看到的现象，所以按告警捕获。
const warnings = vi.hoisted(() => [] as string[]);
vi.mock("../logger.js", () => ({
	APP_LOG_TYPE_LIST: ["main", "render", "im"],
	configureAppLogging: () => {},
	getAppLogPath: () => "",
	getAppLogBaseDir: () => "",
	patchConsoleToAppLogger: () => {},
	disableConsoleLogMirroring: () => true,
	writeAppLog: () => {},
	getAppLogger: () => ({
		log: () => {},
		info: () => {},
		warn: (message: unknown) => warnings.push(String(message)),
		error: () => {},
		debug: () => {},
	}),
}));

// win32 上装配步骤 `reload()` 跑在回环远端 cwd 上要 ~190s（实测；TASK-0168 记的「挂起」实为极慢，
// 根因未定位且与本 Task 行为无关）。技能列表只消费 `getSkills()`，所以 win32 下把装配换成等价的
// 技能刷新——真实远端资源访问、真实 `loadSkills`、真实展示策略，只是不做与本行为无关的
// package/extension/prompt 装配。POSIX 保持原样，端到端走完整 `reload()`。
vi.mock("../agent-runtime/resource-runtime.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../agent-runtime/resource-runtime.js")>();
	return {
		...actual,
		createDesktopSkillResourceRuntime: (options: Parameters<typeof actual.createDesktopSkillResourceRuntime>[0]) => {
			const runtime = actual.createDesktopSkillResourceRuntime(options);
			if (process.platform !== "win32") return runtime;
			return new Proxy(runtime, {
				get(target, property, receiver) {
					if (property === "reload") return async () => void (await target.refreshSkillsIfChanged());
					const value: unknown = Reflect.get(target, property, receiver);
					return typeof value === "function" ? value.bind(target) : value;
				},
			});
		},
	};
});

const { SkillService } = await import("./skill-service.js");
const { createDesktopSkillResourceRuntime } = await import("../agent-runtime/resource-runtime.js");

const REMOTE_HOST_ID = "build-01";
const REMOTE_SKILL = "remote-icon-probe";
const USER_SKILL = "user-icon-probe";
const ICON_ASSET = "icon.svg";

/** 写一个带 Open Forge 展示图标声明的技能包；图标文件落在包旁边，即本机可解析的形态。 */
function writeSkillPackage(skillsDir: string, name: string): void {
	const dir = join(skillsDir, name);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "SKILL.md"),
		[
			"---",
			`name: ${name}`,
			`description: ${name} 展示读取探针。`,
			"metadata:",
			"  vetta:",
			"    presentation:",
			`      icon: ${ICON_ASSET}`,
			"---",
			"",
			"Probe skill for presentation-icon resolution.",
			"",
		].join("\n"),
	);
	writeFileSync(join(dir, ICON_ASSET), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
}

let remoteRoot: string;
let remoteProjectUri: string;
let localProjectRoot: string;

beforeAll(() => {
	remoteRoot = realpathSync(mkdtempSync(join(tmpdir(), "vetta-remote-project-")));
	writeSkillPackage(join(remoteRoot, ".agents/skills"), REMOTE_SKILL);
	// Windows 回环的远端路径是 MSYS 根形式（`/c/…`），天然的「远端绝对路径」样本。
	remoteProjectUri = `ssh://${REMOTE_HOST_ID}${toLoopbackRemotePath(remoteRoot)}`;

	localProjectRoot = realpathSync(mkdtempSync(join(tmpdir(), "vetta-local-project-")));

	// 用户技能目录在本机：远端项目下它也必须照常解析图标，证明跳过是按路径身份而非「当前是不是远程项目」。
	writeSkillPackage(join(vettaHome, "agent", "skills"), USER_SKILL);
});

afterAll(() => {
	warnings.length = 0;
	rmSync(sandbox, { recursive: true, force: true });
	rmSync(remoteRoot, { recursive: true, force: true });
	rmSync(localProjectRoot, { recursive: true, force: true });
});

describe("远程项目的技能列表：资源身份仍是 URI", () => {
	it("技能列表运行时交出 URI，不把远端绝对路径当成资源身份", async () => {
		const runtime = createDesktopSkillResourceRuntime({
			cwd: remoteProjectUri,
			includeAgentSkills: true,
			additionalSkillPaths: [],
		});
		await runtime.refreshSkillsIfChanged();

		const skill = runtime.getSkills().skills.find((entry) => entry.name === REMOTE_SKILL);
		// 展示消费方（SkillService）据这个身份判断「属于远端，本机读不到」，所以它必须是 URI：
		// 被换成远端绝对路径的话，本机读取既会失败，也无从与本地路径区分。
		expect(isSshProjectUri(skill?.filePath ?? "")).toBe(true);
		expect(skill?.filePath).toBe(`${remoteProjectUri}/.agents/skills/${REMOTE_SKILL}/SKILL.md`);
		expect(isSshProjectUri(skill?.baseDir ?? "")).toBe(true);
	});
});

describe("技能列表的用户流程：远程项目一次列表里远端与本地技能并存", () => {
	it("远端技能跳过本机展示解析，本地用户技能仍解析出图标", async () => {
		warnings.length = 0;
		const listed = await new SkillService().list(remoteProjectUri);

		const remote = listed.find((skill) => skill.name === REMOTE_SKILL);
		const local = listed.find((skill) => skill.name === USER_SKILL);

		// 列表本身照常返回，远端技能没有被整体丢弃。
		expect(remote?.description).toBe(`${REMOTE_SKILL} 展示读取探针。`);
		// 本 Task 的取舍：远端图标不新增远端取图能力，明确跳过 ⇒ 不产出图标，也不产生告警。
		expect(remote?.icon).toBeUndefined();
		expect(warnings.filter((message) => message.includes(REMOTE_SKILL))).toEqual([]);

		// 本地技能不做过度跳过：图标仍来自本机读取。
		expect(local?.icon).toMatch(/^vetta-file:\/\/local\//);
		expect(warnings.filter((message) => message.includes(USER_SKILL))).toEqual([]);
	});

	it("本地项目下同一套技能包照旧解析图标", async () => {
		warnings.length = 0;
		writeSkillPackage(join(localProjectRoot, ".agents/skills"), REMOTE_SKILL);

		const listed = await new SkillService().list(localProjectRoot);
		const skill = listed.find((entry) => entry.name === REMOTE_SKILL);

		expect(skill?.icon).toMatch(/^vetta-file:\/\/local\//);
		expect(warnings.filter((message) => message.includes(REMOTE_SKILL))).toEqual([]);
	});
});
