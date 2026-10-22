// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { activityPanelShellWidthTransition } from "./activity-panel-shell";

describe("activity panel shell width", () => {
	it("窗口缩放和左栏收起时外壳宽度当场落定，不再用过渡把原生页面留在较窄的一帧", () => {
		expect(activityPanelShellWidthTransition()).toBe("none");
	});
});
