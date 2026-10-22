// @vitest-environment jsdom
// Modified by The Open Forge contributors.
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectContextMenuView, type ProjectContextMenuViewProps } from "@vetta-org/theme-ui/project";
import { useProjectContextMenuModel } from "./hooks/useProjectContextMenuModel";
import type { Project } from "@shared/store/atoms";

/**
 * radix 的浮层原语在 jsdom 下依赖大量布局 API，仓库既有做法是把 `@vetta-org/ui` 换成
 * 结构等价的轻量实现（见 session-context-menu.test.tsx）；菜单树的渲染与回调路由是被测
 * 对象，定位行为交给 radix。替身用 role 承担语义，不用原生 button（DESIGN D03 源审计
 * 只看新增 token，测试文件同样在扫描范围内）。
 */
vi.mock("@vetta-org/ui", () => ({
	cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
	DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: () => null,
	DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
	DropdownMenuItem: ({ children, onSelect, disabled }: MockMenuItemProps) => (
		<div
			role="menuitem"
			aria-disabled={disabled || undefined}
			onClick={() => {
				if (!disabled) onSelect?.({} as Event);
			}}
		>
			{children}
		</div>
	),
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
		<div role="menuitem" tabIndex={0}>
			{children}
		</div>
	),
	DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
}));

interface MockMenuItemProps {
	children?: ReactNode;
	disabled?: boolean;
	onSelect?: (event: Event) => void;
}

const noop = (): void => {};
const props: ProjectContextMenuViewProps = {
	x: 0,
	y: 0,
	isDefault: false,
	labels: {
		openInFolder: "Show in Finder",
		exportSessions: "Export sessions",
		archiveProject: "Archive",
		removeFromList: "Remove",
		deleteProject: "Delete",
		clearConversation: "Clear conversation",
		clearConversationDisabled: "Nothing to clear",
		clearClaw: "Clear claw",
		clearClawDisabled: "Nothing to clear",
		clawSettings: "Claw settings",
		exportMigration: "Export migration package",
	},
	onArchive: noop,
	onClose: noop,
	onDelete: noop,
	onOpenInFolder: noop,
	onRemove: noop,
};

describe("ProjectContextMenuView", () => {
	it("offers the system file manager by default, as local projects always have", () => {
		render(<ProjectContextMenuView {...props} />);
		expect(screen.queryByRole("menuitem", { name: "Show in Finder" })).not.toBeNull();
	});

	it("hides it for a project with no counterpart on this computer, keeping the rest of the menu", () => {
		// 远程（SSH）项目：目录在那台机器上，点了只会毫无反应。
		render(<ProjectContextMenuView {...props} canOpenInFolder={false} />);
		expect(screen.queryByRole("menuitem", { name: "Show in Finder" })).toBeNull();
		expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeNull();
		expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeNull();
	});

	it("offers session export for remote projects too, because their sessions live on this machine", () => {
		const onExportSessions = vi.fn();
		render(
			<ProjectContextMenuView
				{...props}
				canOpenInFolder={false}
				onExportSessions={onExportSessions}
			/>,
		);
		fireEvent.click(screen.getByRole("menuitem", { name: "Export sessions" }));
		expect(onExportSessions).toHaveBeenCalledOnce();
	});

	it("omits the session export entry when the host provides no exporter", () => {
		render(<ProjectContextMenuView {...props} />);
		expect(screen.queryByRole("menuitem", { name: "Export sessions" })).toBeNull();
	});

	it("renders the migration package entry when the host provides an exporter", () => {
		const onExportMigration = vi.fn();
		render(<ProjectContextMenuView {...props} onExportMigration={onExportMigration} />);
		fireEvent.click(screen.getByRole("menuitem", { name: "Export migration package" }));
		expect(onExportMigration).toHaveBeenCalledOnce();
	});

	it("omits the migration package entry when the host provides no exporter", () => {
		render(<ProjectContextMenuView {...props} />);
		expect(screen.queryByRole("menuitem", { name: "Export migration package" })).toBeNull();
	});
});

describe("useProjectContextMenuModel 迁移入口门控", () => {
	const baseProject: Project = { cwd: "C:/work/repo", name: "repo", sessionCount: 0, type: "normal" };

	function modelFor(project: Project, onExportMigration?: (cwd: string) => void) {
		let latest: ReturnType<typeof useProjectContextMenuModel> | undefined;
		function Probe(): null {
			latest = useProjectContextMenuModel({
				project,
				onClose: () => {},
				onArchive: () => {},
				onRemove: () => {},
				onDelete: () => {},
				onExportMigration,
			});
			return null;
		}
		render(<Probe />);
		return latest!;
	}

	it("本地项目提供迁移导出入口，远程 ssh:// 项目不提供（产物在远端无法打包）", () => {
		const onExportMigration = vi.fn();
		expect(modelFor(baseProject, onExportMigration).onExportMigration).toBeTypeOf("function");
		const remote: Project = { ...baseProject, cwd: "ssh://host-id/srv/project" };
		expect(modelFor(remote, onExportMigration).onExportMigration).toBeUndefined();
	});
});
