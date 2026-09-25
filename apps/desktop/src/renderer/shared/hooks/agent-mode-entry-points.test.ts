/**
 * 工作模式的调整入口只保留新会话欢迎卡片的选项行一处：页头全局切换器、侧边栏徽章、设置
 * 菜单区块与共享 AgentMode 切换器都已删除。进入对话后没有「切换」语义（模型与右栏由会话
 * 创建时的模式决定），入口继续挂全局会让人以为可以反悔；这是结构约束，用源码断言守住，
 * 而不是渲染每一个宿主组件。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const rendererRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const REMOVED_ENTRY_POINTS = [
	"shared/components/AgentModeSwitcher.tsx",
	"domains/project/components/sidebar/AgentModeBadgeDropdown.tsx",
	"domains/project/components/sidebar/settings-menu/SettingsMenuAgentModeSection.tsx",
];

const HOSTS_WITHOUT_MODE_ENTRY = [
	"domains/project/components/sidebar/SidebarTopBar.tsx",
	"domains/project/components/sidebar/settings-menu/SettingsMenuPopover.tsx",
];

it.each(REMOVED_ENTRY_POINTS)("%s is gone", (relative) => {
	expect(existsSync(join(rendererRoot, relative))).toBe(false);
});

it.each(HOSTS_WITHOUT_MODE_ENTRY)("%s renders no agent-mode entry", (relative) => {
	const source = readFileSync(join(rendererRoot, relative), "utf8");
	expect(source).not.toMatch(/AgentMode/);
});

it("new-session options row is the only user-facing Work/Coding control", () => {
	const row = readFileSync(
		join(rendererRoot, "domains/conversation/components/new-session/NewSessionOptionsRow.tsx"),
		"utf8",
	);
	expect(row).toContain("WorkspaceModeSwitcher");
	// AgentMode 是另一条简化命名的旧契约，已被移除；不得在本行复活第二套入口。
	expect(row).not.toMatch(/AgentModeIconToggle/);
	expect(existsSync(join(rendererRoot, "shared/hooks/useAgentMode.ts"))).toBe(false);
});

it("page header no longer injects a workspace-mode switcher", () => {
	const header = readFileSync(join(rendererRoot, "shared/app-shell/page-header/usePageHeaderModel.ts"), "utf8");
	expect(header).not.toContain("WorkspaceModeSwitcher");
});

it("the workspace switcher component itself stays AgentMode-free", () => {
	const switcher = readFileSync(
		join(rendererRoot, "domains/workspace-mode/components/WorkspaceModeSwitcher.tsx"),
		"utf8",
	);
	expect(switcher).toContain("workspace.mode");
	expect(switcher).not.toContain("useDefaultAgentMode");
});
