// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import * as pluginSdk from "@vetta-org/plugin-sdk";
import * as themeUiPlugin from "@vetta-org/theme-ui/plugin-ui";
import * as vettaUi from "@vetta-org/ui";
import { describe, expect, it } from "vitest";

const protocolSource = readFileSync(new URL("./plugin-protocol.ts", import.meta.url), "utf8");

describe("vetta-host plugin-sdk protocol", () => {
	it("forwards every public runtime export", () => {
		const forwardedExports = protocolSource
			.split(/\r?\n/u)
			.map((line) => /^export const ([A-Za-z_$][\w$]*) = sdk\.\1;$/u.exec(line.trim())?.[1])
			.filter((name): name is string => name !== undefined)
			.sort();

		expect(forwardedExports).toEqual(Object.keys(pluginSdk).sort());
	});
});

describe("vetta-host ui protocol", () => {
	it("forwards every public runtime export", () => {
		const forwardedExports = protocolSource
			.split(/\r?\n/u)
			.map((line) => /^export const ([A-Za-z_$][\w$]*) = ui\.\1;$/u.exec(line.trim())?.[1])
			.filter((name): name is string => name !== undefined)
			.sort();

		expect(forwardedExports).toEqual(Object.keys(vettaUi).sort());
	});
});

describe("vetta-host theme-ui plugin protocol", () => {
	it("forwards every public runtime export", () => {
		const forwardedExports = protocolSource
			.split(/\r?\n/u)
			.map((line) => /^export const ([A-Za-z_$][\w$]*) = themeUi\.\1;$/u.exec(line.trim())?.[1])
			.filter((name): name is string => name !== undefined)
			.sort();

		expect(forwardedExports).toEqual(Object.keys(themeUiPlugin).sort());
	});
});
