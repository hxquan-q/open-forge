// @vitest-environment jsdom
import { i18n, initI18n } from "@shared/i18n";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useProxySettingsModel } from "./useProxySettingsModel";

const COMMIT_DELAY_MS = 450;

function stubVetta(proxy: Record<string, unknown>) {
	const configSet = vi.fn(async () => ({}));
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			config: {
				get: vi.fn(async () => ({ proxy })),
				set: configSet,
			},
			models: {
				get: vi.fn(async () => ({ providers: {} })),
				set: vi.fn(async () => ({})),
			},
		},
	});
	return configSet;
}

const ENABLED_VALID_PROXY = {
	enabled: true,
	protocol: "http",
	host: "proxy.example.com",
	port: 8080,
	username: "",
	passwordConfigured: false,
};

async function renderLoaded() {
	const view = renderHook(() => useProxySettingsModel());
	await act(async () => {
		await Promise.resolve();
	});
	return view;
}

beforeEach(() => {
	initI18n();
	void i18n.changeLanguage("zh");
	vi.useFakeTimers();
	return () => vi.useRealTimers();
});

it("does not persist a host:port combo typed into the host field while enabled", async () => {
	const configSet = stubVetta(ENABLED_VALID_PROXY);
	const { result } = await renderLoaded();

	act(() => {
		result.current.actions.setHost("127.0.0.1:7890");
	});
	await act(async () => {
		await vi.advanceTimersByTimeAsync(COMMIT_DELAY_MS);
	});

	expect(result.current.draft.host).toBe("127.0.0.1:7890");
	expect(result.current.invalid).toBeTruthy();
	expect(configSet).not.toHaveBeenCalled();
});

it("persists a valid host while enabled", async () => {
	const configSet = stubVetta(ENABLED_VALID_PROXY);
	const { result } = await renderLoaded();

	act(() => {
		result.current.actions.setHost("proxy.internal.example.com");
	});
	await act(async () => {
		await vi.advanceTimersByTimeAsync(COMMIT_DELAY_MS);
	});

	expect(result.current.invalid).toBeFalsy();
	expect(configSet).toHaveBeenCalledWith({ proxy: { host: "proxy.internal.example.com" } });
});

it("does not persist an out-of-range port while enabled", async () => {
	const configSet = stubVetta(ENABLED_VALID_PROXY);
	const { result } = await renderLoaded();

	act(() => {
		result.current.actions.setPort("99999");
	});
	await act(async () => {
		await vi.advanceTimersByTimeAsync(COMMIT_DELAY_MS);
	});

	expect(result.current.draft.port).toBe("99999");
	expect(result.current.invalid).toBeTruthy();
	expect(configSet).not.toHaveBeenCalled();
});

it("still persists drafts while the proxy is disabled", async () => {
	const configSet = stubVetta({ ...ENABLED_VALID_PROXY, enabled: false });
	const { result } = await renderLoaded();

	act(() => {
		result.current.actions.setHost("bad host");
	});
	await act(async () => {
		await vi.advanceTimersByTimeAsync(COMMIT_DELAY_MS);
	});

	expect(configSet).toHaveBeenCalledWith({ proxy: { host: "bad host" } });
});
