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

/** 每张项目卡片直接展示的会话条数；完整列表由项目空间（M1-3/4）承载。 */
const CARD_SESSIONS_LIMIT = 5;

export interface AllstarDevCardSession {
	/** Session JSONL 路径；打开会话的唯一标识。 */
	readonly path: string;
	readonly title: string;
}

export interface AllstarDevProjectCard {
	/** 项目根（sessionsMap 的 bucket key），新建/打开会话都以此为 cwd。 */
	readonly cwd: string;
	readonly projectName: string;
	readonly sessions: readonly AllstarDevCardSession[];
	/** 该项目的 coding 会话总数（超过展示上限时用于「还有 N 条」）。 */
	readonly totalSessions: number;
}

export interface AllstarDevHomePageModel {
	readonly loading: boolean;
	readonly labels: {
		readonly intro: string;
		readonly loading: string;
		readonly projectsTitle: string;
		readonly newSession: string;
		readonly moreSessions: (count: number) => string;
		readonly emptyTitle: string;
		readonly emptyHint: string;
		readonly emptyProjectLabel: string;
	};
	/** 按项目分组的开发会话卡片，按最近活跃排序；空 = 尚无任何 coding 会话。 */
	readonly projectCards: readonly AllstarDevProjectCard[];
	/** 空态引导用的项目选择（版块册 M1-3 落地前暂用现有项目清单兜底）。 */
	readonly projects: readonly { cwd: string; name: string }[];
	readonly selectedCwd: string;
	onSelectProject: (cwd: string) => void;
	onOpenSession: (cwd: string, sessionPath: string) => void;
	onStartNewSession: (cwd: string) => void;
}

/**
 * 「Allstar 自主开发」版块首页（/allstar）的连接层。版块态的可见性按 ADR-0151 决策 5/7：
 * 版块只承载 coding 会话（普通侧栏已按同一决策过滤），项目卡片从会话池按模式分组派生
 * ——版块册（allstarProjects，M1-3）落地前这是版块项目列表的临时事实源，只有存在
 * coding 会话的项目才会出现，天然与普通侧栏的项目列表分离。
 *
 * 会话数据复用 project 域的 sessionsMap（useProjectActions.loadSessions 填充、
 * onSessionsChanged 全局刷新），不建第二份列表事实源。
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

	const projectCards = useMemo<AllstarDevProjectCard[]>(() => {
		interface Group {
			readonly projectName: string;
			readonly sessions: Array<AllstarDevCardSession & { modifiedAt: number }>;
			latestModifiedAt: number;
		}
		const groups = new Map<string, Group>();
		for (const [bucketCwd, sessions] of sessionsMap) {
			for (const session of sessions) {
				if (session.agentMode !== "coding") continue;
				let group = groups.get(bucketCwd);
				if (!group) {
					group = {
						projectName: getProjectDisplayName(bucketCwd, defaultConversationCwd),
						sessions: [],
						latestModifiedAt: 0,
					};
					groups.set(bucketCwd, group);
				}
				group.latestModifiedAt = Math.max(group.latestModifiedAt, session.modifiedAt);
				group.sessions.push({
					path: session.path,
					title: sessionDisplayLabel(session),
					modifiedAt: session.modifiedAt,
				});
			}
		}
		return Array.from(groups.entries())
			.map(([cwd, group]) => ({
				cwd,
				projectName: group.projectName,
				sessions: [...group.sessions]
					.sort((left, right) => right.modifiedAt - left.modifiedAt)
					.slice(0, CARD_SESSIONS_LIMIT)
					.map(({ modifiedAt: _modifiedAt, ...item }) => item),
				totalSessions: group.sessions.length,
				latestModifiedAt: group.latestModifiedAt,
			}))
			.sort((left, right) => right.latestModifiedAt - left.latestModifiedAt)
			.map(({ latestModifiedAt: _latest, ...card }) => card);
	}, [defaultConversationCwd, sessionsMap]);

	// 空态引导的选择器暂用现有项目清单（含默认「对话」项目）；M1-3 版块册落地后替换为
	// 版块册条目 + 打开已有目录登记。
	const projectOptions = useMemo(
		() =>
			projects.map((project) => ({
				cwd: project.cwd,
				name: getProjectDisplayName(project.cwd, defaultConversationCwd),
			})),
		[defaultConversationCwd, projects],
	);

	const [selectedCwd, setSelectedCwd] = useState("");
	// 空态引导默认选默认项目 / 首个项目，保证「新建开发会话」始终可用。
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

	const onSelectProject = useCallback((cwd: string) => {
		setSelectedCwd(cwd);
	}, []);

	const onOpenSession = useCallback(
		(cwd: string, sessionPath: string) => {
			void openProjectSession(cwd, sessionPath);
		},
		[openProjectSession],
	);

	const onStartNewSession = useCallback(
		(cwd: string) => {
			if (!cwd) return;
			// 与 M0 版块入口同一条创建链路：写 coding 档后落新会话页，会话按代码模式创建。
			enterWorkspaceSection(cwd, "coding");
			void navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(cwd) } });
		},
		[navigate],
	);

	return {
		loading: !projectsInitialized,
		labels: {
			intro: t("allstarDev.home.intro"),
			loading: t("allstarDev.home.loading"),
			projectsTitle: t("allstarDev.home.projects.title"),
			newSession: t("allstarDev.home.projects.newSession"),
			moreSessions: (count: number) => t("allstarDev.home.projects.more", { count }),
			emptyTitle: t("allstarDev.home.empty.title"),
			emptyHint: t("allstarDev.home.empty.hint"),
			emptyProjectLabel: t("allstarDev.home.empty.projectLabel"),
		},
		projectCards,
		projects: projectOptions,
		selectedCwd,
		onSelectProject,
		onOpenSession,
		onStartNewSession,
	};
}
