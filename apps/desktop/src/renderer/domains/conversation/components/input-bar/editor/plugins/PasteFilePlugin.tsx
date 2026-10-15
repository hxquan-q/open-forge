import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { recordInputFilesAdded } from "@shared/lib/app-monitor-events";
import { pathBasename } from "@shared/lib/utils";
import { type MentionedFile, mentionedFilesAtom } from "@shared/store/atoms";
import { useStore } from "jotai";
import { COMMAND_PRIORITY_CRITICAL, PASTE_COMMAND } from "lexical";
import { useEffect } from "react";
import { insertFileToken } from "../inputEditorHandle";
import { readClipboardReferenceFiles } from "./clipboard-images";

function isClipboardEvent(event: unknown): event is ClipboardEvent {
	return Boolean(event && typeof event === "object" && "clipboardData" in event && event.clipboardData);
}

/**
 * 粘贴文件 → 插入文件 token，与拖放、侧边栏文件选择共用同一份草稿合同。
 *
 * 只认非图片文件项：剪贴板图片有自己的落盘 + 缩略图 token 路径（PasteImagePlugin），
 * 两边的 File 集合互斥，注册顺序无关。应用内富消息剪贴板（结构化 segments）没有
 * file 项，由 StructuredClipboardPlugin 先认领，这里自然放行。
 */
export function PasteFilePlugin(): null {
	const [editor] = useLexicalComposerContext();
	const store = useStore();

	useEffect(() => {
		return editor.registerCommand(
			PASTE_COMMAND,
			(event) => {
				if (!isClipboardEvent(event)) return false;
				const clipboardData = event.clipboardData;
				if (!clipboardData) return false;
				const files = readClipboardReferenceFiles(clipboardData);
				if (files.length === 0) return false;
				// 剪贴板里确实有文件项，这次粘贴就归我们：否则默认纯文本粘贴会把文件路径当文本插进来。
				event.preventDefault();

				const seen = new Set(store.get(mentionedFilesAtom).map((file) => file.path));
				const additions: MentionedFile[] = [];
				for (const file of files) {
					const path = window.vetta.fs.pathForFile(file);
					if (!path || seen.has(path)) continue;
					seen.add(path);
					additions.push({
						path,
						name: file.name || pathBasename(path),
						isDirectory: false,
						sizeBytes: file.size,
					});
					insertFileToken(path, false);
				}
				if (additions.length > 0) recordInputFilesAdded("paste", additions);
				return true;
			},
			COMMAND_PRIORITY_CRITICAL,
		);
	}, [editor, store]);

	return null;
}
