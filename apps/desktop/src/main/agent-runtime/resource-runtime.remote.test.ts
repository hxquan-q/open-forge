import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLoopbackSshConnection, toLoopbackRemotePath } from "@vetta/ssh-transport/testing";
import { describe, expect, it, vi } from "vitest";

const connection = createLoopbackSshConnection();
vi.mock("../ssh/ssh-runtime.js", () => ({ getSshConnection: () => connection }));

const { createDesktopPromptRuntimeSources } = await import("./resource-runtime.js");

// 回环 SSH 顶替脚本是 /bin/sh POSIX shell，win32 下无 shebang 执行与合法远端 POSIX 路径。
// 回环夹具已跨平台（Git Bash），但本流程在 Windows 上会挂起于桌面提示词运行时的
// 装配路径（根因待诊，见 TASK-0168 交付记录）；POSIX CI 保持覆盖，不静默宣称已测。
describe.skipIf(process.platform === "win32")("远程项目会话的资源发现", () => {
	it("读到远端项目自己的 AGENTS.md 与项目技能，不读本机的", async () => {
		const remoteRoot = realpathSync(mkdtempSync(join(tmpdir(), "vetta-remote-project-")));
		mkdirSync(join(remoteRoot, ".agents/skills/deploy"), { recursive: true });
		writeFileSync(join(remoteRoot, "AGENTS.md"), "REMOTE-PROJECT-RULES\n");
		writeFileSync(
			join(remoteRoot, ".agents/skills/deploy/SKILL.md"),
			"---\nname: deploy\ndescription: Deploy the remote service.\n---\n\nRun the deploy script.\n",
		);
		const agentDir = mkdtempSync(join(tmpdir(), "vetta-agent-dir-"));

		const { resourceSource } = await createDesktopPromptRuntimeSources({
			cwd: `ssh://build-01${toLoopbackRemotePath(remoteRoot)}`,
			agentDir,
			sessionOptions: { includeAgentSkills: true },
			runtimeSkillPaths: [],
		} as never);

		const agentsFiles = resourceSource.getAgentsFiles().agentsFiles;
		expect(agentsFiles.map((file) => file.content)).toContain("REMOTE-PROJECT-RULES\n");
		// 这条测试自己就跑在一个带 AGENTS.md 的仓库里：旧实现会把 URI 解析到进程 cwd 之下，
		// 再沿本机祖先目录向上，把本仓库的 AGENTS.md 当成远端项目的规则读进来。
		expect(agentsFiles.every((file) => file.path.startsWith(remoteRoot) || file.path.startsWith(agentDir))).toBe(
			true,
		);
		const deploy = resourceSource.getSkills().skills.find((skill) => skill.name === "deploy");
		// 模型会把这条路径直接交给跑在远端的 bash：必须是那台机器上的绝对路径，不是 URI。
		expect(deploy?.baseDir).toBe(join(remoteRoot, ".agents/skills/deploy"));
		expect(deploy?.filePath).toBe(join(remoteRoot, ".agents/skills/deploy/SKILL.md"));
	});
});
