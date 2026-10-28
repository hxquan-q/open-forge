// Modified by The Open Forge contributors.

import { pathBasename } from "@shared/lib/utils";
import { aiEditTargetAtom, inlineFilePreviewAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

/**
 * 文件页签的「跟随 AI 编辑」：AI 正在编辑哪个文件（{@link aiEditTargetAtom}，由普通/
 * 团队两条事件泵写入），就把内嵌预览切到哪个文件——右栏即 LLM 工作区，用户直观看到
 * 实际产出。同一文件连续编辑不重复触发；预览内容随文件变化自动刷新。
 */
export function useFollowAiFileEdits(): void {
	const target = useAtomValue(aiEditTargetAtom);
	const setPreview = useSetAtom(inlineFilePreviewAtom);
	const lastFollowedRef = useRef<string | null>(null);

	useEffect(() => {
		if (!target) return;
		if (lastFollowedRef.current === target.path) return;
		lastFollowedRef.current = target.path;
		setPreview({ name: pathBasename(target.path), path: target.path });
	}, [target, setPreview]);
}
