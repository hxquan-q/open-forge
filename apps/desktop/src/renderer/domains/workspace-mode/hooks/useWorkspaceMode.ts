// Copyright The Open Forge contributors.
import {
	activeSessionCwdAtom,
	readWorkspaceModeFor,
	type WorkspaceMode,
	workspaceModeByProjectAtom,
	writeWorkspaceMode,
} from "@shared/store/atoms";
import { useParams, useSearch } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

/**
 * 路由层携带的 cwd 按仓库约定是 URI 编码串（navigate 方显式 encodeURIComponent），
 * 这里统一解码；cwd 本身含非法转义序列时按原样使用，不因解码失败让整个 hook 崩掉。
 */
function decodeRouteCwd(value: string | undefined | null): string | null {
	if (!value) return null;
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * 解析当前工作区的项目 cwd 与工作区模式。
 * cwd 优先级：显式传入 > 路由 path param（/project/$cwd）>
 * 路由 search（/new-session?cwd=）> 活动会话 cwd。全部缺失时模式回落 coding，
 * 且 setMode 为空操作（没有可归属的项目，切换是无处持久化的假状态）。
 */
export function useWorkspaceMode(cwdOverride?: string | null): {
	cwd: string | null;
	mode: WorkspaceMode;
	setMode: (mode: WorkspaceMode) => void;
} {
	const params = useParams({ strict: false }) as { cwd?: string };
	const search = useSearch({ strict: false }) as { cwd?: string };
	const activeSessionCwd = useAtomValue(activeSessionCwdAtom);
	const cwd =
		cwdOverride !== undefined
			? cwdOverride
			: (decodeRouteCwd(params.cwd) ?? decodeRouteCwd(search.cwd) ?? activeSessionCwd ?? null);
	const map = useAtomValue(workspaceModeByProjectAtom);
	const setMap = useSetAtom(workspaceModeByProjectAtom);
	const setMode = useCallback(
		(next: WorkspaceMode) => {
			if (!cwd) return;
			setMap((prev) => writeWorkspaceMode(prev, cwd, next));
		},
		[cwd, setMap],
	);
	return { cwd, mode: readWorkspaceModeFor(map, cwd), setMode };
}
