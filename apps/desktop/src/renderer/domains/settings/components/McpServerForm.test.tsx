// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { McpServerForm } from "./McpServerForm";
import { emptyMcpServer, type McpServerFormState } from "./useMcpSettingsModel";

// theme-ui 的 SegmentedControl 在测试解析下命中 react/react-dom 版本错配（useId 空 dispatcher）；
// 用静态项桩保留「协议选择常驻」的可见性断言。
vi.mock("@vetta-org/theme-ui/shared", () => ({
	SegmentedControl: ({ items }: { items: Array<{ key: string; label: string }> }) => (
		<div data-testid="transport-control">
			{items.map((item) => (
				<span key={item.key}>{item.label}</span>
			))}
		</div>
	),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "zh" },
		t: (key: string) => key,
	}),
}));

function Harness({
	initialForm,
	onSave,
}: {
	initialForm: McpServerFormState;
	onSave?: (form: McpServerFormState) => void;
}) {
	const [form, setForm] = useState<McpServerFormState>(initialForm);
	return (
		<McpServerForm
			form={form}
			setForm={setForm}
			onSave={() => onSave?.(form)}
			onCancel={() => {}}
			saving={false}
			saveLabel="保存"
		/>
	);
}

describe("McpServerForm 布局与字段", () => {
	it("协议选择常驻，stdio 高级选项默认收起", () => {
		render(<Harness initialForm={{ ...emptyMcpServer, name: "web", command: "npx" }} />);

		const transport = screen.getByTestId("transport-control");
		expect(transport.textContent).toContain("stdio");
		expect(transport.textContent).toContain("HTTP");
		expect(screen.getByText("advancedOptions")).toBeTruthy();
		expect(screen.queryByText("envVariables")).toBeNull();
		expect(screen.queryByLabelText("startupTimeout")).toBeNull();
	});

	it("HTTP 授权 key 与原始请求头双向同步，并在保存时提交完整 headers", async () => {
		const user = userEvent.setup();
		const saved: McpServerFormState[] = [];
		render(
			<Harness
				initialForm={{
					...emptyMcpServer,
					name: "remote",
					transport: "http",
					url: "https://example.com/mcp",
					headers: "X-Test=1\nAuthorization=manual",
				}}
				onSave={(form) => saved.push(form)}
			/>,
		);

		const authorization = screen.getByLabelText("mcpStore.authorizationKey") as HTMLInputElement;
		expect(authorization.value).toBe("manual");
		expect(authorization.type).toBe("password");

		const rawHeaders = screen.getByPlaceholderText("Authorization=Bearer ${EXA_TOKEN}") as HTMLTextAreaElement;
		await user.clear(authorization);
		await user.type(authorization, "Bearer abc");

		expect(rawHeaders.value).toBe("X-Test=1\nAuthorization=Bearer abc");

		await user.click(screen.getByRole("button", { name: "保存" }));
		expect(saved[0]?.headers).toBe("X-Test=1\nAuthorization=Bearer abc");
	});

	it("从原始请求头读取 authorization 时不区分大小写", () => {
		render(
			<Harness
				initialForm={{
					...emptyMcpServer,
					name: "remote",
					transport: "http",
					url: "https://example.com/mcp",
					headers: "authorization=Bearer lowercase",
				}}
			/>,
		);

		expect((screen.getByLabelText("mcpStore.authorizationKey") as HTMLInputElement).value).toBe(
			"Bearer lowercase",
		);
	});

	it("stdio 保留 idleTimeout 且与启动超时同网格；HTTP 不渲染该字段", () => {
		const { unmount } = render(
			<Harness
				initialForm={{
					...emptyMcpServer,
					name: "local",
					command: "npx",
					idleTimeout: "600000",
				}}
			/>,
		);

		expect((screen.getByLabelText("idleTimeout") as HTMLInputElement).value).toBe("600000");
		expect(screen.getByLabelText("startupTimeout")).toBeTruthy();
		unmount();

		render(
			<Harness
				initialForm={{
					...emptyMcpServer,
					name: "remote",
					transport: "http",
					url: "https://example.com/mcp",
				}}
			/>,
		);
		expect(screen.queryByLabelText("idleTimeout")).toBeNull();
	});
});
