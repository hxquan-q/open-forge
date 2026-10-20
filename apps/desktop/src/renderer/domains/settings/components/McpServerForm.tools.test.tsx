// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { McpServerToolList } from "@preload/api.js";
import { McpServerForm } from "./McpServerForm";
import { emptyMcpServer, type McpServerFormState } from "./useMcpSettingsModel";

// theme-ui 的 SegmentedControl 在测试解析下命中 react/react-dom 版本错配（useId 空 dispatcher）；
// 传输类型切换不在本测试范围，替换为静态桩。
vi.mock("@vetta-org/theme-ui/shared", () => ({
	SegmentedControl: () => null,
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "zh" },
		t: (key: string) => {
			const labels: Record<string, string> = {
				mcpServerTools: "工具清单",
				mcpServerToolsLoading: "正在读取工具清单…",
				mcpServerToolsNotDiscovered: "工具清单将在该 server 首次连接后出现",
				mcpServerToolsEmpty: "该 server 未提供工具",
				mcpServerToolStale: "已不在目录中",
			};
			return labels[key] ?? key;
		},
	}),
}));

const toolList: McpServerToolList = {
	cached: true,
	tools: [
		{ name: "delete_thing", description: "Delete a thing", enabled: false, stale: false },
		{ name: "read_file", description: "Read a file", enabled: true, stale: false },
	],
};

function Harness({
	initialForm = { ...emptyMcpServer, name: "web", command: "npx" },
	serverTools,
	onSave,
}: {
	initialForm?: McpServerFormState;
	serverTools?: McpServerToolList | null;
	onSave: () => void;
}) {
	const [form, setForm] = useState<McpServerFormState>(initialForm);
	return (
		<McpServerForm
			form={form}
			setForm={setForm}
			onSave={onSave}
			onCancel={() => {}}
			saving={false}
			saveLabel="保存"
			serverTools={serverTools}
		/>
	);
}

function checkboxFor(name: string): HTMLElement {
	const label = screen.getByText(name).closest("label");
	const button = label?.querySelector("button");
	if (!button) throw new Error(`checkbox not found for ${name}`);
	return button;
}

describe("McpServerForm 工具清单", () => {
	it("编辑态展示已发现工具的名称、描述与启用状态", () => {
		render(<Harness serverTools={toolList} onSave={() => {}} />);

		expect(screen.getByText("工具清单")).toBeTruthy();
		expect(screen.getByText("read_file")).toBeTruthy();
		expect(screen.getByText("Read a file")).toBeTruthy();
		expect(screen.getByText("delete_thing")).toBeTruthy();
	});

	it("用户取消勾选某工具后写入 disabledTools，保存时提交更新后的配置", async () => {
		const user = userEvent.setup();
		const saved: McpServerFormState[] = [];
		function SaveProbe() {
			const [form, setForm] = useState<McpServerFormState>({ ...emptyMcpServer, name: "web", command: "npx" });
			return (
				<McpServerForm
					form={form}
					setForm={setForm}
					onSave={() => {
						saved.push(form);
					}}
					onCancel={() => {}}
					saving={false}
					saveLabel="保存"
					serverTools={toolList}
				/>
			);
		}
		render(<SaveProbe />);

		await user.click(checkboxFor("read_file"));
		await user.click(screen.getByRole("button", { name: "保存" }));

		expect(saved[0]?.disabledTools).toEqual(["read_file"]);
	});

	it("重新勾选已停用工具后将其从 disabledTools 移除", async () => {
		const user = userEvent.setup();
		const saved: McpServerFormState[] = [];
		function SaveProbe() {
			const [form, setForm] = useState<McpServerFormState>({
				...emptyMcpServer,
				name: "web",
				command: "npx",
				disabledTools: ["delete_thing"],
			});
			return (
				<McpServerForm
					form={form}
					setForm={setForm}
					onSave={() => {
						saved.push(form);
					}}
					onCancel={() => {}}
					saving={false}
					saveLabel="保存"
					serverTools={toolList}
				/>
			);
		}
		render(<SaveProbe />);

		await user.click(checkboxFor("delete_thing"));
		await user.click(screen.getByRole("button", { name: "保存" }));

		expect(saved[0]?.disabledTools).toEqual([]);
	});

	it("已不在目录中的停用项仍可见并带过期标记", () => {
		const staleList: McpServerToolList = {
			cached: true,
			tools: [{ name: "removed_tool", description: "", enabled: false, stale: true }],
		};
		render(<Harness serverTools={staleList} onSave={() => {}} />);

		expect(screen.getByText("removed_tool")).toBeTruthy();
		expect(screen.getByText("已不在目录中")).toBeTruthy();
	});

	it("server 从未连接过时显示说明而非报错或空列表", () => {
		render(<Harness serverTools={{ tools: [], cached: false }} onSave={() => {}} />);

		expect(screen.getByText("工具清单将在该 server 首次连接后出现")).toBeTruthy();
	});

	it("清单加载中显示加载文案", () => {
		render(<Harness serverTools={null} onSave={() => {}} />);

		expect(screen.getByText("正在读取工具清单…")).toBeTruthy();
	});

	it("新增态不渲染工具清单区", () => {
		render(<Harness onSave={() => {}} />);

		expect(screen.queryByText("工具清单")).toBeNull();
	});
});
