// Copyright The Open Forge contributors.

import { i18n } from "@shared/i18n";
import type { BrowserElementLiveEdit } from "@vetta/coding-agent/function-extensions";

/** 选区卡片发给 Agent 的用户可见正文。空评论时用预览改动或默认请求。 */
export function buildBrowserElementAgentText(input: {
	comment: string;
	target: string;
	edits: readonly BrowserElementLiveEdit[];
}): string {
	const comment = input.comment.trim();
	if (comment) return comment;
	const target = input.target.trim() || "element";
	if (input.edits.length > 0) {
		const summary = input.edits
			.map((edit) =>
				edit.kind === "style"
					? `${edit.property}: ${edit.before || "∅"} → ${edit.after || "∅"}`
					: `${edit.before || "∅"} → ${edit.after || "∅"}`,
			)
			.join("; ");
		return i18n.t("chat:browser.liveEdit.editsRequest", { target, summary });
	}
	return i18n.t("chat:browser.liveEdit.defaultRequest", { target });
}
