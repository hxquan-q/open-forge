// Copyright The Open Forge contributors.
import type { EditableTextFileView } from "./EditableTextFileView";

type EditorComponent = typeof EditableTextFileView;
let editorPromise: Promise<EditorComponent> | undefined;

export function loadEditableTextFileView(): Promise<EditorComponent> {
	editorPromise ??= import("./EditableTextFileView")
		.then((module) => module.EditableTextFileView)
		.catch((error: unknown) => {
			editorPromise = undefined;
			throw error;
		});
	return editorPromise;
}
