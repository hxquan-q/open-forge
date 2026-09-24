import { describe, expect, it, vi } from "vitest";

/**
 * 首开性能合同：three.js 只能经懒边界按需加载。
 * 任何 settings barrel → 3D 徽章实现的静态引用都会在这里失败。
 */
vi.mock("three", () => {
	throw new Error("three.js must not be evaluated through the settings barrel");
});

describe("成就徽章懒边界", () => {
	it("settings barrel 不静态求值 three.js", async () => {
		await expect(import("./index")).resolves.toBeDefined();
		await expect(import("../index")).resolves.toBeDefined();
	});

	it("barrel 导出的 AchievementPromotionBadge3D 是懒加载壳", async () => {
		const barrel = await import("./index");
		const lazyModule = await import("./AchievementPromotionBadge3DLazy");
		expect(barrel.AchievementPromotionBadge3D).toBe(lazyModule.AchievementPromotionBadge3D);
	});
});
