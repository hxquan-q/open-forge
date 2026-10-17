// Copyright The Open Forge contributors.
/**
 * Compile-time source tagger (PLAN-0018 F1, dyad-component-tagger style):
 * inject `data-vetd-source="<file>:<line>:<column>"` on every JSX opening
 * element in design sources so the canvas can map a selected DOM node back to
 * its exact source location. Dev-serve only — production/export builds stay
 * clean (the react plugin only gets this babel plugin when command === "serve").
 *
 * Lives in its own file (registered in ENGINE_FILES, unit-testable) instead of
 * inline in vite.config.mjs. The column is 1-based like editors show it, and is
 * the anchor the future AST write-back (TASK-0316) fingerprints against after
 * line numbers drift.
 */
import { relative } from "node:path";

/** The attribute value for one JSX element: `<relPath>:<line>:<column>`. */
export function sourceAttrValue(relPath, loc) {
	return `${relPath}:${loc.start.line}:${loc.start.column + 1}`;
}

/**
 * Babel plugin factory. Mounted through @vitejs/plugin-react's `babel.plugins`
 * hook in vite.config.mjs; `designRootPosix` is the design bundle dir with
 * forward slashes (VETD_SRC), which decides both "is this a design source" and
 * the base for the relative path stored in the attribute.
 */
export function createSourceTagger(designRootPosix) {
	return function vetdSourceAttr({ types: t }) {
		return {
			name: "vetd-source-attr",
			visitor: {
				JSXOpeningElement(path, state) {
					const filename = state.filename ? state.filename.replaceAll("\\", "/") : null;
					if (!filename || !filename.startsWith(designRootPosix)) return;
					const loc = path.node.loc;
					if (!loc) return;
					const already = path.node.attributes.some(
						(attr) => t.isJSXAttribute(attr) && attr.name.name === "data-vetd-source",
					);
					if (already) return;
					const rel = relative(designRootPosix, filename).replaceAll("\\", "/");
					path.node.attributes.push(
						t.jsxAttribute(
							t.jsxIdentifier("data-vetd-source"),
							t.stringLiteral(sourceAttrValue(rel, loc)),
						),
					);
				},
			},
		};
	};
}
