// @vitest-environment jsdom
//
// BUG-0022：当前安装没有内置沙盒 host 时，执行模式选择器只把「沙盒受限」置灰，
// 用户看不到原因，也看不到「现在到底按哪种模式跑」。这里从产品入口组件断言：
// 原因必须是数据驱动 + 已本地化的文案，并且当前实际执行模式要写在界面上。

import { i18n, initI18n } from "@shared/i18n";
import type { SessionExecutionMode } from "@shared/store/atoms";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enChat from "@/shared/i18n/locales/en/chat.json";
import zhChat from "@/shared/i18n/locales/zh/chat.json";
import { installVettaBridge } from "@/test/vetta-bridge";
import { ExecutionModeSelector } from "../components/ExecutionModeSelector";
import { useExecutionModeSelectorModel } from "./useExecutionModeSelectorModel";

/** BUG-0022 实机采证的原样快照（2026-09-25）：本机 Windows 构建没有内置沙盒 host。 */
const SANDBOX_BINARY_NOT_FOUND = {
	status: "unavailable",
	backend: null,
	platform: "win32",
	reason: "binary_not_found",
	details: "No bundled or configured Windows sandbox host binary was found.",
	checkedAt: 1,
};

const REASON = zhChat.executionModeSelector.sandboxUnavailable.reason;
const EN_REASON = enChat.executionModeSelector.sandboxUnavailable.reason;

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

function installSandboxCapability(sandbox: unknown): void {
	installVettaBridge({
		config: { get: async () => ({ sandbox, defaultExecutionMode: "full-access" }), set: async () => undefined },
	});
}

/**
 * 真实组合：产品入口组件（ExecutionModeSelector → theme-ui 视图）完全由 hook 的 view model 驱动，
 * 断言的是用户真正看得见的 DOM，而不是 hook 的内部状态。
 */
function renderSelector({
	mode = "full-access",
	onSelectMode = vi.fn(),
}: {
	mode?: SessionExecutionMode;
	onSelectMode?: (mode: SessionExecutionMode) => Promise<void> | void;
} = {}) {
	function Harness() {
		const model = useExecutionModeSelectorModel({
			cwd: "C:/workspace/app",
			mode,
			isStreaming: false,
			onSelectMode,
		});
		return <ExecutionModeSelector model={model} />;
	}
	return { onSelectMode, ...render(<Harness />) };
}

async function openMenu(mode: "sandbox" | "full-access" = "full-access"): Promise<void> {
	// 菜单关着时触发器是页面上唯一的按钮，按它当前的模式名打开。
	const label =
		mode === "sandbox" ? zhChat.executionModeSelector.sandbox.label : zhChat.executionModeSelector.fullAccess.label;
	await userEvent.setup().click(screen.getByRole("button", { name: label }));
}

beforeEach(async () => {
	localStorage.clear();
	initI18n();
	await i18n.changeLanguage("zh");
	vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

describe("沙盒能力缺失时的执行模式选择器", () => {
	it("菜单里给出数据驱动的不可用原因，并写明当前实际执行模式", async () => {
		// 文案必须先真的存在于 catalog，否则下面会变成断言 undefined。
		expect(REASON.notBundled).toBeTruthy();
		expect(zhChat.executionModeSelector.sandboxUnavailable.currentMode).toBeTruthy();

		installSandboxCapability(SANDBOX_BINARY_NOT_FOUND);
		renderSelector();
		await openMenu();

		// binary_not_found 要落到「当前安装未包含沙盒组件」，而不是把原始 reason 码甩给用户。
		const reasonLine = await screen.findByText(REASON.notBundled);
		// 主进程原文（可能是未本地化的英文/ stderr）只挂悬停提示，不混进可见文案。
		expect(reasonLine.getAttribute("title")).toBe(SANDBOX_BINARY_NOT_FOUND.details);
		// 用户必须知道现在实际按哪种模式在执行，不能把置灰的沙盒当成已生效的隔离。
		expect(screen.getByText(zhChat.executionModeSelector.sandboxUnavailable.currentMode)).toBeTruthy();
		// 措辞不得承诺用户自己能恢复：真实原因是安装包里就没有这个组件。
		expect(zhChat.executionModeSelector.sandboxUnavailable.currentMode).not.toMatch(/重新安装|重新下载|请更新|重试/);
		expect(REASON.notBundled).not.toMatch(/重新安装|重新下载|请更新|重试/);
	});

	it("不可用原因取自 i18n catalog 且中英两套都有译文", async () => {
		for (const key of ["notBundled", "notExecutable", "namespacesUnavailable", "probeFailed", "unknown"] as const) {
			// 先证明两处都真的取到了串，避免 undefined === undefined 假绿。
			expect(REASON[key]).toBeTruthy();
			expect(EN_REASON[key]).toBeTruthy();
		}
		expect(EN_REASON.notBundled).toContain("sandbox");
		expect(enChat.executionModeSelector.sandboxUnavailable.currentMode).toBeTruthy();

		installSandboxCapability(SANDBOX_BINARY_NOT_FOUND);
		renderSelector();
		await openMenu();

		// 界面上的原因是 catalog 里的原句，不是组件里另写的一串。
		expect(await screen.findByText(REASON.notBundled)).toBeTruthy();
		expect(screen.getByText(zhChat.executionModeSelector.sandboxUnavailable.currentMode)).toBeTruthy();
	});

	it("沙盒受限仍然禁用，点它不会去切换执行模式", async () => {
		installSandboxCapability(SANDBOX_BINARY_NOT_FOUND);
		const { onSelectMode } = renderSelector();
		await openMenu();

		const sandboxOption = await screen.findByRole("button", {
			name: zhChat.executionModeSelector.sandbox.label,
		});
		expect(sandboxOption.hasAttribute("disabled")).toBe(true);

		await userEvent.setup().click(sandboxOption);
		expect(onSelectMode).not.toHaveBeenCalled();
	});

	it("已选中沙盒受限但能力不可用时，不谎称当前在完全访问下运行", async () => {
		expect(zhChat.executionModeSelector.sandboxUnavailable.requestedModeNotEffective).toBeTruthy();

		installSandboxCapability(SANDBOX_BINARY_NOT_FOUND);
		renderSelector({ mode: "sandbox" });
		await openMenu("sandbox");

		expect(await screen.findByText(REASON.notBundled)).toBeTruthy();
		expect(screen.getByText(zhChat.executionModeSelector.sandboxUnavailable.requestedModeNotEffective)).toBeTruthy();
		expect(screen.queryByText(zhChat.executionModeSelector.sandboxUnavailable.currentMode)).toBeNull();
	});

	it("沙盒可用时不渲染多余说明行", async () => {
		expect(REASON.notBundled).toBeTruthy();

		installSandboxCapability({ status: "available", backend: "bundled-bwrap", platform: "linux", checkedAt: 1 });
		renderSelector();
		await openMenu();

		expect(await screen.findByRole("button", { name: zhChat.executionModeSelector.sandbox.label })).toBeTruthy();
		expect(screen.queryByText(zhChat.executionModeSelector.sandboxUnavailable.currentMode)).toBeNull();
		expect(screen.queryByText(REASON.notBundled)).toBeNull();
	});
});
