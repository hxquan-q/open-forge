// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import type { ProviderTestResult } from "@preload/api.js";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import { ModelsProviderRow } from "./ModelsProviderRow";
import { providerTestChip, useModelsSettingsModel } from "./useModelsSettingsModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const mocks = vi.hoisted(() => ({
	config: {
		providers: {
			relay: { baseUrl: "http://relay.local/v1", models: [{ id: "m1" }] },
		},
	},
}));

vi.mock("@shared/store/model-catalog", async () => {
	const { atom } = await import("jotai");
	return {
		localModelsConfigAtom: atom(mocks.config),
		modelCatalog: { revalidate: vi.fn(async () => undefined) },
	};
});

function installVettaApi(overrides: Record<string, unknown> = {}) {
	const models = {
		get: vi.fn(async () => mocks.config),
		set: vi.fn(async () => undefined),
		copyApiKey: vi.fn(async () => false),
		fetchProviderModels: vi.fn(async () => ({
			models: [
				{ id: "m1" },
				{
					id: "m2",
					name: "Model 2",
					contextWindow: 131072,
					maxTokens: 8192,
					vision: true,
					reasoning: true,
					reasoningLevels: ["low", "high"],
				},
				{ id: "m3" },
			],
		})),
		probe: vi.fn(async () => ({ ok: true, message: "reachable" })),
		testProvider: vi.fn(async () => ({ ok: true, latencyMs: 120, modelCount: 2 })),
		...overrides,
	};
	(window as unknown as { vetta: unknown }).vetta = {
		models,
		appMonitor: { recordEvent: vi.fn() },
	};
	return models;
}

function renderModel() {
	return renderHook(() => useModelsSettingsModel());
}

async function openFetchedDrawer() {
	const models = installVettaApi();
	const { result } = renderModel();
	act(() => result.current.onStartFetchProviderModels("relay"));
	await waitFor(() => expect(result.current.fetchedModels?.status).toBe("ready"));
	return { models, result };
}

describe("useModelsSettingsModel - 从接口拉取模型", () => {
	it("点击后抽屉先以 loading 打开，拉到后填充候选且默认不勾选（中转网关可能返回上百个模型）", async () => {
		installVettaApi();
		const { result } = renderModel();
		act(() => result.current.onStartFetchProviderModels("relay"));
		expect(result.current.fetchedModels?.status).toBe("loading");
		expect(result.current.fetchingModelsFor).toBe("relay");

		await waitFor(() => expect(result.current.fetchedModels?.status).toBe("ready"));
		expect(result.current.fetchedModels?.models.map((item) => item.id)).toEqual(["m1", "m2", "m3"]);
		expect(result.current.fetchedModels?.selected).toEqual([]);
	});

	it("拉取失败给出错误态，重试后恢复候选", async () => {
		const models = installVettaApi({
			fetchProviderModels: vi
				.fn()
				.mockResolvedValueOnce({ models: [], error: "接口返回 500" })
				.mockResolvedValueOnce({ models: [{ id: "m9" }] }),
		});
		const { result } = renderModel();
		act(() => result.current.onStartFetchProviderModels("relay"));
		await waitFor(() => expect(result.current.fetchedModels?.status).toBe("error"));
		expect(result.current.fetchedModels?.error).toBe("接口返回 500");

		act(() => result.current.onRetryFetchProviderModels());
		await waitFor(() => expect(result.current.fetchedModels?.status).toBe("ready"));
		expect(models.fetchProviderModels).toHaveBeenCalledTimes(2);
		expect(result.current.fetchedModels?.models.map((item) => item.id)).toEqual(["m9"]);
	});

	it("全选只勾选尚未添加的模型，取消全选清空勾选；搜索时只作用于可见项", async () => {
		const { result } = await openFetchedDrawer();

		act(() => result.current.onSelectAllFetchedModels());
		// m1 已在配置里，「全选」不能把已添加项算作待添加。
		expect(result.current.fetchedModels?.selected).toEqual(["m2", "m3"]);

		act(() => result.current.onFetchedModelsSearchChange("m3"));
		act(() => result.current.onDeselectAllFetchedModels());
		// 被搜索筛掉的 m2 勾选保留，只有可见的 m3 被取消。
		expect(result.current.fetchedModels?.selected).toEqual(["m2"]);

		act(() => result.current.onFetchedModelsSearchChange(""));
		act(() => result.current.onDeselectAllFetchedModels());
		expect(result.current.fetchedModels?.selected).toEqual([]);
	});

	it("逐个候选测试连通并记录行内结果", async () => {
		const { models, result } = await openFetchedDrawer();
		await act(async () => {
			await result.current.onTestFetchedModel("m2");
		});

		expect(models.probe).toHaveBeenCalledWith({ provider: "relay", model: "m2" });
		expect(result.current.fetchedModels?.tests.m2).toEqual({ status: "ok", message: "reachable" });
	});

	it("一个都没勾选时点添加只关闭抽屉、不写入配置", async () => {
		const { models, result } = await openFetchedDrawer();
		await act(async () => {
			await result.current.onApplyFetchedModels("relay");
		});

		expect(models.set).not.toHaveBeenCalled();
		expect(result.current.fetchedModels).toBeNull();
	});

	it("勾选后添加：接口返回的参数随勾选项写入 provider 的 models 并落盘", async () => {
		const { models, result } = await openFetchedDrawer();
		act(() => result.current.onToggleFetchedModel("m2"));
		act(() => result.current.onToggleFetchedModel("m3"));
		await act(async () => {
			await result.current.onApplyFetchedModels("relay");
		});

		expect(models.set).toHaveBeenCalledWith({
			providers: {
				relay: {
					baseUrl: "http://relay.local/v1",
					models: [
						{ id: "m1" },
						{
							id: "m2",
							input: ["text", "image"],
							name: "Model 2",
							reasoning: true,
							reasoningLevels: ["low", "high"],
							contextWindow: 131072,
							maxTokens: 8192,
						},
						{ id: "m3", input: ["text"] },
					],
				},
			},
		});
		expect(result.current.fetchedModels).toBeNull();
	});
});

