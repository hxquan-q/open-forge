// @vitest-environment jsdom
// Modified by The Open Forge contributors.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BuiltinMcpPreset } from "../mcp/builtin-mcp-presets";
import { useMcpSettingsModel } from "./useMcpSettingsModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("useMcpSettingsModel managed runtime parameters", () => {
	it("preserves the managed connection identity and writes parameters to runtime env", async () => {
		const set = vi.fn(async () => undefined);
		(window as unknown as { vetta: unknown }).vetta = {
			mcp: {
				get: vi.fn(async () => ({
					mcpServers: {
						xiaohongshu: {
							type: "http",
							url: "http://127.0.0.1/mcp",
							managedRuntimeId: "xhs-runtime",
							disabled: false,
						},
					},
				})),
				set,
				authStatus: vi.fn(async () => ({})),
			},
		};
		const preset: BuiltinMcpPreset = {
			id: "xiaohongshu",
			name: "xiaohongshu",
			displayName: "Xiaohongshu",
			description: "",
			config: { type: "http", url: "${VETTA_MCP_URL}" },
			secrets: [{ envKey: "XHS_PROXY", required: false, secret: false }],
		};
		const { result } = renderHook(() => useMcpSettingsModel());
		await waitFor(() => expect(result.current.config).not.toBeNull());

		await act(async () => {
			await result.current.onSaveBuiltinParameters("xiaohongshu", preset, {
				XHS_PROXY: "socks5://127.0.0.1:7890",
			});
		});

		expect(set).toHaveBeenCalledWith({
			mcpServers: {
				xiaohongshu: {
					type: "http",
					url: "http://127.0.0.1/mcp",
					managedRuntimeId: "xhs-runtime",
					managedRuntimeEnv: { XHS_PROXY: "socks5://127.0.0.1:7890" },
					disabled: false,
				},
			},
		});
	});

	it("keeps the add dialog open when switching between form and JSON inside it", async () => {
		const set = vi.fn(async () => undefined);
		(window as unknown as { vetta: unknown }).vetta = {
			mcp: {
				get: vi.fn(async () => ({ mcpServers: { existing: { command: "node" } } })),
				set,
				authStatus: vi.fn(async () => ({})),
			},
		};
		const { result } = renderHook(() => useMcpSettingsModel());
		await waitFor(() => expect(result.current.config).not.toBeNull());

		act(() => result.current.onStartAddServer());
		act(() => result.current.onDialogModeSwitch("json"));

		expect(result.current.addingServer).toBe(true);
		expect(result.current.mode).toBe("json");
		expect(result.current.jsonText).toContain("existing");

		act(() => result.current.onDialogModeSwitch("visual"));
		expect(result.current.addingServer).toBe(true);
		expect(result.current.mode).toBe("visual");
	});

	it("merges JSON-mode servers into the existing config and closes the add dialog", async () => {
		const set = vi.fn(async () => undefined);
		(window as unknown as { vetta: unknown }).vetta = {
			mcp: {
				get: vi.fn(async () => ({ mcpServers: { existing: { command: "node" } } })),
				set,
				authStatus: vi.fn(async () => ({})),
			},
		};
		const { result } = renderHook(() => useMcpSettingsModel());
		await waitFor(() => expect(result.current.config).not.toBeNull());

		act(() => result.current.onModeSwitch("json"));
		act(() => result.current.onStartAddServer());
		act(() =>
			result.current.setJsonText(
				JSON.stringify({ mcpServers: { fresh: { command: "npx", args: ["-y", "pkg"] } } }),
			),
		);

		let added = false;
		await act(async () => {
			added = await result.current.onAddServersFromJson();
		});

		expect(added).toBe(true);
		expect(set).toHaveBeenCalledWith({
			mcpServers: {
				existing: { command: "node" },
				fresh: { command: "npx", args: ["-y", "pkg"] },
			},
		});
		expect(result.current.addingServer).toBe(false);
		expect(result.current.mode).toBe("visual");
	});
});
