// Copyright The Open Forge contributors.
import { archivedSessionsAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

/**
 * 把主进程持有的归档快照同步到渲染进程：首屏拉一次，之后跟随广播刷新。
 * 挂载点唯一（侧边栏项目面板），与标签同步同处，避免多处重复订阅。
 */
export function useArchivedSessionsSync(): void {
	const setArchivedSessions = useSetAtom(archivedSessionsAtom);

	useEffect(() => {
		let disposed = false;
		void window.vetta.archivedSessions
			.list()
			.then((snapshot) => {
				if (!disposed) setArchivedSessions(snapshot);
			})
			.catch(() => {
				// 读不到就维持空快照：侧边栏恢复显示全部会话，归档入口照常可用。
			});
		const unsubscribe = window.vetta.archivedSessions.onChanged((snapshot) => setArchivedSessions(snapshot));
		return () => {
			disposed = true;
			unsubscribe();
		};
	}, [setArchivedSessions]);
}
