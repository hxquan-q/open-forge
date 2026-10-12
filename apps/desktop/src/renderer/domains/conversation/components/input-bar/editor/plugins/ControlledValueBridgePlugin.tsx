// Modified by The Open Forge contributors.
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { parseInputSegments, serializeInputSegments, segmentsToText, type InputSegment } from "@shared/lib/input-tokens";
import { useEffect, useRef } from "react";
import { $applySegments, $readSegments } from "../tokens/segments";

const CONTROLLED_SYNC_TAG = "input-editor-controlled-sync";

/** Same structure and same wire identity: everything the draft text can carry. */
function sameProjectionSegment(segment: InputSegment, candidate: InputSegment | undefined): boolean {
	if (!candidate || segment.kind !== candidate.kind) return false;
	switch (segment.kind) {
		case "text":
			// Text content is covered by the canonical serialization check below: the serializer
			// synthesizes separator spaces between tokens and following text, which the editor's
			// nodes do not contain, so a character-by-character comparison never matches.
			return true;
		case "member":
			return candidate.kind === "member" && segment.memberId === candidate.memberId && segment.handle === candidate.handle;
		case "skill":
		case "scene":
			return candidate.kind === segment.kind && segment.name === candidate.name;
		case "connector":
			return candidate.kind === "connector" && segment.name === candidate.name;
		case "file":
			return candidate.kind === "file" && segment.path === candidate.path;
		case "image":
			return candidate.kind === "image" && segment.path === candidate.path;
	}
}

/**
 * Projection equality is canonical: the same serialized draft text plus the same structure.
 *
 * The team composer projects its draft from text (`parseInputSegments(draft)`), so two things never
 * round-trip through the editor's nodes: presentation metadata (`isDirectory` / `label` / `iconUrl` /
 * `alias` / `icon` / `avatar` / `meta` — owned by the editor) and the separator spaces the serializer
 * synthesizes between tokens and following text. Comparing either of them reports a difference on
 * every render, and the bridge then rebuilds the document (`$applySegments` clears the root and moves
 * the caret), cancelling IME composition on every keystroke — the "input fights the keyboard" bug
 * (BUG-0084). Structural differences the text cannot express (kind switches like text ↔ path token,
 * other paths/names, counts) still sync.
 */
function inputSegmentsEqual(left: readonly InputSegment[], right: readonly InputSegment[]): boolean {
	if (left.length !== right.length) return false;
	if (segmentsToText(left) !== segmentsToText(right)) return false;
	return left.every((segment, index) => sameProjectionSegment(segment, right[index]));
}

/** Token-aware controlled projection used by non-default conversation connectors. */
export function ControlledValueBridgePlugin({
	value,
	segments,
	onValueChange,
}: {
	readonly value: string;
	readonly segments?: readonly InputSegment[];
	readonly onValueChange: (value: string, segments?: readonly InputSegment[]) => void;
}): null {
	const [editor] = useLexicalComposerContext();
	const projectedValueRef = useRef(value);
	const onValueChangeRef = useRef(onValueChange);
	onValueChangeRef.current = onValueChange;

	useEffect(
		() =>
			editor.registerUpdateListener(({ editorState, tags }) => {
				if (tags.has(CONTROLLED_SYNC_TAG)) return;
				const segments = editorState.read(() => $readSegments());
				const next = serializeInputSegments(segments).text;
				if (next === projectedValueRef.current) return;
				projectedValueRef.current = next;
				onValueChangeRef.current(next, segments);
			}),
		[editor],
	);

	useEffect(() => {
		projectedValueRef.current = value;
		const projectedSegments = segments ?? parseInputSegments(value).segments;
		const currentSegments = editor.getEditorState().read(() => $readSegments());
		if (segmentsToText(currentSegments) === value && inputSegmentsEqual(currentSegments, projectedSegments)) return;
		editor.update(() => $applySegments(projectedSegments), { tag: CONTROLLED_SYNC_TAG });
	}, [editor, segments, value]);

	return null;
}
