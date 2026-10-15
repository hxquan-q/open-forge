// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import type { DesktopSshApi, SshHostSummary } from "@preload/api-types/ssh";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SshHostsSettings } from "./SshHostsSettings";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
let hosts: SshHostSummary[];
const host: SshHostSummary = {
	id: "saved-host",
	target: "build-01",
	label: "Builder",
	source: "manual",
	status: "disconnected",
};
const ssh = {
	listHosts: vi.fn<DesktopSshApi["listHosts"]>(),
	createHost: vi.fn<DesktopSshApi["createHost"]>(),
	updateHost: vi.fn<DesktopSshApi["updateHost"]>(),
	onHostsChanged: vi.fn(() => () => {}),
	onHostStatusChanged: vi.fn(() => () => {}),
};
beforeEach(() => {
	vi.clearAllMocks();
	hosts = [];
	ssh.listHosts.mockImplementation(async () => hosts);
	ssh.createHost.mockImplementation(async (input) => {
		const saved = { ...host, ...input };
		hosts = [saved];
		return saved;
	});
	ssh.updateHost.mockImplementation(async (input) => {
		const saved = { ...host, ...input };
		hosts = [saved];
		return saved;
	});
	vi.stubGlobal("window", Object.assign(globalThis.window, { vetta: { ssh } }));
});

it("设置页继续使用共用字段新增并编辑主机，刷新列表反映保存结果", async () => {
	render(<SshHostsSettings />);
	fireEvent.click(await screen.findByRole("button", { name: "sshAddHost" }));
	fireEvent.change(screen.getByLabelText("sshFieldTarget"), { target: { value: "build-01" } });
	fireEvent.change(screen.getByLabelText("sshFieldLabel"), { target: { value: "Builder" } });
	fireEvent.click(screen.getByRole("button", { name: "sshSaveHost" }));
	await screen.findByText("Builder");
	expect(ssh.createHost).toHaveBeenCalledWith({ target: "build-01", label: "Builder" });
	fireEvent.click(screen.getByRole("button", { name: "sshEditHost" }));
	fireEvent.change(screen.getByLabelText("sshFieldPort"), { target: { value: "2222" } });
	fireEvent.click(screen.getByRole("button", { name: "sshSaveHost" }));
	await waitFor(() => expect(screen.queryByLabelText("sshFieldPort")).toBeNull());
	expect(ssh.updateHost).toHaveBeenCalledWith({ id: host.id, target: "build-01", label: "Builder", port: 2222 });
});
