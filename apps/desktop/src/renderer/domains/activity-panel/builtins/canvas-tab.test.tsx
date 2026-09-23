// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelContextProvider } from "../registry/context";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../components/canvas-tab/CanvasTabPanel", () => ({ CanvasTabPanel: () => null }));

const { canvasTabDefinition } = await import("./canvas-tab.js");

function wrapper({ children }: { children: ReactNode }): JSX.Element {
	return (
		<ActivityPanelContextProvider
			value={{ workspace: { id: "workspace", cwd: "/work", runtimeIds: [] }, knowledgeHistory: false }}
		>
			{children}
		</ActivityPanelContextProvider>
	);
}

describe("activity panel canvas tab", () => {
	afterEach(() => cleanup());

	it("常驻上栏，排在文件和浏览器之间，且不按内容门控", () => {
		expect(canvasTabDefinition).toMatchObject({ id: "canvas", removable: true, source: "builtin" });
		expect(canvasTabDefinition.order ?? 0).toBeGreaterThan(0);
		expect(canvasTabDefinition.order ?? 0).toBeLessThan(15);
		const indexSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");
		expect(indexSource).toContain("canvasTabDefinition");

		const meta = renderHook(() => canvasTabDefinition.useMeta(), { wrapper });
		expect(meta.result.current).toMatchObject({
			label: "activityPanel.tabs.canvas",
			icon: "icon-[solar--notes-linear]",
		});
	});
});
