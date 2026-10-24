// Modified by The Open Forge contributors.
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import type { Extension } from "@codemirror/state";

import { getTextEditorLanguageId } from "./text-editor-language-id";

export { getTextEditorLanguageId, normalizeFileExtension } from "./text-editor-language-id";

/**
 * CodeMirror language support for the editable text preview.
 * Falls back to plain text (empty extension) when no dedicated grammar is available.
 */
export function getTextEditorLanguageExtension(extension: string): Extension {
	const langId = getTextEditorLanguageId(extension);
	switch (langId) {
		case "typescript":
			return javascript({ typescript: true });
		case "tsx":
			return javascript({ typescript: true, jsx: true });
		case "javascript":
			return javascript();
		case "jsx":
			return javascript({ jsx: true });
		case "json":
			return json();
		case "html":
			// Nested CSS/JS highlighting is enabled by default in @codemirror/lang-html.
			return html({ autoCloseTags: true });
		case "xml":
			return xml();
		case "css":
		case "scss":
		case "less":
			return css();
		case "markdown":
			return markdown();
		case "python":
			return python();
		case "yaml":
			return yaml();
		default:
			return [];
	}
}
