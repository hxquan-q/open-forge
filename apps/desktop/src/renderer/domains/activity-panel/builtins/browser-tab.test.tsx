// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelContextProvider } from "../registry/context";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../components/BrowserPanel", () => ({ BrowserPanel: () => null }));

const { browserTabDefinition } = await import("./browser-tab.js");

function wrapper({ children }: { children: ReactNode }) {
	return (
		<ActivityPanelContextProvider value={{ workspace: { id: "ws-1", cwd: null, runtimeIds: [] }, knowledgeHistory: false }}>
			{children}
		</ActivityPanelContextProvider>
	);
}

describe("activity panel browser tab", () => {
	afterEach(cleanup);

	it("stays mountable with an empty address bar even before a URL is opened", () => {
		const meta = renderHook(() => browserTabDefinition.useMeta(), { wrapper });
		expect(meta.result.current).toMatchObject({ label: "browser.tab" });
	});
});
