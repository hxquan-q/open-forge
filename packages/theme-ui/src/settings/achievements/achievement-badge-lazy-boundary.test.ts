// Modified by The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import * as settingsBarrel from "../index";
import { AchievementPromotionBadge3D as lazyBadge } from "./AchievementPromotionBadge3DLazy";
import * as barrel from "./index";

/**
 * Dependency contract, not a cold-transform benchmark: Vitest hoists this mock
 * before the imports. Any static path from either barrel to three still fails
 * during module initialization, without timing unrelated Vite compilation.
 */
vi.mock("three", () => {
	throw new Error("three.js must not be evaluated through the settings barrel");
});

describe("成就徽章懒边界", () => {
	it("settings barrel 不静态求值 three.js", () => {
		expect(barrel).toBeDefined();
		expect(settingsBarrel).toBeDefined();
	});

	it("barrel 导出的 AchievementPromotionBadge3D 是懒加载壳", () => {
		expect(barrel.AchievementPromotionBadge3D).toBe(lazyBadge);
	});
});
