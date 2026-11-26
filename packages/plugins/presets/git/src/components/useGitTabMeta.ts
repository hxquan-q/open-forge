// Modified by The Open Forge contributors.
import type { PluginActivityTabMetaResult, PluginActivityTabScope } from "@vetta-org/plugin-sdk";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { onGitTabProbeChange, peekGitTabProbe } from "../git/runtime";
import { ensureGitTabProbe } from "../git/tab-visibility";

/**
 * Git 标签卡的出现条件：目标工作空间是 Git 工作区（或至少是带 `.git` 的目录）时固定在
 * 标签栏里，用户无法把它关掉；不是仓库时退回「+」可添加池，让「初始化仓库」这条路径仍然
 * 可达。
 *
 * 由宿主按当前面板的工作空间调用，所以新会话页、项目详情页这类没有会话的页面也拿得到
 * 同一个判断——这正是此前只靠 conversation-changed 事件驱动的方案做不到的。
 */
export function useGitTabMeta({ cwd }: PluginActivityTabScope): PluginActivityTabMetaResult {
	const subscribe = useCallback((onChange: () => void) => onGitTabProbeChange(onChange), []);
	const getSnapshot = useCallback(() => (cwd ? (peekGitTabProbe(cwd) ?? null) : null), [cwd]);
	const probe = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	// 渲染期只读缓存；探测是副作用，放在 effect 里，结果回写后由上面的订阅触发重算。
	// 本地先行修复（上游 d753d869f 遗漏）：effect 必须随 probe 回到 null 重跑——turn-end
	// 与 git init 的 invalidateGitTabProbe 会清空缓存，但宿主的 fold 层按标签 id 键控、
	// 不重挂载本 hook，若只依赖 cwd 则缓存作废后探测永不重跑，标签卡永久退出候选。
	useEffect(() => {
		if (cwd && probe === null) ensureGitTabProbe(cwd);
	}, [cwd, probe]);

	// 还没有结论（首次探测中）：先不进入候选，避免先按错误判断抢占标签栏再跳回来。
	if (!cwd || probe === null) return null;
	return probe === "not-repo" ? { pinned: false } : { pinned: true };
}
