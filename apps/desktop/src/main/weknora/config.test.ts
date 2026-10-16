// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import {
	DEFAULT_WEKNORA_AGENT_ID,
	DEFAULT_WEKNORA_BASE_URL,
	DEFAULT_WEKNORA_PAGE_SIZE,
	normalizeWeKnoraConfig,
} from "./config.js";

/**
 * 配置归一化（AC-3：`baseUrl` / `defaultAgentId` 可配置并持久化）。
 *
 * 持久化的形状正确性是「换实例只改配置」的前提：磁盘上的任意内容都必须收敛到 01-spec §3.6 的
 * 稳定形状，缺省 / 非法值一律回落默认值。
 */

const DEFAULTS = {
	baseUrl: DEFAULT_WEKNORA_BASE_URL,
	defaultAgentId: DEFAULT_WEKNORA_AGENT_ID,
	pageSize: DEFAULT_WEKNORA_PAGE_SIZE,
};

describe("normalizeWeKnoraConfig（AC-3）", () => {
	it("空 / 非对象输入 → 全部回落 01-spec §3.6 默认值", () => {
		expect(normalizeWeKnoraConfig(undefined)).toEqual(DEFAULTS);
		expect(normalizeWeKnoraConfig(null)).toEqual(DEFAULTS);
		expect(normalizeWeKnoraConfig("nope")).toEqual(DEFAULTS);
	});

	it("非法字段单独回落,合法字段保留", () => {
		expect(normalizeWeKnoraConfig({ baseUrl: "", defaultAgentId: 42, pageSize: 0 })).toEqual(DEFAULTS);
		expect(normalizeWeKnoraConfig({ baseUrl: "  ", pageSize: -1 })).toEqual(DEFAULTS);
		expect(normalizeWeKnoraConfig({ pageSize: 1.5 })).toEqual(DEFAULTS);
	});

	it("合法输入原样保留(去除首尾空白)", () => {
		expect(normalizeWeKnoraConfig({ baseUrl: " http://h:8083 ", defaultAgentId: " B ", pageSize: 20 })).toEqual({
			baseUrl: "http://h:8083",
			defaultAgentId: "B",
			pageSize: 20,
		});
	});
});
