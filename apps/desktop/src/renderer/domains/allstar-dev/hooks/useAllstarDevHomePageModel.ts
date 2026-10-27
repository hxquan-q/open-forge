// Modified by The Open Forge contributors.

import { useProjectActions } from "@domains/project/hooks/useProjects";
import { useOpenProjectSession } from "@shared/app-shell/session-open-context";
import {
	defaultConversationCwdAtom,
	enterWorkspaceSection,
	getProjectDisplayName,
	projectsAtom,
	projectsInitializedAtom,
	sessionDisplayLabel,
	sessionsMapAtom,
} from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/** 版块首页「近期开发会话」的展示条数；完整列表由项目空间（M1-3/4）承载。 */
const RECENT_SESSIONS_LIMIT = 8;

export interface AllstarDevRecentSession {
	/** Session JSONL 路径；打开会话的唯一标识。 */
	readonly path: string;
	/** 会话所属项目根（sessionsMap 的 bucket key），打开与归档都以此为 cwd。 */
	readonly cwd: string;
	readonly title: string;
	readonly projectName: string;
}

export interface AllstarDevProjectOption {
	readonly cwd: string;
	readonly name: string;
}

export interface AllstarDevHomePageModel {
	readonly loading: boolean;
	readonly labels: {
		readonly intro: string;
		readonly loading: string;
		readonly quickStartTitle: string;
		readonly projectLabel: string;
		readonly newSession: string;
		readonly recentTitle: string;
		readonly emptyTitle: string;
		readonly emptyHint: string;
	};
	readonly projects: readonly AllstarDevProjectOption[];
	readonly selectedCwd: string;
	readonly recentSessions: readonly AllstarDevRecentSession[];
	onSelectProject: (cwd: string) => void;
	onOpenSession: (cwd: string, sessionPath: string) => void;
	onStartNewSession: () => void;
}

/**
 * 「Allstar 自主开发」版块首页（/allstar）的连接层。版块态的可见性按 ADR-0151 决策 5/7：
 * 近期开发会话聚合全部 coding 会话（不限项目册），普通侧栏内容不受本页影响。
 *
 * 会话数据复用 project 域的 sessionsMap（useProjectActions.loadSessions 填充、
 * onSessionsChanged 全局刷新），不建第二份列表事实源；agentMode 过滤依据 listSessions
 * 随行下发的固化模式（决策 6），无记录的历史会话不算开发会话。
 */
export function useAllstarDevHomePageModel(): AllstarDevHomePageModel {
	// 文案放 project ns：版块入口标签（sidebar.nav.allstarDev）已在其中，版块首页同域；
	// 域文案膨胀后再评估独立 ns。
	const { t } = useTranslation("project");
	const navigate = useNavigate();
	const openProjectSession = useOpenProjectSession();
	const { loadSessions } = useProjectActions();

	const projects = useAtomValue(projectsAtom);
	const projectsInitialized = useAtomValue(projectsInitializedAtom);
	const sessionsMap = useAtomValue(sessionsMapAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);

	// 版块册（allstarProjects）在 M1-3 落地前，快速开始的项目选择暂用现有项目列表
	//（含默认「对话」项目）——与 M0 入口的落点口径一致，coding 会话创建不受影响。
	const projectOptions = useMemo<AllstarDevProjectOption[]>(
		() =>
			projects.map((project) => ({
				cwd: project.cwd,
				name: getProjectDisplayName(project.cwd, defaultConversationCwd),
			})),
		[defaultConversationCwd, projects],
	);

	const [selectedCwd, setSelectedCwd] = useState("");
	// 初次进入或所选项目消失时回落到默认项目 / 首个项目，保证「新建开发会话」始终可用。
	useEffect(() => {
		if (projectOptions.length === 0) return;
		if (projectOptions.some((option) => option.cwd === selectedCwd)) return;
		const fallback =
			projectOptions.find((option) => option.cwd === defaultConversationCwd)?.cwd ?? projectOptions[0].cwd;
		setSelectedCwd(fallback);
	}, [defaultConversationCwd, projectOptions, selectedCwd]);

	// 列表加载：ui-first-async——页面壳先渲染，会话数据 effect 内补齐（loadSessions 自带
	// 去重，与侧栏共用同一份请求）。项目清单变化（新增/移除）时对新 cwd 补拉。
	const projectCwds = useMemo(() => projectOptions.map((option) => option.cwd).join("\n"), [projectOptions]);
	useEffect(() => {
		if (!projectsInitialized) return;
		const cwds = projectCwds ? (projectCwds.split("\n") as string[]) : [];
		for (const cwd of cwds) {
			if (!sessionsMap.has(cwd)) void loadSessions(cwd);
		}
		// sessionsMap 不进 deps：回填后重跑没有意义（已加载的 cwd 由 loadSessions 去重），
		// 加载只由项目清单与初始化状态驱动。
	}, [loadSessions, projectCwds, projectsInitialized, sessionsMap]);

	const recentSessions = useMemo<AllstarDevRecentSession[]>(() => {
		const items: Array<AllstarDevRecentSession & { modifiedAt: number }> = [];
		for (const [bucketCwd, sessions] of sessionsMap) {
			for (const session of sessions) {
				if (session.agentMode !== "coding") continue;
				items.push({
					path: session.path,
					cwd: bucketCwd,
					title: sessionDisplayLabel(session),
					projectName: getProjectDisplayName(bucketCwd, defaultConversationCwd),
					modifiedAt: session.modifiedAt,
				});
			}
		}
		items.sort((a, b) => b.modifiedAt - a.modifiedAt);
		return items.slice(0, RECENT_SESSIONS_LIMIT).map(({ modifiedAt: _modifiedAt, ...item }) => item);
	}, [defaultConversationCwd, sessionsMap]);

	const onSelectProject = useCallback((cwd: string) => {
		setSelectedCwd(cwd);
	}, []);

	const onOpenSession = useCallback(
		(cwd: string, sessionPath: string) => {
			void openProjectSession(cwd, sessionPath);
		},
		[openProjectSession],
	);

	const onStartNewSession = useCallback(() => {
		if (!selectedCwd) return;
		// 与 M0 版块入口同一条创建链路：写 coding 档后落新会话页，会话按代码模式创建。
		enterWorkspaceSection(selectedCwd, "coding");
		void navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(selectedCwd) } });
	}, [navigate, selectedCwd]);

	return {
		loading: !projectsInitialized,
		labels: {
			intro: t("allstarDev.home.intro"),
			loading: t("allstarDev.home.loading"),
			quickStartTitle: t("allstarDev.home.quickStart.title"),
			projectLabel: t("allstarDev.home.quickStart.projectLabel"),
			newSession: t("allstarDev.home.quickStart.newSession"),
			recentTitle: t("allstarDev.home.recent.title"),
			emptyTitle: t("allstarDev.home.recent.emptyTitle"),
			emptyHint: t("allstarDev.home.recent.emptyHint"),
		},
		projects: projectOptions,
		selectedCwd,
		recentSessions,
		onSelectProject,
		onOpenSession,
		onStartNewSession,
	};
}
