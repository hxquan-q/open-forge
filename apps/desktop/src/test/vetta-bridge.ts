/**
 * 测试环境的 window.vetta 桥基线。
 *
 * 渲染层大量模块在 effect 里惰性触达 `window.vetta.<surface>`（快捷键配置、终端能力探测、
 * browserTab 会话等）；没有 preload 的 jsdom 环境下缺一个面就是一次 TypeError。
 * 这里集中维护「无操作但形状正确」的默认桥面：
 * - setup.ts 在未定义 vetta 的测试文件里装它做底线；
 * - 需要特定行为的测试用 installVettaBridge({...}) 浅合并覆盖对应 surface。
 */

export function createVettaBridgeDefaults(): Record<string, unknown> {
	return {
		config: {
			get: async () => ({}),
			set: async () => undefined,
			onShortcutsChanged: () => () => {},
		},
		browserTab: {
			getSession: async () => ({ ok: false }),
			setPicker: async () => ({ ok: false }),
			cropScreenshot: async () => ({ ok: false }),
			liveEdit: async () => ({ ok: false }),
			onEvent: () => () => {},
		},
		browserView: {
			attach: async () => ({ ok: false, code: "no_window" }),
			update: async () => undefined,
			detach: async () => undefined,
			navigate: async () => ({ ok: false, code: "no_view" }),
			control: async () => undefined,
			setInputPassthrough: async () => undefined,
			onEvent: () => () => {},
		},
		ssh: {
			listPortForwards: async () => [],
			onPortForwardsChanged: () => () => {},
		},
		terminal: {
			capabilities: async () => ({ localPty: true }),
		},
	};
}

/** 浅合并安装 window.vetta：defaults 兜底，overrides 按 surface 整体替换。 */
export function installVettaBridge(overrides: Record<string, unknown> = {}): void {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { ...createVettaBridgeDefaults(), ...overrides },
	});
}
