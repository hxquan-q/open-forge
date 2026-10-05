// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import type { DesktopSshApi, SshHostSummary } from "@preload/api-types/ssh";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteProjectPickerDialog } from "./RemoteProjectPickerDialog";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, params?: Record<string, unknown>) =>
			params === undefined ? key : `${key}(${JSON.stringify(params)})`,
	}),
}));

const ssh = {
	listHosts: vi.fn<DesktopSshApi["listHosts"]>(),
	createHost: vi.fn<DesktopSshApi["createHost"]>(),
	listRemoteDirectory: vi.fn<DesktopSshApi["listRemoteDirectory"]>(),
};
const host: SshHostSummary = {
	id: "test-host",
	label: "build-01",
	target: "build-01",
	source: "manual",
	status: "disconnected",
};

beforeEach(() => {
	vi.resetAllMocks();
	ssh.listHosts.mockResolvedValue([]);
	ssh.createHost.mockResolvedValue(host);
	ssh.listRemoteDirectory.mockResolvedValue({ remotePath: "/home/dev", entries: [] });
	vi.stubGlobal("window", Object.assign(globalThis.window, { vetta: { ssh } }));
});
afterEach(cleanup);

describe("远程项目选择器中的新增主机", () => {
	it("没有主机时直接新增，保存后选目录，重新打开仍可选择已保存的主机", async () => {
		const onConfirm = vi.fn();
		const view = render(<RemoteProjectPickerDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
		await screen.findByText("remotePicker.noHosts");
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.addHost" }));
		fireEvent.change(screen.getByLabelText("sshFieldTarget"), { target: { value: " build-01 " } });
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.saveHostAndContinue" }));
		await screen.findByText(/"path":"\/home\/dev"/);
		expect(ssh.createHost).toHaveBeenCalledWith({ target: "build-01", label: "build-01" });
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.confirm" }));
		expect(onConfirm).toHaveBeenCalledWith(host.id, "/home/dev", "dev");
		view.unmount();
		ssh.listHosts.mockResolvedValue([host]);
		render(<RemoteProjectPickerDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
		fireEvent.click(await screen.findByRole("button", { name: /build-01/ }));
		await waitFor(() =>
			expect(ssh.listRemoteDirectory).toHaveBeenLastCalledWith({ hostId: host.id, remotePath: undefined }),
		);
	});
});

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
async function openAddForm() {
	render(<RemoteProjectPickerDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
	await waitFor(() =>
		expect(screen.getByRole("button", { name: "remotePicker.addHost" }).hasAttribute("disabled")).toBe(false),
	);
	fireEvent.click(screen.getByRole("button", { name: "remotePicker.addHost" }));
}

describe("新增主机的失败、取消和恢复", () => {
	it("已有主机时也能新增；返回列表不保存草稿，原主机仍可使用", async () => {
		ssh.listHosts.mockResolvedValue([host]);
		await openAddForm();
		expect(document.activeElement).toBe(screen.getByLabelText("sshFieldTarget"));
		fireEvent.change(screen.getByLabelText("sshFieldTarget"), { target: { value: "unused" } });
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.backToHostList" }));
		expect(ssh.createHost).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "remotePicker.addHost" }));
		fireEvent.click(screen.getByRole("button", { name: /build-01/ }));
		await screen.findByText(/"path":"\/home\/dev"/);
	});

	it("保存失败保留全部输入，修正后提交同一表单，不要求重新填写", async () => {
		ssh.createHost.mockRejectedValueOnce(new Error("Host already exists"));
		await openAddForm();
		const submit = screen.getByRole("button", { name: "remotePicker.saveHostAndContinue" });
		expect(submit.hasAttribute("disabled")).toBe(true);
		fireEvent.change(screen.getByLabelText("sshFieldTarget"), { target: { value: " dev@build " } });
		fireEvent.change(screen.getByLabelText("sshFieldLabel"), { target: { value: " Builder " } });
		fireEvent.change(screen.getByLabelText("sshFieldPort"), { target: { value: "2222" } });
		fireEvent.change(screen.getByLabelText("sshFieldIdentityFile"), { target: { value: " ~/.ssh/build_key " } });
		fireEvent.click(submit);
		await screen.findByRole("alert");
		expect(screen.getByLabelText<HTMLInputElement>("sshFieldLabel").value).toBe(" Builder ");
		expect(ssh.listRemoteDirectory).not.toHaveBeenCalled();
		fireEvent.change(screen.getByLabelText("sshFieldTarget"), { target: { value: "dev@new-build" } });
		expect(screen.queryByRole("alert")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.saveHostAndContinue" }));
		await screen.findByText(/"path":"\/home\/dev"/);
		expect(ssh.createHost).toHaveBeenLastCalledWith({
			target: "dev@new-build",
			label: "Builder",
			port: 2222,
			identityFile: "~/.ssh/build_key",
		});
	});

	it("保存途中锁住表单及关闭入口，同一表单重复提交只保存一次", async () => {
		const pending = deferred<SshHostSummary>();
		ssh.createHost.mockReturnValue(pending.promise);
		const onCancel = vi.fn();
		render(<RemoteProjectPickerDialog onConfirm={vi.fn()} onCancel={onCancel} />);
		await screen.findByText("remotePicker.noHosts");
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.addHost" }));
		fireEvent.change(screen.getByLabelText("sshFieldTarget"), { target: { value: "build-01" } });
		const form = screen.getByLabelText("sshFieldTarget").closest("form");
		if (!form) throw new Error("Host fields must belong to a form");
		fireEvent.submit(form);
		fireEvent.submit(form);
		expect(screen.getByLabelText("sshFieldTarget").hasAttribute("disabled")).toBe(true);
		expect(screen.getByRole("button", { name: "remotePicker.savingHost" }).hasAttribute("disabled")).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.close" }));
		expect(onCancel).not.toHaveBeenCalled();
		expect(ssh.createHost).toHaveBeenCalledTimes(1);
		await act(async () => pending.resolve(host));
		await screen.findByText(/"path":"\/home\/dev"/);
	});

	it("主机已保存但连接失败时只重试目录，不重复创建主机", async () => {
		ssh.listRemoteDirectory.mockRejectedValueOnce(new Error("Connection refused"));
		await openAddForm();
		fireEvent.change(screen.getByLabelText("sshFieldTarget"), { target: { value: "build-01" } });
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.saveHostAndContinue" }));
		await screen.findByText("remotePicker.browseFailed");
		expect(screen.getByRole("button", { name: "remotePicker.confirm" }).hasAttribute("disabled")).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.retry" }));
		await screen.findByText(/"path":"\/home\/dev"/);
		expect(ssh.createHost).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.backToHosts" }));
		expect(screen.getByRole("button", { name: /build-01/ })).toBeDefined();
	});

	it("主机列表读取失败有重试入口，而不是伪装成空列表", async () => {
		ssh.listHosts.mockRejectedValueOnce(new Error("Unavailable"));
		render(<RemoteProjectPickerDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
		await screen.findByText("remotePicker.loadHostsFailed");
		expect(screen.queryByText("remotePicker.noHosts")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.retry" }));
		await screen.findByText("remotePicker.noHosts");
		expect(ssh.listHosts).toHaveBeenCalledTimes(2);
	});

	it("切换主机后旧请求晚到，不能拿旧主机的路径登记到新主机", async () => {
		const oldListing = deferred<Awaited<ReturnType<DesktopSshApi["listRemoteDirectory"]>>>();
		const newListing = deferred<Awaited<ReturnType<DesktopSshApi["listRemoteDirectory"]>>>();
		ssh.listHosts.mockResolvedValue([host, { ...host, id: "second", target: "build-02", label: "build-02" }]);
		ssh.listRemoteDirectory.mockReturnValueOnce(oldListing.promise).mockReturnValueOnce(newListing.promise);
		const onConfirm = vi.fn();
		render(<RemoteProjectPickerDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
		fireEvent.click(await screen.findByRole("button", { name: /build-01/ }));
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.backToHosts" }));
		fireEvent.click(screen.getByRole("button", { name: /build-02/ }));
		await act(async () => oldListing.resolve({ remotePath: "/old-host", entries: [] }));
		expect(screen.queryByText(/old-host/)).toBeNull();
		expect(screen.getByRole("button", { name: "remotePicker.confirm" }).hasAttribute("disabled")).toBe(true);
		await act(async () => newListing.resolve({ remotePath: "/new-host", entries: [] }));
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.confirm" }));
		expect(onConfirm).toHaveBeenCalledWith("second", "/new-host", "new-host");
	});
});

describe("项目名备注与主机区分", () => {
	it("项目名默认取目录名，标题下标出所在主机；改成备注后按备注登记", async () => {
		ssh.listHosts.mockResolvedValue([host]);
		const onConfirm = vi.fn();
		render(<RemoteProjectPickerDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
		fireEvent.click(await screen.findByRole("button", { name: /build-01/ }));
		const nameInput = await screen.findByLabelText<HTMLInputElement>("remotePicker.projectName");
		await waitFor(() => expect(nameInput.value).toBe("dev"));
		// 「在哪台主机上」必须和用户输入的名字同时看得见。
		expect(screen.getByText(/"host":"build-01","path":"\/home\/dev"/)).toBeDefined();
		fireEvent.change(nameInput, { target: { value: " 构建机项目 " } });
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.confirm" }));
		expect(onConfirm).toHaveBeenCalledWith(host.id, "/home/dev", "构建机项目");
	});

	it("项目名跟随目录导航，用户起过名后不再被覆盖；清空则退回目录名", async () => {
		ssh.listHosts.mockResolvedValue([host]);
		ssh.listRemoteDirectory.mockImplementation(async ({ remotePath }) =>
			remotePath === undefined
				? {
						remotePath: "/home/dev",
						entries: [{ name: "app", kind: "directory" as const, sizeBytes: 0, modifiedAtSeconds: 0 }],
					}
				: { remotePath: remotePath ?? "/home/dev", entries: [] },
		);
		const onConfirm = vi.fn();
		render(<RemoteProjectPickerDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
		fireEvent.click(await screen.findByRole("button", { name: /build-01/ }));
		const nameInput = await screen.findByLabelText<HTMLInputElement>("remotePicker.projectName");
		await waitFor(() => expect(nameInput.value).toBe("dev"));

		fireEvent.click(screen.getByRole("button", { name: "app" }));
		await waitFor(() => expect(nameInput.value).toBe("app"));

		fireEvent.change(nameInput, { target: { value: "我的 app" } });
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.parent" }));
		await screen.findByText(/"path":"\/home\/dev"/);
		expect(nameInput.value).toBe("我的 app");

		fireEvent.change(nameInput, { target: { value: "" } });
		fireEvent.click(screen.getByRole("button", { name: "remotePicker.confirm" }));
		expect(onConfirm).toHaveBeenCalledWith(host.id, "/home/dev", "dev");
	});

	it("换一台主机后项目名回到新主机的目录名，不会把上一台的备注带过去", async () => {
		ssh.listHosts.mockResolvedValue([
			host,
			{ ...host, id: "second", target: "build-02", label: "build-02" },
		]);
		ssh.listRemoteDirectory.mockImplementation(async ({ hostId }) =>
			hostId === "second"
				? { remotePath: "/srv/wiki", entries: [] }
				: { remotePath: "/home/dev", entries: [] },
		);
		render(<RemoteProjectPickerDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
		fireEvent.click(await screen.findByRole("button", { name: /build-01/ }));
		const nameInput = await screen.findByLabelText<HTMLInputElement>("remotePicker.projectName");
		await waitFor(() => expect(nameInput.value).toBe("dev"));
		fireEvent.change(nameInput, { target: { value: "旧主机的名字" } });

		fireEvent.click(screen.getByRole("button", { name: "remotePicker.backToHosts" }));
		fireEvent.click(screen.getByRole("button", { name: /build-02/ }));
		await screen.findByText(/"path":"\/srv\/wiki"/);
		// 目录步骤在回列表时卸载过，输入框是新节点，必须重新查询。
		const secondNameInput = screen.getByLabelText<HTMLInputElement>("remotePicker.projectName");
		expect(secondNameInput.value).toBe("wiki");
	});
});
