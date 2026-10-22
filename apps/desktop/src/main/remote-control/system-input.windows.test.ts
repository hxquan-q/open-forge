// Copyright The Open Forge contributors.
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
	names: new Set<string>(),
	send: vi.fn(() => 1),
	move: vi.fn(),
}));

vi.mock("node:module", () => ({
	createRequire: () => () => ({
		struct: (nameOrFields: string | object) => {
			if (typeof nameOrFields === "string") {
				if (native.names.has(nameOrFields)) throw new Error(`Duplicate type name '${nameOrFields}'`);
				native.names.add(nameOrFields);
			}
			return {};
		},
		union: () => ({}),
		pointer: () => ({}),
		sizeof: () => 40,
		load: () => ({
			func: (definition: string, name?: string) => {
				const target = name ?? definition;
				if (target.includes("SendInput")) return native.send;
				if (target.includes("SetCursorPos")) return native.move;
				return () => 100;
			},
		}),
	}),
}));

import { createSystemInputAdapter } from "./system-input.js";

const platform = Object.getOwnPropertyDescriptor(process, "platform");

beforeEach(() => {
	Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
	native.names.clear();
	vi.clearAllMocks();
});

afterEach(() => {
	if (platform) Object.defineProperty(process, "platform", platform);
});

it("recreates Windows input adapters without losing support or sharing their grants", () => {
	const first = createSystemInputAdapter({ enabled: false });
	const second = createSystemInputAdapter({ enabled: true });
	expect([first.supported, second.supported]).toEqual([true, true]);
	const click = { type: "pointer.button", sequence: 1, x: 0.5, y: 0.5, button: "left", action: "down" } as const;
	first.apply(click);
	expect(native.send).not.toHaveBeenCalled();
	second.apply(click);
	expect(native.send).toHaveBeenCalledTimes(1);
	second.setEnabled(false);
	first.setEnabled(true);
	first.apply(click);
	second.apply(click);
	expect(native.send).toHaveBeenCalledTimes(2);
});