describe("useModelsSettingsModel - 测试供应商可用性", () => {
	it("测试成功时按服务商名记录结果，测试位复位", async () => {
		installVettaApi();
		const { result } = renderModel();
		await act(async () => {
			await result.current.onTestProvider("relay");
		});

		expect(result.current.providerTestResults.relay).toEqual({ ok: true, latencyMs: 120, modelCount: 2 });
		expect(result.current.testingProvider).toBeNull();
	});

	it("IPC 抛错时落到 network 错误，不抛出、不残留测试中状态", async () => {
		installVettaApi({
			testProvider: vi.fn(async () => {
				throw new Error("ipc broken");
			}),
		});
		const { result } = renderModel();
		await act(async () => {
			await result.current.onTestProvider("relay");
		});

		expect(result.current.providerTestResults.relay).toMatchObject({ ok: false, error: "network" });
		expect(result.current.testingProvider).toBeNull();
	});

	it("删除服务商后其测试结果一并清除", async () => {
		installVettaApi();
		const { result } = renderModel();
		await act(async () => {
			await result.current.onTestProvider("relay");
		});
		await act(async () => {
			await result.current.onDeleteProvider("relay");
		});

		await waitFor(() => expect(result.current.providerTestResults.relay).toBeUndefined());
	});
});

/** 真实 hook + 真实行的装配：验证按钮接线与结果回流，而不是孤立断言回调。 */
function ProviderRowHarness({ name }: { name: string }) {
	const model = useModelsSettingsModel();
	return <ModelsProviderRow name={name} model={model} />;
}

describe("useModelsSettingsModel - 自定义服务器行的测试按钮", () => {
	it("点击行内测试按钮发起可用性测试，结果回流成行内延迟徽标", async () => {
		const models = installVettaApi();
		const user = userEvent.setup();
		render(<ProviderRowHarness name="relay" />);

		await user.click(screen.getByRole("button", { name: "testProviderAvailability" }));

		expect(models.testProvider).toHaveBeenCalledWith("relay");
		await waitFor(() => expect(screen.getByText("120ms")).toBeTruthy());
	});

	it("测试进行中禁止重复点击，完成后按钮恢复可用", async () => {
		let resolveTest: (value: ProviderTestResult) => void = () => undefined;
		installVettaApi({
			testProvider: vi.fn(
				() =>
					new Promise<ProviderTestResult>((resolve) => {
						resolveTest = resolve;
					}),
			),
		});
		const user = userEvent.setup();
		render(<ProviderRowHarness name="relay" />);
		const button = screen.getByRole("button", { name: "testProviderAvailability" }) as HTMLButtonElement;

		await user.click(button);
		expect(button.disabled).toBe(true);

		await act(async () => resolveTest({ ok: true, latencyMs: 300, modelCount: 1 }));
		await waitFor(() => expect(screen.getByText("300ms")).toBeTruthy());
		expect(button.disabled).toBe(false);
	});
});

describe("providerTestChip", () => {
	const t = ((key: string, options?: Record<string, unknown>) =>
		options ? `${key}:${JSON.stringify(options)}` : key) as unknown as TFunction<"settings">;

	it("可用时给延迟标签并按 ccswitch 分级给色（≤500 绿 / ≤1000 黄 / >1000 红）", () => {
		expect(providerTestChip({ ok: true, latencyMs: 230, modelCount: 2 }, t)).toEqual({
			label: "230ms",
			tone: "success",
			title: 'providerTestOkModels:{"n":2}',
		});
		expect(providerTestChip({ ok: true, latencyMs: 800 }, t).tone).toBe("warn");
		expect(providerTestChip({ ok: true, latencyMs: 1500 }, t).tone).toBe("error");
	});

	it("HTTP 状态失败映射成用户可读原因：401/403 未授权、404 接口不存在、其余报状态码", () => {
		expect(providerTestChip({ ok: false, status: 401, latencyMs: 10 }, t).label).toBe("providerTestUnauthorized");
		expect(providerTestChip({ ok: false, status: 404, latencyMs: 10 }, t).label).toBe("providerTestNotFound");
		expect(providerTestChip({ ok: false, status: 502, latencyMs: 10 }, t).label).toBe(
			'providerTestHttpError:{"status":502}',
		);
	});

	it("网络层失败按错误码映射：超时、无效地址、服务商缺失", () => {
		expect(providerTestChip({ ok: false, error: "timeout" }, t).label).toBe("providerTestTimeout");
		expect(providerTestChip({ ok: false, error: "invalid-base-url" }, t).label).toBe("providerTestInvalidBaseUrl");
		expect(providerTestChip({ ok: false, error: "missing-base-url" }, t).label).toBe("fetchModelsNeedsBaseUrl");
		expect(providerTestChip({ ok: false, error: "network" }, t).label).toBe("providerTestNetwork");
	});
});
