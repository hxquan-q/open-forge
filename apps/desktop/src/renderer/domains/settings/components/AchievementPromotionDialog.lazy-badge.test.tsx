// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Achievement } from "../achievements";

/**
 * 首开性能合同 + 用户流程：成就升级对话框打开时 three.js 徽章实现才按需加载，
 * 懒边界解析完成后徽章照常挂载。
 */

const badgeImplEvaluated = vi.fn();
vi.mock(
	"../../../../../../../packages/theme-ui/src/settings/achievements/AchievementPromotionBadge3D",
	() => {
		badgeImplEvaluated();
		return {
			AchievementPromotionBadge3D: () => <canvas data-testid="badge3d-canvas" aria-hidden="true" />,
		};
	},
);

const { AchievementPromotionDialog } = await import("./AchievementPromotionDialog");

const achievement: Achievement = {
	id: "test-stage",
	imageUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
	frameUrl: "",
	frameDecoration: {} as Achievement["frameDecoration"],
	targetActiveMs: 0,
	surfaceColors: { backgroundColor: "#000", borderColor: "#fff" },
};

describe("成就升级对话框的 3D 徽章懒加载", () => {
	it("导入对话框不拉入 three.js 实现，打开对话框后徽章按需加载并挂载", async () => {
		// 模块图静态求值到此为止：settings barrel 已在上方 import，impl 不应被求值
		expect(badgeImplEvaluated).not.toHaveBeenCalled();

		render(<AchievementPromotionDialog achievement={achievement} onComplete={vi.fn()} />);

		await waitFor(() => expect(screen.getByTestId("badge3d-canvas")).toBeTruthy());
		expect(badgeImplEvaluated).toHaveBeenCalledOnce();
	});
});
