// Modified by The Open Forge contributors.

import { useProjectActions } from "@domains/project/hooks/useProjects";
import { useOpenProjectSession } from "@shared/app-shell/session-open-context";
import {
	beginCodingSessionCreation,
	defaultConversationCwdAtom,
	getProjectDisplayName,
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
	/** ADR-0151：是否已登记版块册（allstarProjects）。false = 仅有 coding 会话但未归册。 */
	readonly registered: boolean;
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
		/** 已登记项目的空卡片文案（项目在册但尚无 coding 会话）。 */
		readonly emptyCardHint: string;
		readonly emptyProjectLabel: string;
		readonly openProject: string;
	};
	/** 按项目分组的开发会话卡片，按最近活跃排序；空 = 尚无任何 coding 会话。 */
	readonly projectCards: readonly AllstarDevProjectCard[];
	/** 新建开发会话的项目候选：版块册条目（ADR-0151 决策 7）；空 = 册为空，走「打开已有项目」登记。 */
	readonly projects: readonly { cwd: string; name: string }[];
	readonly selectedCwd: string;
	onSelectProject: (cwd: string) => void;
	onOpenSession: (cwd: string, sessionPath: string) => void;
	onStartNewSession: (cwd: string) => void;
	/** ADR-0151 决策 7：打开已有项目 = 在版块册登记（弹系统目录选择器）。 */
	onOpenExistingProject: () => void;
}

/**
 * 「Allstar 自主开发」版块首页（/allstar）的连接层。版块态的可见性按 ADR-0151 决策 5/7：
 * 版块只承载 coding 会话（普通侧栏已按同一决策过滤），项目卡片从会话池按模式分组派生
 * ——版块册（allstarProjects）与已加载的 coding 会话共同决定卡片集合，未归册项目的
 * coding 会话是 ADR 允许的聚合路径（可达，不保证冷启动补拉）。
 *
 * 创建候选与历史补拉的事实源是版块册本身（BUG-0154）：普通项目清单不再兜底——
 * 只登记在版块册的项目同样可补拉历史、可从选择器新建开发会话。
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

	const projectsInitialized = useAtomValue(projectsInitializedAtom);
	const sessionsMap = useAtomValue(sessionsMapAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);

	// ADR-0151 第二册：从主进程拉版块册清单（config.allstarProjects）。
	// 挂载时拉一次；openAllstar / removeAllstar 后手动 refresh。
	const [allstarProjects, setAllstarProjects] = useState<readonly { cwd: string; name?: string }[]>([]);
	const [allstarVersion, setAllstarVersion] = useState(0);
	const refreshAllstar = useCallback(() => setAllstarVersion((v) => v + 1), []);
	useEffect(() => {
		// allstarVersion 是手动刷新的重触发哨兵，本身不参与逻辑。
		void allstarVersion;
		let cancelled = false;
		void window.vetta.project
			.list()
			.then((snapshot) => {
				if (!cancelled) setAllstarProjects(snapshot.allstarProjects.map((e) => ({ cwd: e.path, name: e.name })));
			})
			.catch(() => {
				// 拉不到版块册（非阻断性）：退化为仅会话池派生卡片，不影响首页可用。
				if (!cancelled) setAllstarProjects([]);
			});
		return () => {
			cancelled = true;
		};
	}, [allstarVersion]);

	const projectCards = useMemo<AllstarDevProjectCard[]>(() => {
		interface Group {
			readonly projectName: string;
			readonly sessions: Array<AllstarDevCardSession & { modifiedAt: number }>;
			latestModifiedAt: number;
		}
		const registeredSet = new Set(allstarProjects.map((p) => p.cwd));
		const groups = new Map<string, Group>();
		const ensureGroup = (bucketCwd: string, fallbackName?: string): Group => {
			let group = groups.get(bucketCwd);
			if (!group) {
				group = {
					projectName:
						fallbackName ??
						allstarProjects.find((p) => p.cwd === bucketCwd)?.name ??
						getProjectDisplayName(bucketCwd, defaultConversationCwd),
					sessions: [],
					latestModifiedAt: 0,
				};
				groups.set(bucketCwd, group);
			}
			return group;
		};
		// 已归册的项目即使没有 coding 会话也出现（空卡片）。
		for (const entry of allstarProjects) ensureGroup(entry.cwd, entry.name);
		for (const [bucketCwd, sessions] of sessionsMap) {
			for (const session of sessions) {
				if (session.agentMode !== "coding") continue;
				const group = ensureGroup(bucketCwd);
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
				registered: registeredSet.has(cwd),
				sessions: [...group.sessions]
					.sort((left, right) => right.modifiedAt - left.modifiedAt)
					.slice(0, CARD_SESSIONS_LIMIT)
					.map(({ modifiedAt: _modifiedAt, ...item }) => item),
				totalSessions: group.sessions.length,
				latestModifiedAt: group.latestModifiedAt,
			}))
			.sort((left, right) => right.latestModifiedAt - left.latestModifiedAt)
			.map(({ latestModifiedAt: _latest, ...card }) => card);
	}, [allstarProjects, defaultConversationCwd, sessionsMap]);

	// 创建候选 = 版块册条目（BUG-0154）：册内登记名优先，缺省回落目录名归一。
	// 普通项目清单不再参与版块候选与补拉；未归册项目的 coding 会话只经会话池聚合进卡片。
	const projectOptions = useMemo(
		() =>
			allstarProjects.map((project) => ({
				cwd: project.cwd,
				name: project.name ?? getProjectDisplayName(project.cwd, defaultConversationCwd),
			})),
		[allstarProjects, defaultConversationCwd],
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
			// 与 M0 版块入口同一条创建链路：写 coding 档并登记一次性布局初始化意图
			// （beginCodingSessionCreation），随后落新会话页，会话按代码模式创建。
			beginCodingSessionCreation(cwd);
			void navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(cwd) } });
		},
		[navigate],
	);

	// ADR-0151 决策 7：版块内"打开已有项目"= 在版块册登记条目。系统对话框选目录 →
	// 主进程校验 → 落 config.allstarProjects + 信任种子 + 刷新清单。
	const onOpenExistingProject = useCallback(() => {
		void window.vetta.dialog.selectFolder().then((path) => {
			if (!path) return;
			void window.vetta.project
				.openAllstar({ path })
				.then(refreshAllstar)
				.catch(() => undefined);
		});
	}, [refreshAllstar]);

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
			emptyCardHint: t("allstarDev.home.empty.cardHint"),
			emptyProjectLabel: t("allstarDev.home.empty.projectLabel"),
			openProject: t("allstarDev.home.projects.openProject"),
		},
		projectCards,
		projects: projectOptions,
		selectedCwd,
		onSelectProject,
		onOpenSession,
		onStartNewSession,
		onOpenExistingProject,
	};
}
