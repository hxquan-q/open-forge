// Copyright The Open Forge contributors.
import {
	activeSessionCwdAtom,
	readWorkspaceModeFor,
	type WorkspaceMode,
	workspaceModeByProjectAtom,
} from "@shared/store/atoms";
import { useParams, useSearch } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

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
 * 解析当前工作区的项目 cwd 与工作区模式（只读）。
 * cwd 优先级：显式传入 > 路由 path param（/project/$cwd）>
 * 路由 search（/new-session?cwd=）> 活动会话 cwd。全部缺失时模式回落默认档 work。
 *
 * 档位写入一律走 enterWorkspaceSection（版块入口，见 workspace-mode-atoms）：
 * 新会话类入口回落 work，侧边栏「Allstar自主开发」入口进入 coding。
 */
export function useWorkspaceMode(cwdOverride?: string | null): {
	cwd: string | null;
	mode: WorkspaceMode;
} {
	const params = useParams({ strict: false }) as { cwd?: string };
	const search = useSearch({ strict: false }) as { cwd?: string };
	const activeSessionCwd = useAtomValue(activeSessionCwdAtom);
	const cwd =
		cwdOverride !== undefined
			? cwdOverride
			: (decodeRouteCwd(params.cwd) ?? decodeRouteCwd(search.cwd) ?? activeSessionCwd ?? null);
	const map = useAtomValue(workspaceModeByProjectAtom);
	return { cwd, mode: readWorkspaceModeFor(map, cwd) };
}
