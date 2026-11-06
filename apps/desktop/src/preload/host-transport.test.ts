// Copyright The Open Forge contributors.
import { HOST_PROTOCOL_ERROR_CODES, HostProtocolError } from "@vetta/host-protocol/client";
import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
import { HOST_REQUEST_CHANNEL } from "../shared/host-ipc.js";
import { createDesktopHostClient } from "./host-transport.js";

function fakeIpc(response: unknown): { ipc: IpcRenderer; invoke: ReturnType<typeof vi.fn> } {
	const invoke = vi.fn(async () => response);
	return { ipc: { invoke } as unknown as IpcRenderer, invoke };
}

describe("preload host transport", () => {
	it("sends the request envelope over the single host channel and unwraps results", async () => {
		const { ipc, invoke } = fakeIpc({ ok: true, result: "websocket" });
		await expect(
			createDesktopHostClient(ipc).call("settings.setModelTransport", { transport: "websocket" }),
		).resolves.toBe("websocket");
		expect(invoke).toHaveBeenCalledWith(HOST_REQUEST_CHANNEL, {
			method: "settings.setModelTransport",
			params: { transport: "websocket" },
		});
	});

	it("rethrows error envelopes as HostProtocolError with a stable code", async () => {
		const { ipc } = fakeIpc({ ok: false, error: { code: "INVALID_PARAMS", message: "bad transport" } });
		const failure = createDesktopHostClient(ipc).call("settings.getModelTransport", {});
		await expect(failure).rejects.toBeInstanceOf(HostProtocolError);
		await expect(failure).rejects.toMatchObject({ code: HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS });
	});
});
