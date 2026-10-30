// Modified by The Open Forge contributors.

import { pathBasename } from "@shared/lib/utils";
import type { AiEditTarget } from "@shared/store/atoms";
import { aiEditTargetAtom, inlineFilePreviewAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

/**
 * 文件页签的「跟随 AI 编辑」：AI 正在编辑哪个文件（{@link aiEditTargetAtom}，由普通/
 * 团队两条事件泵写入），就把内嵌预览切到哪个文件——右栏即 LLM 工作区，用户直观看到
 * 实际产出。跟随只由新 AI 活动触发（目标对象变化）；去重看当前实际预览而非上一次
 * AI 目标——用户手动切到别的文件后，同一文件的再次编辑仍会跟回，浏览本身不被旧
 * 目标回拉，预览已在目标文件上时也不重置（保留用户的多文件上下文）。
 */
export function useFollowAiFileEdits(): void {
	const target = useAtomValue(aiEditTargetAtom);
	const preview = useAtomValue(inlineFilePreviewAtom);
	const setPreview = useSetAtom(inlineFilePreviewAtom);
	const lastTargetRef = useRef<AiEditTarget | null>(null);

	useEffect(() => {
		if (!target) return;
		// 只跟随新 AI 活动：仅预览变化（用户浏览）不触发回拉。
		if (lastTargetRef.current === target) return;
		lastTargetRef.current = target;
		if (preview?.path === target.path) return;
		setPreview({ name: pathBasename(target.path), path: target.path });
	}, [target, preview, setPreview]);
}
