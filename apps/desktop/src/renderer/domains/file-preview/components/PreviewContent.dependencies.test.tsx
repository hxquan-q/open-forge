// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { pluginFilePreviewsAtom } from "@shared/store/atoms";
import { createStore, Provider } from "jotai";
import { describe, expect, it, vi } from "vitest";

const editor = vi.hoisted(() => ({ evaluations: 0 }));
vi.mock("./EditableTextFileView", () => {
	editor.evaluations += 1;
	return { EditableTextFileView: () => <div>Editor</div> };
});

import { PreviewBody } from "./PreviewContent";

describe("PreviewBody startup dependencies", () => {
	it("keeps the editor module unevaluated while showing an unsupported readonly file", () => {
		expect(editor.evaluations).toBe(0);
		render(
			<Provider>
				<PreviewBody item={{ name: "archive.zip" }} />
			</Provider>,
		);
		expect(screen.getByText("archive.zip")).not.toBeNull();
		expect(editor.evaluations).toBe(0);
	});

	it("keeps plugin-owned text files on their plugin preview even when editing is requested", () => {
		const store = createStore();
		store.set(pluginFilePreviewsAtom, [
			{ pluginId: "text-plugin", extensions: ["txt"], component: () => <div>Plugin text</div> },
		]);
		render(
			<Provider store={store}>
				<PreviewBody item={{ name: "notes.txt", path: "/tmp/notes.txt" }} editable />
			</Provider>,
		);
		expect(screen.getByText("Plugin text")).not.toBeNull();
		expect(editor.evaluations).toBe(0);
	});
});
